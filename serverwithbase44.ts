// --- src/api/apiServerWithBase44.ts (Placeholder/Legacy Server) ---
import express, { Application, Request, Response } from 'express';
import { Server } from 'http';
import { base44Connector } from '../index'; // Adjusted import path
import logger from '../utils/logger'; // Adjusted import path
import { config } from '../config'; // Adjusted import path

class ApiServer {
    private app: Application;
    private server: Server | null = null;

    constructor() {
        this.app = express();
        this.app.use(express.json());
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.app.get('/health', (req: Request, res: Response) => {
            res.status(200).send({ status: 'ok', base44Status: base44Connector.connect ? 'check required' : 'unknown' });
        });

        this.app.post('/trade', async (req: Request, res: Response) => {
            try {
                // Example trade route logic
                const tradeResult = await base44Connector.executeTrade(req.body);
                res.status(200).json(tradeResult);
            } catch (error) {
                logger.error('Trade execution error:', error);
                res.status(500).json({ success: false, message: 'Trade failed' });
            }
        });
    }

    public start(): void {
        const port = config.server.port;
        this.server = this.app.listen(port, () => {
            logger.info(`API Server listening on port ${port}`);
        });
    }

    public stop(): void {
        if (this.server) {
            this.server.close(() => {
                logger.info('API Server gracefully stopped.');
            });
        }
    }
}

export const apiServerWithBase44 = new ApiServer();


// --- src/api/APIServer.ts (Main API Server) ---
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Server as WebSocketServer } from 'ws';
import { config } from '../config';
import { tradingEngine } from '../engine/tradingEngine';
import { strategyRegistry } from '../strategies/strategyRegistry';
import { priceFeedAggregator } from '../market/priceFeeds';
import { flashLoanEngine } from '../flashloan/flashLoanEngine';
import { walletManager } from '../blockchain/wallet';
import { blockchainProvider } from '../blockchain/provider';
import logger from '../utils/logger';

