import { ethers } from 'ethers';
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction } from '@flashbots/ethers-provider-bundle';
import logger from '../utils/logger';
import { NonceManager } from './nonceManager';
import { RawMEVOpportunity } from './mempool';
import { config } from '../config';

export class FlashbotsMEVExecutor {
    private httpProvider: ethers.JsonRpcProvider;
    private flashbotsProvider!: FlashbotsBundleProvider;
    private wallet: ethers.Wallet;
    private relaySigner: ethers.Wallet;
    private nonceManager: NonceManager;
    private chainId!: number;
   
    private readonly UNISWAP_V2_ROUTER: string;
    private readonly WETH_ADDRESS: string;
    private readonly HELPER_CONTRACT: string;

    constructor(
        rpcHttp: string,
        privateKey: string,
        relaySignerKey: string,
        helperContract: string,
        uniswapRouter: string,
        wethAddress: string
    ) {
        this.httpProvider = new ethers.JsonRpcProvider(rpcHttp);
        this.wallet = new ethers.Wallet(privateKey, this.httpProvider);
        this.relaySigner = new ethers.Wallet(relaySignerKey, this.httpProvider);
        this.nonceManager = new NonceManager(this.httpProvider, this.wallet.address);
       
        this.HELPER_CONTRACT = helperContract;
        this.UNISWAP_V2_ROUTER = uniswapRouter;
        this.WETH_ADDRESS = wethAddress;

        logger.info(`Executor wallet: ${this.wallet.address}`);
        logger.info(`Helper contract: ${this.HELPER_CONTRACT}`);
    }

    async initialize(): Promise<void> {
        this.flashbotsProvider = await FlashbotsBundleProvider.create(
            this.httpProvider,
            this.relaySigner,
            config.flashbots.relayUrl,
            'mainnet'
        );
        await this.nonceManager.initialize();

        const network = await this.httpProvider.getNetwork();
        this.chainId = Number(network.chainId);
        logger.info(`Detected chainId: ${this.chainId}`);
       
        logger.info('Flashbots executor initialized');
    }

    async executeSandwich(op: RawMEVOpportunity): Promise<boolean> {
        const profitEth = parseFloat(op.estimatedProfitEth);
        if (profitEth < config.flashbots.minProfitEth) {
            logger.info(`Skipped sandwich: estimated profit ${profitEth} ETH < min ${config.flashbots.minProfitEth} ETH`);
            return false;
        }

        const [frontNonce, backNonce] = this.nonceManager.getNextNoncePair();

        const feeData = await this.httpProvider.getFeeData();
        if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
            logger.error('Could not fetch gas fees');
            await this.nonceManager.handleBundleFailure();
            return false;
        }

        // Determine gas estimates (front, victim, back)
        const frontGasLimit = 300_000n;
        const backGasLimit = 350_000n;
        const victimGasLimit = op.targetTxParsed.gasLimit ?? 200_000n;

        // Calculate net profit after gas cost
        const maxFee = feeData.maxFeePerGas;
        const totalGasCostWei =
            frontGasLimit * maxFee +
            victimGasLimit * maxFee +
            backGasLimit * maxFee;

        const estimatedProfitWei = ethers.parseEther(op.estimatedProfitEth);
        const netProfitWei = estimatedProfitWei > totalGasCostWei
            ? estimatedProfitWei - totalGasCostWei
            : 0n;

        // Check against minimum NET profit threshold
        const minProfitWei = ethers.parseEther(config.flashbots.minProfitEth.toString());
        if (netProfitWei < minProfitWei) {
            logger.info(`Net profit too low: ${ethers.formatEther(netProfitWei)} ETH < min ${config.flashbots.minProfitEth} ETH`);
            await this.nonceManager.handleBundleFailure();
            return false;
        }

        // Calculate validator bribe (80% of net profit)
        const bribeAmountWei = netProfitWei * 80n / 100n;
        const bribePriorityFeePerGas = bribeAmountWei / backGasLimit;
        const backRunPriorityFee = feeData.maxPriorityFeePerGas + bribePriorityFeePerGas;

        // Build front-run transaction
        const tradeAmount = ethers.parseEther('0.1');
        const frontTxSigned = await this.wallet.signTransaction({
            to: this.UNISWAP_V2_ROUTER,
            data: this.encodeFrontRunSwap(op.tokenOut, tradeAmount),
            value: tradeAmount,
            gasLimit: frontGasLimit,
            maxFeePerGas: feeData.maxFeePerGas * 12n / 10n,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 12n / 10n,
            nonce: frontNonce,
            chainId: this.chainId,
            type: 2
        });

        // Build back-run transaction (with bribe)
        const backTxSigned = await this.wallet.signTransaction({
            to: this.HELPER_CONTRACT,
            data: this.encodeBackRunSwap(op.tokenOut),
            value: 0n,
            gasLimit: backGasLimit,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: backRunPriorityFee,
            nonce: backNonce,
            chainId: this.chainId,
            type: 2
        });

        // Prepare bundle transactions
        const signedBundle: FlashbotsBundleRawTransaction[] = [
            { signedTransaction: frontTxSigned },
            { signedTransaction: op.targetTxRaw },
            { signedTransaction: backTxSigned }
        ];

        const currentBlock = await this.httpProvider.getBlockNumber();
        const targetBlock = currentBlock + 1;

        logger.info(`Sending bundle for block ${targetBlock} with nonces [${frontNonce}, ${backNonce}]`);

        try {
            const bundle = await this.flashbotsProvider.sendRawBundle(signedBundle, targetBlock);

            const sim = await bundle.simulate();
            if ('error' in sim) {
                logger.warn(`Bundle simulation error: ${sim.error.message}`);
                await this.nonceManager.handleBundleFailure();
                return false;
            }

            const res = await bundle.wait();
            if (res === 0) {
                logger.info(`Bundle included!`);
                this.nonceManager.confirmBundle(frontNonce, backNonce);
                return true;
            } else {
                logger.warn(`Bundle not included, resolution code: ${res}`);
                await this.nonceManager.handleBundleFailure();
                return false;
            }
        } catch (e) {
            logger.error('Bundle submission failed:', e);
            await this.nonceManager.handleBundleFailure();
            return false;
        }
    }

    private encodeFrontRunSwap(tokenOut: string, amountIn: bigint): string {
        const iface = new ethers.Interface([
          'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)'
        ]);
        const path = [this.WETH_ADDRESS, tokenOut];
        const deadline = Math.floor(Date.now() / 1000) + 300;

        return iface.encodeFunctionData('swapExactETHForTokens', [
          0,
          path,
          this.HELPER_CONTRACT,
          deadline
        ]);
    }

    private encodeBackRunSwap(tokenOut: string): string {
        const iface = new ethers.Interface([
          'function executeBackRunSwap(address token, address profitRecipient)'
        ]);
        return iface.encodeFunctionData('executeBackRunSwap', [
          tokenOut,
          this.wallet.address
        ]);
    }

    async periodicResync(): Promise<void> {
        // Assuming NonceManager has this method for safety/resync
        // await this.nonceManager.resyncIfNeeded();
    }
}
