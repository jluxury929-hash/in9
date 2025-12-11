import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { logTrade, logError, logInfo, logSuccess, logWarning } from './utils/logger'; 
import { TradeLogger, TradeRecord } from './utils/tradeLogger'; 
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const YOUR_CONTRACT_ADDRESS = '0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0';
const MIN_PROFIT_PERCENT = 0.15; 
const MAX_GAS_COST_GWEI = 50n;

interface ChainConfig {
    name: string;
    rpcHttp: string;
    rpcWss: string;
    chainId: number;
    gasToken: string;
    dexes: DEXConfig[];
    tokens: TokenConfig[];
    maxPriorityFee: bigint;
    minBalance: string;
}

interface DEXConfig {
    name: string;
    router: string;
    factory: string;
}

interface TokenConfig {
    symbol: string;
    address: string;
    decimals: number;
}

interface Opportunity {
    id: string;
    tokenA: TokenConfig;
    tokenB: TokenConfig;
    buyDex: string; 
    sellDex: string; 
    buyDexName: string;
    sellDexName: string;
    profitPercent: number;
    estimatedProfit: ethers.BigNumber;
    borrowAmount: ethers.BigNumber;
    pairBorrow: string;
}

const POLYGON_CONFIG: ChainConfig = {
    name: 'Polygon',
    rpcHttp: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    rpcWss: process.env.POLYGON_WSS || 'wss://polygon-bor.publicnode.com',
    chainId: 137,
    gasToken: 'MATIC',
    maxPriorityFee: ethers.utils.parseUnits(MAX_GAS_COST_GWEI.toString(), 'gwei').toBigInt(),
    minBalance: '0.5',
    
    dexes: [
        { name: 'QuickSwap', router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32' },
        { name: 'SushiSwap', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4' },
    ],
    tokens: [
        { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
        { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
        { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    ]
};

const BSC_CONFIG: ChainConfig = {
    name: 'BSC',
    rpcHttp: process.env.BSC_RPC || 'https://bsc-dataseed1.binance.org',
    rpcWss: process.env.BSC_WSS || 'wss://bsc-ws-node.nariox.org',
    chainId: 56,
    gasToken: 'BNB',
    maxPriorityFee: ethers.utils.parseUnits('3', 'gwei').toBigInt(), 
    minBalance: '0.002',
    
    dexes: [
        { name: 'PancakeSwap', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73' },
        { name: 'BiSwap', router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE' },
    ],
    tokens: [
        { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
        { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
        { symbol: 'BUSD', address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', decimals: 18 }
    ]
};

class FlashLoanArbitrageBot {
    private provider: ethers.providers.JsonRpcProvider;
    private wsProvider: ethers.providers.WebSocketProvider;
    private wallet: ethers.Wallet;
    private config: ChainConfig;
    private contract: ethers.Contract;
    private tradeLogger: TradeLogger;
    
    private isRunning: boolean = false;

    private readonly CONTRACT_ABI = [
        'function executeArbitrage(address tokenBorrow, uint256 amountToBorrow, address routerBuy, address routerSell, address[] calldata pathBuy, address[] calldata pathSell) external',
        'event ArbitrageExecuted(address indexed tokenBorrowed, uint256 amount, uint256 profit, address dexBuy, address dexSell)'
    ];
    
    private readonly ROUTER_ABI = [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
    ];
    
    private readonly FACTORY_ABI = [
        'function getPair(address tokenA, address tokenB) external view returns (address pair)'
    ];
    
    constructor(config: ChainConfig, privateKey: string) {
        this.config = config;
        this.provider = new ethers.providers.JsonRpcProvider(config.rpcHttp);
        this.wsProvider = new ethers.providers.WebSocketProvider(config.rpcWss);
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.contract = new ethers.Contract(YOUR_CONTRACT_ADDRESS, this.CONTRACT_ABI, this.wallet);
        this.tradeLogger = new TradeLogger();
        
        logInfo('Bot initialized', {
            chain: config.name,
            wallet: this.wallet.address,
            contract: YOUR_CONTRACT_ADDRESS
        });
    }
    
    async start(): Promise<void> {
        await this.verifySetup();
        
        this.isRunning = true;
        logSuccess('Bot started successfully');
        
        console.log('\n✅ Bot LIVE! Scanning for opportunities...\n');
        
        this.scanContinuously();
        
        this.contract.on('ArbitrageExecuted', (tokenBorrowed, amount, profit, dexBuy, dexSell, event) => {
            logSuccess('PROFIT MADE!', {
                profit: ethers.utils.formatUnits(profit, this.config.tokens.find(t => t.address === tokenBorrowed)?.decimals || 18),
                txHash: event.transactionHash
            });
        });
    }
    
    async verifySetup(): Promise<void> {
        logInfo('Verifying setup...');
        
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceFormatted = ethers.utils.formatEther(balance);
        const minBalance = ethers.utils.parseEther(this.config.minBalance);
        
        logInfo(`Wallet Balance: ${balanceFormatted} ${this.config.gasToken}`);
        
        if (balance.lt(minBalance)) {
            logError('Insufficient balance', { required: this.config.minBalance, found: balanceFormatted });
            throw new Error('Insufficient balance for gas reserve. Please fund the wallet.');
        }
        
        const blockNumber = await this.provider.getBlockNumber();
        logSuccess(`RPC connected (Block: ${blockNumber})`);
    }
    
    private async scanContinuously(): Promise<void> {
        while (this.isRunning) {
            try {
                await this.scanAllPairs();
                
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error: any) {
                logError('Scan error', { message: error.message });
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    
    private async scanAllPairs(): Promise<void> {
        const opportunities: Opportunity[] = [];
        
        const tokens = this.config.tokens;
        
        for (let i = 0; i < tokens.length; i++) {
            for (let j = i + 1; j < tokens.length; j++) {
                opportunities.push(...await this.findArbitrage(tokens[i], tokens[j]));
            }
        }
        
        if (opportunities.length > 0) {
            opportunities.sort((a, b) => b.estimatedProfit.sub(a.estimatedProfit).isNegative() ? -1 : 1);
            
            const topOpp = opportunities[0];
            if (topOpp.profitPercent >= MIN_PROFIT_PERCENT) {
                logWarning(`High-potential opportunity found (${topOpp.profitPercent.toFixed(3)}%)`);
                await this.executeOpportunity(topOpp);
            }
        }
    }
    
    private async findArbitrage(tokenA: TokenConfig, tokenB: TokenConfig): Promise<Opportunity[]> {
        const baseBorrowAmount = ethers.utils.parseUnits('100', tokenA.decimals);
        
        const opportunities: Opportunity[] = [];
        
        const prices: Array<{
            dex: DEXConfig;
            priceOut: ethers.BigNumber;
        }> = [];

        for (const dex of this.config.dexes) {
            try {
                const router = new ethers.Contract(dex.router, this.ROUTER_ABI, this.provider);
                const factory = new ethers.Contract(dex.factory, this.FACTORY_ABI, this.provider);
                
                const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
                if (pairAddress === ethers.constants.AddressZero) continue;
                
                const amounts = await router.getAmountsOut(baseBorrowAmount, [tokenA.address, tokenB.address]);
                prices.push({ dex, priceOut: amounts[1] });
            } catch {
                continue;
            }
        }

        for (let i = 0; i < prices.length; i++) {
            for (let j = i + 1; j < prices.length; j++) {
                const p1 = prices[i];
                const p2 = prices[j];
                
                const buyOnA = p1.priceOut.lt(p2.priceOut);
                const buyDex = buyOnA ? p1 : p2;
                const sellDex = buyOnA ? p2 : p1;
                
                try {
                    const buyRouter = new ethers.Contract(buyDex.dex.router, this.ROUTER_ABI, this.provider);
                    const sellRouter = new ethers.Contract(sellDex.dex.router, this.ROUTER_ABI, this.provider);

                    const amountsBuy = await buyRouter.getAmountsOut(baseBorrowAmount, [tokenA.address, tokenB.address]);
                    const amountBOut = amountsBuy[1];

                    const amountsSell = await sellRouter.getAmountsOut(amountBOut, [tokenB.address, tokenA.address]);
                    const amountAOut = amountsSell[1];
                    
                    const flashLoanFeeBasisPoints = 9n;
                    const multiplier = 10000n + flashLoanFeeBasisPoints;
                    const repayAmount = baseBorrowAmount.mul(multiplier).div(10000); 
                    
                    const profit = amountAOut.sub(repayAmount);
                    
                    if (profit.gt(ethers.constants.Zero)) {
                        const profitInTokenA = Number(ethers.utils.formatUnits(profit, tokenA.decimals));
                        const profitPercent = (profitInTokenA / Number(ethers.utils.formatUnits(baseBorrowAmount, tokenA.decimals))) * 100;

                        if (profitPercent >= MIN_PROFIT_PERCENT) {
                            const factory = new ethers.Contract(buyDex.dex.factory, this.FACTORY_ABI, this.provider);
                            const pairAddress = await factory.getPair(tokenA.address, tokenB.address);

                            opportunities.push({
                                id: `${tokenA.symbol}/${tokenB.symbol}`,
                                tokenA, tokenB,
                                buyDex: buyDex.dex.router,
                                sellDex: sellDex.dex.router,
                                buyDexName: buyDex.dex.name,
                                sellDexName: sellDex.dex.name,
                                profitPercent,
                                estimatedProfit: profit,
                                borrowAmount: baseBorrowAmount,
                                pairBorrow: pairAddress
                            });
                        }
                    }
                } catch (e: any) {
                    continue;
                }
            }
        }
        
        return opportunities;
    }
    
    private async executeOpportunity(opp: Opportunity): Promise<void> {
        const tradeId = `TRADE-${Date.now()}`;
        
        const tradeRecord: TradeRecord = {
            id: tradeId,
            timestamp: Date.now(),
            blockNumber: 0,
            status: 'pending',
            tokenA: { symbol: opp.tokenA.symbol, address: opp.tokenA.address, amount: ethers.utils.formatUnits(opp.borrowAmount, opp.tokenA.decimals) },
            tokenB: { symbol: opp.tokenB.symbol, address: opp.tokenB.address, amount: '0' },
            buyDex: opp.buyDexName,
            sellDex: opp.sellDexName,
            borrowAmount: ethers.utils.formatUnits(opp.borrowAmount, opp.tokenA.decimals),
            expectedProfit: ethers.utils.formatUnits(opp.estimatedProfit, opp.tokenA.decimals),
        };
        this.tradeLogger.logTrade(tradeRecord);
        
        try {
            const pathBuy = [opp.tokenA.address, opp.tokenB.address];
            const pathSell = [opp.tokenB.address, opp.tokenA.address];

            const feeData = await this.provider.getFeeData();
            const maxFee = feeData.gasPrice!.add(this.config.maxPriorityFee); 
            
            const tx = await this.contract.executeArbitrage(
                opp.tokenA.address,
                opp.borrowAmount,
                opp.buyDex,
                opp.sellDex,
                pathBuy,
                pathSell,
                {
                    gasLimit: 500000, 
                    maxPriorityFeePerGas: this.config.maxPriorityFee, 
                    maxFeePerGas: maxFee,
                }
            );
            
            logInfo('Transaction sent', { tradeId, txHash: tx.hash });
            
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                let actualProfit = opp.estimatedProfit;
                
                logSuccess('Trade successful', { tradeId, txHash: receipt.transactionHash, block: receipt.blockNumber });
                
                this.tradeLogger.logTrade({
                    ...tradeRecord,
                    status: 'success',
                    actualProfit: ethers.utils.formatUnits(actualProfit, opp.tokenA.decimals),
                    netProfit: ethers.utils.formatUnits(actualProfit.sub(receipt.gasUsed!.mul(maxFee)), opp.tokenA.decimals),
                    gasCost: ethers.utils.formatEther(receipt.gasUsed!.mul(maxFee)),
                    txHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber,
                });

            } else {
                logError('Trade failed', { tradeId, txHash: receipt.transactionHash, block: receipt.blockNumber });
                this.tradeLogger.logTrade({
                    ...tradeRecord,
                    status: 'failed',
                    error: 'Transaction reverted on chain',
                    txHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber,
                    gasCost: ethers.utils.formatEther(receipt.gasUsed!.mul(maxFee)),
                });
            }
        } catch (error: any) {
            logError('Execution error (RPC/Simulation failed)', { tradeId, error: error.message });
            this.tradeLogger.logTrade({
                ...tradeRecord,
                status: 'failed',
                error: error.message,
            });
        }
    }
    
    stop(): void {
        this.isRunning = false;
        this.wsProvider.removeAllListeners();
        logInfo('Bot stopped');
    }
}

async function main() {
    logInfo('Flash Loan Arbitrage Bot Starting...');
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logError('PRIVATE_KEY not found in .env');
        process.exit(1);
    }
    
    const chainName = process.env.CHAIN || 'POLYGON';
    const config = chainName.toUpperCase() === 'BSC' ? BSC_CONFIG : POLYGON_CONFIG;
    
    const bot = new FlashLoanArbitrageBot(config, privateKey);
    
    process.on('SIGINT', () => {
        console.log('\n\n🛑 Shutting down...\n');
        bot.stop();
        process.exit(0);
    });
    
    await bot.start();
}

main().catch((error) => {
    logError('Fatal error:', error);
    process.exit(1);
});
