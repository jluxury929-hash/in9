// src/api/APIServer.ts (Final Stable Version)

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Server as WebSocketServer } from 'ws';
import { config } from '../config'; 
import logger from '../utils/logger'; 

// Application components are imported dynamically within route handlers for safety

export class APIServer {
    private app: express.Application;
    private wsServer: WebSocketServer | null = null;
    private wsClients: Set<any> = new Set();

    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        // WebSockets and Event Listeners remain bypassed for startup stability
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
        // Health check (Must work)
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
        });

        // System status - Uses Lazy Imports 
        this.app.get('/api/status', async (req: Request, res: Response) => {
            try {
                // LAZY IMPORTS
                const { tradingEngine } = await import('../engine/tradingEngine');
                const { walletManager } = await import('../blockchain/wallet');
                const { blockchainProvider } = await import('../blockchain/provider');
                
                const status = tradingEngine.getSystemStatus();
                const balances = await walletManager.getAllBalances();
                
                res.json({ ...status, balances, providerHealth: blockchainProvider.getHealthStatus() });
            } catch (error) {
                logger.error('Error getting status (likely dependency issue):', error);
                res.status(500).json({ error: 'Failed to get status', detail: error.message });
            }
        });

        // Start trading engine - Uses Lazy Imports 
        this.app.post('/api/start', async (req: Request, res: Response) => {
            try {
                const { tradingEngine } = await import('../engine/tradingEngine');
                const { flashLoanEngine } = await import('../flashloan/flashLoanEngine');
                
                if (tradingEngine.isEngineRunning()) return res.status(400).json({ error: 'Engine already running' });
                await tradingEngine.start();
                flashLoanEngine.startScanning();

                res.json({ success: true, message: 'Trading engine started', timestamp: Date.now() });
            } catch (error) {
                logger.error('Error starting engine:', error);
                res.status(500).json({ error: 'Failed to start engine', detail: error.message });
            }
        });

        // ... (All other routes follow the dynamic import pattern) ...

        // Error handler 
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.error('Unhandled error:', err);
            res.status(500).json({ error: 'Internal server error', message: err.message });
        });
    }

    public start(): void {
        const port = process.env.PORT || config.server.port;
        // 🚨 FIX: Explicitly bind to '0.0.0.0' for Bad Gateway (502) fix
        const host = '0.0.0.0'; 
        
        this.app.listen(port, host, () => {
            logger.info(`[INIT STEP 4] API Server is listening on host ${host} port ${port}`);
            logger.info(`Backend URL should be reachable.`);
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
