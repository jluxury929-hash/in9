const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class TradeLogger {
    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        const today = new Date().toISOString().split('T')[0];
        this.tradesFile = path.join(logsDir, `trades-${today}.json`);
        this.csvFile = path.join(logsDir, `trades-${today}.csv`);
        
        if (!fs.existsSync(this.csvFile)) {
            const headers = 'Timestamp,Trade ID,Status,Token A,Token B,Buy DEX,Sell DEX,Borrow Amount,Expected Profit,Actual Profit,Gas Cost,Net Profit,TX Hash,Block\n';
            fs.writeFileSync(this.csvFile, headers);
        }
    }
    
    logTrade(trade) {
        this.appendToJsonFile(trade);
        this.appendToCsvFile(trade);
        this.consoleLogTrade(trade);
    }
    
    appendToJsonFile(trade) {
        let trades = [];
        
        if (fs.existsSync(this.tradesFile)) {
            try {
                trades = JSON.parse(fs.readFileSync(this.tradesFile, 'utf8'));
            } catch (e) {
                console.error(chalk.red('Error reading trades JSON file:'), e.message);
                trades = [];
            }
        }
        
        const existingIndex = trades.findIndex(t => t.id === trade.id);
        if (existingIndex !== -1) {
            trades[existingIndex] = trade;
        } else {
            trades.push(trade);
        }
        
        fs.writeFileSync(this.tradesFile, JSON.stringify(trades, null, 2));
    }
    
    appendToCsvFile(trade) {
        if (trade.status !== 'success' && trade.status !== 'failed') return;
        
        const line = [
            new Date(trade.timestamp).toISOString(),
            trade.id,
            trade.status,
            trade.tokenA.symbol,
            trade.tokenB.symbol,
            trade.buyDex,
            trade.sellDex,
            trade.borrowAmount,
            trade.expectedProfit,
            trade.actualProfit || 'N/A',
            trade.gasCost || 'N/A',
            trade.netProfit || 'N/A',
            trade.txHash || 'N/A',
            trade.blockNumber || 'N/A'
        ].map(item => `"${String(item).replace(/"/g, '""')}"`).join(',');
        
        fs.appendFileSync(this.csvFile, line + '\n');
    }

    consoleLogTrade(trade) {
        if (trade.status === 'success') {
            console.log(chalk.bgGreen.bold(`\n✅ TRADE SUCCESS: ${trade.id}`));
            console.log(`Profit: ${chalk.green(trade.actualProfit)} ${trade.tokenA.symbol}`);
            console.log(`Net: ${chalk.green(trade.netProfit)} | Gas: ${trade.gasCost}`);
            console.log(`TX: ${trade.txHash}\n`);
        } else if (trade.status === 'failed') {
            console.log(chalk.bgRed.bold(`\n❌ TRADE FAILED: ${trade.id}`));
            console.log(`Error: ${trade.error}`);
            console.log(`TX: ${trade.txHash || 'N/A'}\n`);
        }
    }
}

module.exports.TradeLogger = TradeLogger;
