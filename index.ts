import { ethers } from 'ethers';
import { config } from './config';
import logger from './utils/logger';
import { FlashbotsMEVExecutor } from './mev/flashbots';
import { MempoolMonitor, RawMEVOpportunity } from './mev/mempool';

class ProductionMEVBot {
    private executor: FlashbotsMEVExecutor;
    private mempool: MempoolMonitor;
    private httpProvider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private resyncInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.validateConfig();

        this.httpProvider = new ethers.JsonRpcProvider(config.ethereum.rpcHttp);
        this.wallet = new ethers.Wallet(config.wallet.privateKey, this.httpProvider);

        this.executor = new FlashbotsMEVExecutor(
            config.ethereum.rpcHttp,
            config.wallet.privateKey,
            config.flashbots.relaySignerKey,
            config.mev.helperContract,
            config.mev.uniswapRouter,
            config.mev.wethAddress
        );

        this.mempool = new MempoolMonitor(
            config.ethereum.rpcWss,
            config.mev.uniswapRouter,
            config.mev.wethAddress,
            0.1
        );
    }

    private validateConfig(): void {
        if (!config.wallet.privateKey || config.wallet.privateKey === 'your_private_key_here') {
            throw new Error('WALLET_PRIVATE_KEY required');
        }
        if (!config.mev.helperContract) {
            throw new Error('MEV_HELPER_CONTRACT_ADDRESS required - deploy contract first');
        }
    }

    async start(): Promise<void> {
        logger.info('='.repeat(70));
        logger.info(' PRODUCTION MEV BOT - STARTING');
        logger.info('='.repeat(70));

        // Wait for balance
        while (!(await this.checkBalance())) {
            await new Promise(r => setTimeout(r, config.trading.checkBalanceInterval));
        }

        // Initialize Flashbots
        await this.executor.initialize();

        // Start mempool monitoring with callback
        await this.mempool.start(async (opportunity: RawMEVOpportunity) => {
            logger.info(` MEV OPPORTUNITY DETECTED`);
            logger.info(`  Type: ${opportunity.type}`);
            logger.info(`  Target: ${opportunity.targetTxHash.slice(0, 10)}...`);
            logger.info(`  Amount: ${ethers.formatEther(opportunity.amountIn)} ETH`);
            logger.info(`  Est. Profit: ${opportunity.estimatedProfitEth} ETH`);

            // Execute sandwich
            const success = await this.executor.executeSandwich(opportunity);
           
            if (success) {
                logger.info(` PROFIT CAPTURED!`);
                await this.withdrawProfits();
            }
        });

        // Periodic nonce resync
        this.resyncInterval = setInterval(async () => {
            await this.executor.periodicResync();
        }, 30000);

        logger.info(' Bot fully operational');
    }

    async checkBalance(): Promise<boolean> {
        const balance = await this.httpProvider.getBalance(this.wallet.address);
        const balanceEth = parseFloat(ethers.formatEther(balance));

        logger.info(`Balance: ${balanceEth.toFixed(6)} ETH`);

        if (balanceEth >= config.wallet.minEthBalance) {
            return true;
        }

        logger.info(`Waiting for ${config.wallet.minEthBalance} ETH...`);
        return false;
    }

    async withdrawProfits(): Promise<void> {
        try {
            const balance = await this.httpProvider.getBalance(this.wallet.address);
            const balanceEth = parseFloat(ethers.formatEther(balance));
            const profitAmount = balanceEth - config.wallet.minEthBalance - config.wallet.gasReserveEth;

            if (profitAmount > 0.001) {
                logger.info(` Withdrawing ${profitAmount.toFixed(6)} ETH`);
                const tx = await this.wallet.sendTransaction({
                    to: config.wallet.profitAddress,
                    value: ethers.parseEther(profitAmount.toFixed(18))
                });
                await tx.wait();
                logger.info(` Withdrawal complete: ${tx.hash}`);
            }
        } catch (error) {
            logger.error('Withdrawal failed:', error);
        }
    }
}

(async () => {
    try {
        const bot = new ProductionMEVBot();
        await bot.start();
    } catch (error) {
        logger.error('Fatal error during startup:', error);
        process.exit(1);
    }
})();
