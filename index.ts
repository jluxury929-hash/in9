// index.ts

import { apiServer } from './src/api/APIServer';
import { TradeLogger } from './src/utils/tradeLogger';
// Assuming logger exists in the same utility structure
import logger from './src/utils/logger'; 
// If you are using apiServerWithBase44, uncomment this import:
// import { apiServerWithBase44 } from './src/api/apiServerWithBase44'; 

/**
 * Main application initializer function.
 */
function initializeApp(): void {
    logger.info('Massive Trading Engine Initializing...');
    
    // 1. Initialize and Print Statistics
    const tradeLogger = new TradeLogger();
    tradeLogger.printStatistics();

    // 2. Start the API Server 
    apiServer.start();
    
    // If running the placeholder server:
    // apiServerWithBase44.start();

    logger.info('Application startup complete. Ready to trade.');
}

/**
 * Graceful shutdown handler.
 */
function setupShutdown(): void {
    const handleShutdown = () => {
        logger.info('Initiating graceful server shutdown...');
        
        // Stops the main Express and WebSocket servers
        apiServer.stop();
        
        // Stops the placeholder server if used
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
