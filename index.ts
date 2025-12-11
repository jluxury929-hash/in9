// index.ts

// 🚨 CRITICAL FIX 1: Ensure environment variables are loaded FIRST.
// This must be the first line to ensure configuration files (like config.ts)
// have access to process.env variables (local or cloud-provided).
require('dotenv').config();

import { apiServer } from './src/api/APIServer';
import { TradeLogger } from './src/utils/tradeLogger';
import logger from './src/utils/logger'; 
// import { apiServerWithBase44 } from './src/api/apiServerWithBase44'; // Uncomment if needed

/**
 * Main application initializer function.
 */
function initializeApp(): void {
    logger.info(`Massive Trading Engine Initializing... NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    
    // 1. Initialize and Print Statistics (wrapped in try/catch for stability)
    try {
        const tradeLogger = new TradeLogger();
        tradeLogger.printStatistics();
    } catch (e) {
        logger.error("FATAL: Failed to initialize TradeLogger. Check fs/path/dependency issues.", e);
        process.exit(1);
    }
    
    // 2. Start the API Server 
    // The APIServer constructor is now minimal, preventing synchronous crashes.
    try {
        apiServer.start();
        // apiServerWithBase44.start();
    } catch (e) {
        logger.error("FATAL: Failed to start APIServer. Check port/Express issues.", e);
        process.exit(1);
    }
    
    logger.info('Application startup complete. Backend URL should now be reachable.');
}

/**
 * Graceful shutdown handler.
 */
function setupShutdown(): void {
    const handleShutdown = () => {
        logger.info('Initiating graceful server shutdown...');
        
        apiServer.stop();
        // apiServerWithBase44.stop(); 
        // TODO: Add logic here to stop the tradingEngine, workers, etc.
        
        process.exit(0);
    };

    process.on('SIGTERM', handleShutdown); // Used by Railway/cloud platforms
    process.on('SIGINT', handleShutdown);
}

// Execute the application entry function
initializeApp();
setupShutdown();
