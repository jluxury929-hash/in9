// index.ts

// 🚨 CRITICAL FIX 1: Ensure environment variables are loaded FIRST.
// This is the most crucial line for cloud environments.
require('dotenv').config();

import { apiServer } from './src/api/APIServer';
import { TradeLogger } from './src/utils/tradeLogger';
// IMPORTANT: Use the safer, standalone logger
import logger from './src/utils/logger'; 
// import { apiServerWithBase44 } from './src/api/apiServerWithBase44'; 

/**
 * Main application initializer function.
 */
function initializeApp(): void {
    // This log confirms dotenv loaded successfully
    logger.info(`Massive Trading Engine Initializing... NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    
    // 1. Initialize and Print Statistics
    try {
        const tradeLogger = new TradeLogger();
        tradeLogger.printStatistics();
    } catch (e) {
        logger.error("FATAL: Failed to initialize TradeLogger. Check fs/path/dependency issues.", e);
        process.exit(1);
    }
    
    // 2. Start the API Server 
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
 * Graceful shutdown handler. (Logic remains the same)
 */
function setupShutdown(): void {
    const handleShutdown = () => {
        logger.info('Initiating graceful server shutdown...');
        apiServer.stop();
        // apiServerWithBase44.stop(); 
        process.exit(0);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
}

// Execute the application entry function
initializeApp();
setupShutdown();

// Execute the application entry function
initializeApp();
setupShutdown();
