// index.ts

// 🚨 CRITICAL FIX 1: Ensure environment variables are loaded FIRST.
require('dotenv').config();

import { apiServer } from './src/api/APIServer';
import logger from './src/utils/logger'; 
// import { TradeLogger } from './src/utils/tradeLogger'; // BYPASSED to prevent synchronous FS/dependency crash

function initializeApp(): void {
    logger.info(`STARTUP: Attempting minimal server initialization.`);
    
    // --- BYPASS: Commenting out the TradeLogger block entirely
    /*
    try {
        const tradeLogger = new TradeLogger();
        tradeLogger.printStatistics();
    } catch (e) {
        logger.error("FATAL: Failed to initialize TradeLogger.", e);
        process.exit(1);
    }
    */
    
    // 2. Start the API Server
    try {
        // The APIServer constructor is now also minimal (see below)
        apiServer.start();
        
        logger.info('SERVER STATUS: APIServer start command issued successfully. Check /health endpoint.');
    } catch (e) {
        // If this catch block executes, the failure is a fundamental Node/Express problem
        logger.error("FATAL: Server failed to start due to configuration or port issues.", e);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler. (Remains the same)
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

// Execute the application entry function
initializeApp();
setupShutdown();
