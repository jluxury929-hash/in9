// src/config.ts

import * as dotenv from 'dotenv';
dotenv.config();

// Critical check function to force an error log if a variable is missing
function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        // Logging a massive error block to ensure it's visible in Railway logs
        console.error(`\n\n======================================================`);
        console.error(`🚨 FATAL CONFIG ERROR: Missing required environment variable: ${key}`);
        console.error(`Please check your Railway dashboard for this key.`);
        console.error(`======================================================\n`);
        throw new Error(`Missing environment variable: ${key}.`);
    }
    return value;
}

export const config = {
    server: {
        // Uses the PORT provided by the cloud, defaulting to 3000
        port: process.env.PORT || 3000,
        wsPort: 4000,
        environment: process.env.NODE_ENV || 'development',
    },
    blockchain: {
        // These keys MUST exist in your Railway variables
        rpcUrl: getRequiredEnv('RPC_URL'),
        privateKey: getRequiredEnv('WALLET_PRIVATE_KEY'),
    },
    // IMPORTANT: Add safety checks for all other critical secrets used by the application here:
    // example: externalApiKey: getRequiredEnv('EXTERNAL_API_KEY'),
};