export class APIServer {
    private app: express.Application;
    private wsServer: WebSocketServer | null = null;
    private wsClients: Set<any> = new Set();

    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupEventListeners();
    }

    private setupMiddleware(): void {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(compression());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        this.app.use((req: Request, res: Response, next: NextFunction) => {
            logger.info(`${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes(): void {
        // Health check
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'ok',
                timestamp: Date.now(),
                uptime: process.uptime()
            });
        });

        // System status
        this.app.get('/api/status', async (req: Request, res: Response) => {
            try {
                const status = tradingEngine.getSystemStatus();
                const balances = await walletManager.getAllBalances();
                
                res.json({
                    ...status,
                    balances,
                    providerHealth: blockchainProvider.getHealthStatus()
                });
            } catch (error) {
                logger.error('Error getting status:', error);
                res.status(500).json({ error: 'Failed to get status' });
            }
        });

        // Start trading engine
        this.app.post('/api/start', async (req: Request, res: Response) => {
            try {
                if (tradingEngine.isEngineRunning()) {
                    return res.status(400).json({ error: 'Engine already running' });
                }

                await tradingEngine.start();
                flashLoanEngine.startScanning();

                res.json({
                    success: true,
                    message: 'Trading engine started',
                    timestamp: Date.now()
                });
            } catch (error) {
                logger.error('Error starting engine:', error);
                res.status(500).json({ error: 'Failed to start engine' });
            }
        });

        // Start UHF engine
        this.app.post('/api/start-uhf', async (req: Request, res: Response) => {
            try {
                const { ultraHighFrequencyEngine } = await import('../engine/ultraHighFrequencyEngine');
                const { autoWithdrawSystem } = await import('../profit/autoWithdraw');

                await ultraHighFrequencyEngine.start();
                autoWithdrawSystem.start(60);

                res.json({
                    success: true,
                    message: 'Ultra-high-frequency engine started',
                    timestamp: Date.now()
                });
            } catch (error) {
                logger.error('Error starting UHF engine:', error);
                res.status(500).json({ error: 'Failed to start UHF engine' });
            }
        });

        // Stop trading engine
        this.app.post('/api/stop', async (req: Request, res: Response) => {
            try {
                if (!tradingEngine.isEngineRunning()) {
                    return res.status(400).json({ error: 'Engine not running' });
                }

                await tradingEngine.stop();
                flashLoanEngine.stopScanning();

                res.json({
                    success: true,
                    message: 'Trading engine stopped',
                    timestamp: Date.now()
                });
            } catch (error) {
                logger.error('Error stopping engine:', error);
                res.status(500).json({ error: 'Failed to stop engine' });
            }
        });

        // Get metrics
        this.app.get('/api/metrics', (req: Request, res: Response) => {
            try {
                const metrics = tradingEngine.getPerformanceMetrics();
                res.json(metrics);
            } catch (error) {
                logger.error('Error getting metrics:', error);
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        });

        // Get strategies
        this.app.get('/api/strategies', (req: Request, res: Response) => {
            try {
                const { type, risk, active } = req.query;
                
                let strategies = strategyRegistry.getAllStrategies();

                if (type) {
                    strategies = strategies.filter(s => s.type === type);
                }

                if (risk) {
                    strategies = strategies.filter(s => s.riskLevel === risk);
                }

                if (active === 'true') {
                    strategies = strategies.filter(s => s.enabled);
                }

                res.json({
                    total: strategies.length,
                    strategies: strategies.map(s => ({
                        id: s.id,
                        name: s.name,
                        type: s.type,
                        riskLevel: s.riskLevel,
                        enabled: s.enabled,
                        priority: s.priority,
                        successRate: s.successRate,
                        totalTrades: s.totalTrades,
                        totalProfitUSD: s.totalProfitUSD
                    }))
                });
            } catch (error) {
                logger.error('Error getting strategies:', error);
                res.status(500).json({ error: 'Failed to get strategies' });
            }
        });

        // Get prices
        this.app.get('/api/prices', (req: Request, res: Response) => {
            try {
                const { token, source } = req.query;

                if (token) {
                    const price = priceFeedAggregator.getPrice(token as string, source as string);
                    return res.json(price);
                }

                const allPrices = priceFeedAggregator.getAllPrices();
                const pricesArray = Array.from(allPrices.values());

                res.json({
                    total: pricesArray.length,
                    prices: pricesArray
                });
            } catch (error) {
                logger.error('Error getting prices:', error);
                res.status(500).json({ error: 'Failed to get prices' });
            }
        });

        // Get flash loan opportunities
        this.app.get('/api/flashloans', (req: Request, res: Response) => {
            try {
                const opportunities = flashLoanEngine.getOpportunities();
                const best = flashLoanEngine.getBestOpportunity();
                const stats = flashLoanEngine.getStatistics();

                res.json({
                    total: opportunities.length,
                    opportunities,
                    best,
                    statistics: stats
                });
            } catch (error) {
                logger.error('Error getting flash loan opportunities:', error);
                res.status(500).json({ error: 'Failed to get flash loan opportunities' });
            }
        });

        // Get wallet balance
        this.app.get('/api/wallet/balance', async (req: Request, res: Response) => {
            try {
                const balances = await walletManager.getAllBalances();
                
                res.json({
                    address: walletManager.getAddress(),
                    balances
                });
            } catch (error) {
                logger.error('Error getting balance:', error);
                res.status(500).json({ error: 'Failed to get balance' });
            }
        });

        // Get fund stats
        this.app.get('/api/funds/stats', async (req: Request, res: Response) => {
            try {
                const { fundManager } = await import('../profit/fundManager');
                const stats = fundManager.getStatistics();
                res.json(stats);
            } catch (error) {
                logger.error('Error getting fund stats:', error);
                res.status(500).json({ error: 'Failed to get fund stats' });
            }
        });

        // Withdraw all profits
        this.app.post('/api/withdraw-all', async (req: Request, res: Response) => {
            try {
                const { autoWithdrawSystem } = await import('../profit/autoWithdraw');
                await autoWithdrawSystem.withdrawAll();
                res.json({
                    success: true,
                    message: 'All profits withdrawn'
                });
            } catch (error) {
                logger.error('Error withdrawing all:', error);
                res.status(500).json({ error: 'Failed to withdraw all' });
            }
        });

        // Error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.error('Unhandled error:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message
            });
        });
    }

    private setupWebSocket(): void {
        this.wsServer = new WebSocketServer({ port: config.server.wsPort });

        this.wsServer.on('connection', (ws) => {
            logger.info('WebSocket client connected');
            this.wsClients.add(ws);

            ws.on('close', () => {
                logger.info('WebSocket client disconnected');
                this.wsClients.delete(ws);
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error:', error);
                this.wsClients.delete(ws);
            });
        });
    }

    private setupEventListeners(): void {
        tradingEngine.on('performance_update', (metrics) => {
            this.broadcast({
                type: 'performance',
                data: metrics
            });
        });
    }

    private broadcast(message: any): void {
        const data = JSON.stringify(message);
        
        this.wsClients.forEach((client) => {
            if (client.readyState === 1) {
                try {
                    client.send(data);
                } catch (error) {
                    logger.error('Error broadcasting to client:', error);
                }
            }
        });
    }

    public start(): void {
        this.app.listen(config.server.port, () => {
            logger.info(`API Server started on port ${config.server.port}`);
            logger.info(`Environment: ${config.server.environment}`);
        });
    }

    public stop(): void {
        if (this.wsServer) {
            this.wsServer.close();
            logger.info('WebSocket server stopped');
        }
    }
}

export const apiServer = new APIServer();


// --- src/utils/tradeLogger.ts ---
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from 'chalk';

export interface TradeRecord {
    id: string;
    timestamp: number;
    blockNumber: number;
    
    status: 'pending' | 'success' | 'failed';
    tokenA: {
        symbol: string;
        address: string;
        amount: string;
    };
    tokenB: {
        symbol: string;
        address: string;
        amount: string;
    };
    
    buyDex: string;
    sellDex: string;
    
    borrowAmount: string;
    expectedProfit: string;
    actualProfit?: string;
    gasUsed?: string;
    gasCost?: string;
    gasCostUSD?: string;
    netProfit?: string;
    netProfitUSD?: string;
    profitPercent?: string;
    
    txHash?: string;
    txStatus?: number;
    executionTime?: number;
    
    error?: string;
    errorStack?: string;
}

export class TradeLogger {
    private tradesFile: string;
    private summaryFile: string;
    private csvFile: string;
    
    private totalTrades: number = 0;
    private successfulTrades: number = 0;
    private failedTrades: number = 0;
    private totalProfit: bigint = 0n;
    private totalGasCost: bigint = 0n;
    
    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        this.tradesFile = path.join(logsDir, `trades-${today}.json`);
        this.summaryFile = path.join(logsDir, 'summary.json');
        this.csvFile = path.join(logsDir, `trades-${today}.csv`);
        
        if (!fs.existsSync(this.csvFile)) {
            const headers = 'Timestamp,Trade ID,Status,Token Pair,Buy DEX,Sell DEX,Borrow Amount,Expected Profit,Actual Profit,Gas Cost,Net Profit,Profit %,TX Hash,Block\n';
            fs.writeFileSync(this.csvFile, headers);
        }
        
        this.loadSummary();
    }
    
    logTrade(trade: TradeRecord): void {
        this.totalTrades++;
        
        if (trade.status === 'success') {
            this.successfulTrades++;
            if (trade.netProfit) {
                try {
                    this.totalProfit += ethers.parseEther(trade.netProfit);
                } catch {
                    // Skip if can't parse
                }
            }
        } else if (trade.status === 'failed') {
            this.failedTrades++;
        }
        
        if (trade.gasCost) {
            try {
                this.totalGasCost += ethers.parseEther(trade.gasCost);
            } catch {
                // Skip
            }
        }
        
        this.appendToJsonFile(trade);
        this.appendToCsvFile(trade);
        this.saveSummary();
        this.consoleLogTrade(trade);
    }
    
    private appendToJsonFile(trade: TradeRecord): void {
        let trades: TradeRecord[] = [];
        
        if (fs.existsSync(this.tradesFile)) {
            try {
                const content = fs.readFileSync(this.tradesFile, 'utf-8');
                trades = JSON.parse(content);
            } catch {
                trades = [];
            }
        }
        
        trades.push(trade);
        fs.writeFileSync(this.tradesFile, JSON.stringify(trades, null, 2));
    }
    
    private appendToCsvFile(trade: TradeRecord): void {
        const row = [
            new Date(trade.timestamp).toISOString(),
            trade.id,
            trade.status,
            `${trade.tokenA.symbol}/${trade.tokenB.symbol}`,
            trade.buyDex,
            trade.sellDex,
            trade.borrowAmount,
            trade.expectedProfit,
            trade.actualProfit || 'N/A',
            trade.gasCost || 'N/A',
            trade.netProfit || 'N/A',
            trade.profitPercent || 'N/A',
            trade.txHash || 'N/A',
            trade.blockNumber || 'N/A'
        ].join(',') + '\n';
        
        fs.appendFileSync(this.csvFile, row);
    }
    
    private consoleLogTrade(trade: TradeRecord): void {
        console.log('\n' + chalk.gray('═'.repeat(80)));
        
        if (trade.status === 'pending') {
            console.log(chalk.yellow(`⏳ TRADE PENDING: ${trade.id}`));
        } else if (trade.status === 'success') {
            console.log(chalk.green(`✅ TRADE SUCCESS: ${trade.id}`));
        } else {
            console.log(chalk.red(`❌ TRADE FAILED: ${trade.id}`));
        }
        
        console.log(chalk.gray(`   ${new Date(trade.timestamp).toLocaleString()}`));
        console.log(chalk.cyan(`   Pair: ${trade.tokenA.symbol}/${trade.tokenB.symbol}`));
        console.log(chalk.cyan(`   ${trade.buyDex} → ${trade.sellDex}`));
        console.log(chalk.cyan(`   Borrow: ${trade.borrowAmount} ${trade.tokenA.symbol}`));
        console.log(chalk.cyan(`   Expected: ${trade.expectedProfit}`));
        
        if (trade.actualProfit) {
            console.log(chalk.green(`   Actual Profit: ${trade.actualProfit}`));
        }
        
        if (trade.gasCost) {
            console.log(chalk.yellow(`   Gas: ${trade.gasCost}`));
        }
        
        if (trade.netProfit) {
            const isProfit = parseFloat(trade.netProfit) > 0;
            console.log(isProfit 
                ? chalk.green.bold(`   Net: +${trade.netProfit}`) 
                : chalk.red(`   Net: ${trade.netProfit}`)
            );
        }
        
        if (trade.txHash) {
            console.log(chalk.blue(`   TX: ${trade.txHash}`));
        }
        
        if (trade.error) {
            console.log(chalk.red(`   Error: ${trade.error}`));
        }
        
        console.log(chalk.gray('═'.repeat(80)));
    }
    
    private loadSummary(): void {
        if (fs.existsSync(this.summaryFile)) {
            try {
                const summary = JSON.parse(fs.readFileSync(this.summaryFile, 'utf-8'));
                this.totalTrades = summary.totalTrades || 0;
                this.successfulTrades = summary.successfulTrades || 0;
                this.failedTrades = summary.failedTrades || 0;
                this.totalProfit = BigInt(summary.totalProfit || 0);
                this.totalGasCost = BigInt(summary.totalGasCost || 0);
            } catch {
                // Start fresh
            }
        }
    }
    
    private saveSummary(): void {
        const summary = {
            totalTrades: this.totalTrades,
            successfulTrades: this.successfulTrades,
            failedTrades: this.failedTrades,
            successRate: this.totalTrades > 0 
                ? ((this.successfulTrades / this.totalTrades) * 100).toFixed(2) 
                : '0.00',
            totalProfit: this.totalProfit.toString(),
            totalGasCost: this.totalGasCost.toString(),
            netProfit: (this.totalProfit - this.totalGasCost).toString(),
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2));
    }
    
    getStatistics() {
        return {
            totalTrades: this.totalTrades,
            successfulTrades: this.successfulTrades,
            failedTrades: this.failedTrades,
            successRate: this.totalTrades > 0 
                ? ((this.successfulTrades / this.totalTrades) * 100).toFixed(2) 
                : '0.00',
            totalProfit: ethers.formatEther(this.totalProfit),
            totalGasCost: ethers.formatEther(this.totalGasCost),
            netProfit: ethers.formatEther(this.totalProfit - this.totalGasCost)
        };
    }
    
    printStatistics(): void {
        const stats = this.getStatistics();
        
        console.log('\n' + chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan.bold('📊 TRADING STATISTICS'));
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(chalk.blue(`Total Trades: ${stats.totalTrades}`));
        console.log(chalk.green(`Successful: ${stats.successfulTrades}`));
        console.log(chalk.red(`Failed: ${stats.failedTrades}`));
        console.log(chalk.yellow(`Success Rate: ${stats.successRate}%`));
        console.log(chalk.green(`Total Profit: ${stats.totalProfit} ETH`));
        console.log(chalk.yellow(`Total Gas: ${stats.totalGasCost} ETH`));
        console.log(chalk.magenta.bold(`Net Profit: ${stats.netProfit} ETH`));
        console.log(chalk.cyan('═'.repeat(60)) + '\n');
    }
}


// --- package.json placeholder ---
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "rootDir": ".",
    "outDir": "./dist",
    "sourceMap": true,
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false
  },
  "include": ["index.js", "mev_backend.js", "src/**/*.js"],
  "exclude": ["node_modules", "dist"]
}

// --- src/utils.js placeholder ---
function log(message) {
    console.log(`[LOG] ${message}`);
}

module.exports = { log };
