// src/utils/logger.ts

import winston from 'winston';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// Create logs directory
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Console format with colors
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const ts = new Date(timestamp).toLocaleString();
    let coloredLevel = level.toUpperCase();
    
    switch (level) {
        case 'error':
            coloredLevel = chalk.red.bold(level.toUpperCase());
            break;
        case 'warn':
            coloredLevel = chalk.yellow.bold(level.toUpperCase());
            break;
        case 'info':
            coloredLevel = chalk.blue.bold(level.toUpperCase());
            break;
        case 'success':
            coloredLevel = chalk.green.bold(level.toUpperCase());
            break;
        case 'trade':
            coloredLevel = chalk.magenta.bold(level.toUpperCase());
            break;
        case 'debug':
            coloredLevel = chalk.gray(level.toUpperCase());
            break;
    }
    
    let logMessage = `${chalk.gray(ts)} [${coloredLevel}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
        logMessage += '\n' + chalk.gray(JSON.stringify(meta, null, 2));
    }
    
    return logMessage;
});

// Custom levels
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        success: 2,
        trade: 3,
        info: 4,
        debug: 5
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        success: 'green',
        trade: 'magenta',
        info: 'blue',
        debug: 'gray'
    }
};

// Create logger
const logger = winston.createLogger({
    levels: customLevels.levels,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                consoleFormat
            )
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'errors.log'),
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        new winston.transports.File({
            filename: path.join(logsDir, 'trades.log'),
            level: 'trade',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            )
        }),
        new winston.transports.File({
            filename: path.join(logsDir, `daily-${new Date().toISOString().split('T')[0]}.log`)
        })
    ]
});

winston.addColors(customLevels.colors);

// Helper functions
export const logTrade = (data: any) => {
    logger.log('trade', 'Trade Execution', data);
};

export const logOpportunity = (data: any) => {
    logger.info('Opportunity Found', data);
};

export const logScan = (data: any) => {
    logger.debug('Scan Complete', data);
};

export const logError = (message: string, error: any) => {
    logger.error(message, {
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
    });
};

export const logSuccess = (message: string, data?: any) => {
    logger.log('success', message, data);
};

export const logWarning = (message: string, data?: any) => {
    logger.warn(message, data);
};

export const logInfo = (message: string, data?: any) => {
    logger.info(message, data);
};

export default logger;
