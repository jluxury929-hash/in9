// src/utils/tradeLogger.ts (Content is the same as the previous response)

import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from 'chalk';

export interface TradeRecord {
    id: string;
    timestamp: number;
    blockNumber: number;
    
    status: 'pending' | 'success' | 'failed';
    // ... (rest of interface properties)
}

export class TradeLogger {
    // ... (Class properties and methods, including constructor, logTrade, getStatistics, printStatistics)
    // The implementation here remains identical to the last full code snippet.
}
