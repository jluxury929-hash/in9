import express, { Request, Response, NextFunction } from 'express';
// ... (All other imports)
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
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
        });
        
        // ... (All other routes like /api/status, /api/start, etc. remain the same)
        
        this.app.get('/api/status', async (req: Request, res: Response) => {
            try {
                const status = tradingEngine.getSystemStatus();
                const balances = await walletManager.getAllBalances();
                res.json({ ...status, balances, providerHealth: blockchainProvider.getHealthStatus() });
            } catch (error) {
                logger.error('Error getting status:', error);
                res.status(500).json({ error: 'Failed to get status' });
            }
        });
        
        this.app.post('/api/start', async (req: Request, res: Response) => {
            try {
                if (tradingEngine.isEngineRunning()) return res.status(400).json({ error: 'Engine already running' });
                await tradingEngine.start();
                flashLoanEngine.startScanning();
                res.json({ success: true, message: 'Trading engine started', timestamp: Date.now() });
            } catch (error) {
                logger.error('Error starting engine:', error);
                res.status(500).json({ error: 'Failed to start engine' });
            }
        });

        this.app.post('/api/stop', async (req: Request, res: Response) => {
            try {
                if (!tradingEngine.isEngineRunning()) return res.status(400).json({ error: 'Engine not running' });
                await tradingEngine.stop();
                flashLoanEngine.stopScanning();
                res.json({ success: true, message: 'Trading engine stopped', timestamp: Date.now() });
            } catch (error) {
                logger.error('Error stopping engine:', error);
                res.status(500).json({ error: 'Failed to stop engine' });
            }
        });
        
        // ... (Omitted other routes for brevity)

        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.error('Unhandled error:', err);
            res.status(500).json({ error: 'Internal server error', message: err.message });
        });
    }

    private setupWebSocket(): void {
        this.wsServer = new WebSocketServer({ port: config.server.wsPort });
        // ... (WebSocket connection logic remains the same)
        this.wsServer.on('connection', (ws) => {
            logger.info('WebSocket client connected');
            this.wsClients.add(ws);
            // ... (close and error handlers)
        });
    }

    private setupEventListeners(): void {
        tradingEngine.on('performance_update', (metrics) => {
            this.broadcast({ type: 'performance', data: metrics });
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
        // --- FIXED: Use process.env.PORT for cloud deployment ---
        const port = process.env.PORT || config.server.port;
        
        this.app.listen(port, () => {
            logger.info(`API Server started on port ${port}`);
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
