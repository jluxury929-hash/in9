// index.ts

// 🚨 FIX: Load environment variables immediately.
// If your project uses 'dotenv' (recommended for local .env files), 
// ensure it's installed (`npm install dotenv`) and configured first.
// If you are using ES6 imports, you might use:
// import 'dotenv/config'; 
// If you are using CommonJS require, use:
require('dotenv').config();

import { apiServer } from './src/api/APIServer';
import { TradeLogger } from './src/utils/tradeLogger';
import logger from './src/utils/logger'; 
// import { apiServerWithBase44 } from './src/api/apiServerWithBase44'; // Uncomment if needed

/**
 * Main application initializer function.
 */
function initializeApp(): void {
    logger.info('Massive Trading Engine Initializing...');
    
    // --- 1. Initialize and Print Statistics ---
    const tradeLogger = new TradeLogger();
    tradeLogger.printStatistics();

    // --- 2. Start the API Server ---
    // If the error persists here, it means the API Server setup 
    // (e.g., database connection in a constructor/setup method) is failing.
    apiServer.start();
    
    // apiServerWithBase44.start(); // Uncomment if needed

    logger.info('Application startup complete. Ready to trade.');
}

/**
 * Graceful shutdown handler.
 */
function setupShutdown(): void {
    const handleShutdown = () => {
        logger.info('Initiating graceful server shutdown...');
        apiServer.stop();
        // apiServerWithBase44.stop(); // Uncomment if needed
        // TODO: Add logic here to stop the tradingEngine, workers, etc.
        process.exit(0);
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
}

// Execute the application entry function
initializeApp();
setupShutdown();
