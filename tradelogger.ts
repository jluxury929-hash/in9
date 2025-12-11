// src/utils/tradeLogger.ts
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from 'chalk';

export interface TradeRecord {
    id: string;
    timestamp: number;
    blockNumber: number;
    
    status: 'pending' | 'success' | 'failed';
    tokenA: {
        symbol: string;
        address: string;
        amount: string;
    };
    tokenB: {
        symbol: string;
        address: string;
        amount: string;
    };
    
    buyDex: string;
    sellDex: string;
    
    borrowAmount: string;
    expectedProfit: string;
    actualProfit?: string;
    gasUsed?: string;
    gasCost?: string;
    gasCostUSD?: string;
    netProfit?: string;
    netProfitUSD?: string;
    profitPercent?: string;
    
    txHash?: string;
    txStatus?: number;
    executionTime?: number;
    
    error?: string;
    errorStack?: string;
}

export class TradeLogger {
    private tradesFile: string;
    private summaryFile: string;
    private csvFile: string;
    
    private totalTrades: number = 0;
    private successfulTrades: number = 0;
    private failedTrades: number = 0;
    private totalProfit: bigint = 0n;
    private totalGasCost: bigint = 0n;
    
    constructor() {
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        this.tradesFile = path.join(logsDir, `trades-${today}.json`);
        this.summaryFile = path.join(logsDir, 'summary.json');
        this.csvFile = path.join(logsDir, `trades-${today}.csv`);
        
        if (!fs.existsSync(this.csvFile)) {
            const headers = 'Timestamp,Trade ID,Status,Token Pair,Buy DEX,Sell DEX,Borrow Amount,Expected Profit,Actual Profit,Gas Cost,Net Profit,Profit %,TX Hash,Block\n';
            fs.writeFileSync(this.csvFile, headers);
        }
        
        this.loadSummary();
    }
    
    logTrade(trade: TradeRecord): void {
        this.totalTrades++;
        
        if (trade.status === 'success') {
            this.successfulTrades++;
            if (trade.netProfit) {
                try {
                    this.totalProfit += ethers.parseEther(trade.netProfit);
                } catch {
                    // Skip if can't parse
                }
            }
        } else if (trade.status === 'failed') {
            this.failedTrades++;
        }
        
        if (trade.gasCost) {
            try {
                this.totalGasCost += ethers.parseEther(trade.gasCost);
            } catch {
                // Skip
            }
        }
        
        this.appendToJsonFile(trade);
        this.appendToCsvFile(trade);
        this.saveSummary();
        this.consoleLogTrade(trade);
    }
    
    private appendToJsonFile(trade: TradeRecord): void {
        let trades: TradeRecord[] = [];
        
        if (fs.existsSync(this.tradesFile)) {
            try {
                const content = fs.readFileSync(this.tradesFile, 'utf-8');
                trades = JSON.parse(content);
            } catch {
                trades = [];
            }
        }
        
        trades.push(trade);
        fs.writeFileSync(this.tradesFile, JSON.stringify(trades, null, 2));
    }
    
    private appendToCsvFile(trade: TradeRecord): void {
        const row = [
            new Date(trade.timestamp).toISOString(),
            trade.id,
            trade.status,
            `${trade.tokenA.symbol}/${trade.tokenB.symbol}`,
            trade.buyDex,
            trade.sellDex,
            trade.borrowAmount,
            trade.expectedProfit,
            trade.actualProfit || 'N/A',
            trade.gasCost || 'N/A',
            trade.netProfit || 'N/A',
            trade.profitPercent || 'N/A',
            trade.txHash || 'N/A',
            trade.blockNumber || 'N/A'
        ].join(',') + '\n';
        
        fs.appendFileSync(this.csvFile, row);
    }
    
