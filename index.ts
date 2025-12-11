// index.ts (The Ultimate Debugger)

// 🚨 CRITICAL FIX 1: Ensure environment variables are loaded FIRST.
require('dotenv').config();

import { apiServer } from './src/api/APIServer';
import logger from './src/utils/logger'; 
// Note: TradeLogger is safely bypassed here for stability.

function initializeApp(): void {
    logger.info(`[INIT STEP 1] STARTUP: Starting initialization sequence.`);
    
    // --- STEP 2: Initialize APIServer (which immediately imports config/logger) ---
    // If the process crashes here, the error is in config.ts or logger.ts
    try {
        const server = apiServer; 
        logger.info(`[INIT STEP 2] APIServer instantiated successfully.`);
    } catch (e) {
        logger.error(`[FATAL] APIServer instantiation failed. Check top-level imports in APIServer.ts.`, e);
        process.exit(1);
    }
    
    // --- STEP 3: Start the server and listen to the network ---
    try {
        apiServer.start();
        logger.info(`[INIT STEP 3] SERVER STATUS: APIServer start command issued.`);
    } catch (e) {
        // This is the last safety net against a failure to run the start method
        logger.error("[FATAL] Server failed during start/listen execution.", e);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler.
 */
function setupShutdown(): void {
    const handleShutdown = () => {
        logger.info('Initiating graceful server shutdown...');
        apiServer.stop();
        process.exit(0);
    };

    process.on('SIGTERM', handleShutdown); 
    process.on('SIGINT', handleShutdown);
}

initializeApp();
setupShutdown();
