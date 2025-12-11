const winston = require('winston');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

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

winston.addColors(customLevels.colors);

const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const ts = new Date(timestamp).toLocaleString();
    let coloredLevel = level.toUpperCase();
    
    switch (level) {
        case 'error': coloredLevel = chalk.red.bold(level.toUpperCase()); break;
        case 'warn': coloredLevel = chalk.yellow.bold(level.toUpperCase()); break;
        case 'info': coloredLevel = chalk.blue.bold(level.toUpperCase()); break;
        case 'success': coloredLevel = chalk.green.bold(level.toUpperCase()); break;
        case 'trade': coloredLevel = chalk.magenta.bold(level.toUpperCase()); break;
        case 'debug': coloredLevel = chalk.gray(level.toUpperCase()); break;
    }
    
    let logMessage = `${chalk.gray(ts)} [${coloredLevel}] ${message}`;
    
    if (Object.keys(meta).length > 0) {
        logMessage += '\n' + chalk.gray(JSON.stringify(meta, null, 2));
    }
    
    return logMessage;
});

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
        new winston.transports.File({ filename: path.join(logsDir, 'combined.log'), level: 'debug' }),
        new winston.transports.File({ filename: path.join(logsDir, 'errors.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logsDir, 'trades.log'), level: 'trade' }),
    ]
});

module.exports.logTrade = (data) => {
    logger.log('trade', 'Trade Execution', data);
};

module.exports.logError = (message, error) => {
    logger.error(message, {
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
    });
};

module.exports.logSuccess = (message, data) => {
    logger.log('success', message, data);
};

module.exports.logWarning = (message, data) => {
    logger.warn(message, data);
};

module.exports.logInfo = (message, data) => {
    logger.info(message, data);
};
