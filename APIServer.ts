// src/api/APIServer.ts (Final Fix for Event Loop Blockage)

import express, { Request, Response, NextFunction } from 'express';
// ... (all other imports remain the same) ...
import { config } from '../config'; 
import logger from '../utils/logger'; 

export class APIServer {
    // ... (properties and constructor remain the same) ...

    // NEW METHOD: Handle heavy initialization asynchronously
    private async initializeEngine(): Promise<void> {
        // This function will run AFTER the server starts listening.
        logger.info('Engine Init: Starting heavy asynchronous initialization...');
        
        try {
            // Load all heavy modules here, now that the main thread is free.
            const { tradingEngine } = await import('../engine/tradingEngine');
            const { flashLoanEngine } = await import('../flashloan/flashLoanEngine');
            // const { ultraHighFrequencyEngine } = await import('../engine/ultraHighFrequencyEngine'); // Example heavy module
            
            // Execute heavy startup logic
            await tradingEngine.start();
            flashLoanEngine.startScanning();
            
            logger.info('Engine Init: Trading Engine initialized and running successfully.');

        } catch (error) {
            logger.error('Engine Init: FATAL ERROR during asynchronous engine startup.', error);
            // DO NOT process.exit(1) here; the server must stay alive to report the failure.
        }
    }


    public start(): void {
        const port = process.env.PORT || config.server.port;
        const host = '0.0.0.0'; 
        
        this.app.listen(port, host, () => {
            logger.info(`[INIT STEP 4] API Server is listening on host ${host} port ${port}`);
            logger.info(`Backend URL should be reachable.`);
            
            // 🚨 CRITICAL FIX: Immediately call the asynchronous initialization 
            // after the server is CONFIRMED to be listening.
            this.initializeEngine();
        });
    }
    
    // ... (stop method and other methods remain the same) ...
}

export const apiServer = new APIServer();