    private consoleLogTrade(trade: TradeRecord): void {
        console.log('\n' + chalk.gray('═'.repeat(80)));
        
        if (trade.status === 'pending') {
            console.log(chalk.yellow(`⏳ TRADE PENDING: ${trade.id}`));
        } else if (trade.status === 'success') {
            console.log(chalk.green(`✅ TRADE SUCCESS: ${trade.id}`));
        } else {
            console.log(chalk.red(`❌ TRADE FAILED: ${trade.id}`));
        }
        
        console.log(chalk.gray(`   ${new Date(trade.timestamp).toLocaleString()}`));
        console.log(chalk.cyan(`   Pair: ${trade.tokenA.symbol}/${trade.tokenB.symbol}`));
        console.log(chalk.cyan(`   ${trade.buyDex} → ${trade.sellDex}`));
        console.log(chalk.cyan(`   Borrow: ${trade.borrowAmount} ${trade.tokenA.symbol}`));
        console.log(chalk.cyan(`   Expected: ${trade.expectedProfit}`));
        
        if (trade.actualProfit) {
            console.log(chalk.green(`   Actual Profit: ${trade.actualProfit}`));
        }
        
        if (trade.gasCost) {
            console.log(chalk.yellow(`   Gas: ${trade.gasCost}`));
        }
        
        if (trade.netProfit) {
            const isProfit = parseFloat(trade.netProfit) > 0;
            console.log(isProfit 
                ? chalk.green.bold(`   Net: +${trade.netProfit}`) 
                : chalk.red(`   Net: ${trade.netProfit}`)
            );
        }
        
        if (trade.txHash) {
            console.log(chalk.blue(`   TX: ${trade.txHash}`));
        }
        
        if (trade.error) {
            console.log(chalk.red(`   Error: ${trade.error}`));
        }
        
        console.log(chalk.gray('═'.repeat(80)));
    }
    
    private loadSummary(): void {
        if (fs.existsSync(this.summaryFile)) {
            try {
                const summary = JSON.parse(fs.readFileSync(this.summaryFile, 'utf-8'));
                this.totalTrades = summary.totalTrades || 0;
                this.successfulTrades = summary.successfulTrades || 0;
                this.failedTrades = summary.failedTrades || 0;
                this.totalProfit = BigInt(summary.totalProfit || 0);
                this.totalGasCost = BigInt(summary.totalGasCost || 0);
            } catch {
                // Start fresh
            }
        }
    }
    
    private saveSummary(): void {
        const summary = {
            totalTrades: this.totalTrades,
            successfulTrades: this.successfulTrades,
            failedTrades: this.failedTrades,
            successRate: this.totalTrades > 0 
                ? ((this.successfulTrades / this.totalTrades) * 100).toFixed(2) 
                : '0.00',
            totalProfit: this.totalProfit.toString(),
            totalGasCost: this.totalGasCost.toString(),
            netProfit: (this.totalProfit - this.totalGasCost).toString(),
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2));
    }
    
    getStatistics() {
        return {
            totalTrades: this.totalTrades,
            successfulTrades: this.successfulTrades,
            failedTrades: this.failedTrades,
            successRate: this.totalTrades > 0 
                ? ((this.successfulTrades / this.totalTrades) * 100).toFixed(2) 
                : '0.00',
            totalProfit: ethers.formatEther(this.totalProfit),
            totalGasCost: ethers.formatEther(this.totalGasCost),
            netProfit: ethers.formatEther(this.totalProfit - this.totalGasCost)
        };
    }
    
    printStatistics(): void {
        const stats = this.getStatistics();
        
        console.log('\n' + chalk.cyan('═'.repeat(60)));
        console.log(chalk.cyan.bold('📊 TRADING STATISTICS'));
        console.log(chalk.cyan('═'.repeat(60)));
        console.log(chalk.blue(`Total Trades: ${stats.totalTrades}`));
        console.log(chalk.green(`Successful: ${stats.successfulTrades}`));
        console.log(chalk.red(`Failed: ${stats.failedTrades}`));
        console.log(chalk.yellow(`Success Rate: ${stats.successRate}%`));
        console.log(chalk.green(`Total Profit: ${stats.totalProfit} ETH`));
        console.log(chalk.yellow(`Total Gas: ${stats.totalGasCost} ETH`));
        console.log(chalk.magenta.bold(`Net Profit: ${stats.netProfit} ETH`));
        console.log(chalk.cyan('═'.repeat(60)) + '\n');
    }
}
