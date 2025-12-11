import { ethers } from 'ethers';
import logger from '../utils/logger';

export class NonceManager {
    private provider: ethers.JsonRpcProvider;
    private address: string;
    private currentNonce: number;
    private pendingNonces: Set<number>;
    private lastSyncBlock: number;

    constructor(provider: ethers.JsonRpcProvider, address: string) {
        this.provider = provider;
        this.address = address;
        this.currentNonce = 0;
        this.pendingNonces = new Set();
        this.lastSyncBlock = 0;
    }

    async initialize(): Promise<void> {
        // Fetch pending nonce to get the correct next available nonce
        const blockchainNonce = await this.provider.getTransactionCount(this.address, 'pending');
        this.currentNonce = blockchainNonce;
        this.pendingNonces.clear();
        this.lastSyncBlock = await this.provider.getBlockNumber();

        logger.info(`NonceManager initialized - Starting nonce: ${this.currentNonce}`);
    }

    /**
     * Get next nonce pair for sandwich attack
     * Returns [frontRunNonce, backRunNonce]
     */
    getNextNoncePair(): [number, number] {
        const frontRunNonce = this.currentNonce;
        const backRunNonce = this.currentNonce + 1;

        // Mark both nonces as pending
        this.pendingNonces.add(frontRunNonce);
        this.pendingNonces.add(backRunNonce);

        // Optimistically increment for next bundle
        this.currentNonce += 2;

        logger.info(`Allocated nonce pair: [${frontRunNonce}, ${backRunNonce}]`);
        return [frontRunNonce, backRunNonce];
    }

    /**
     * Mark bundle as confirmed (nonces successfully used)
     */
    confirmBundle(frontRunNonce: number, backRunNonce: number): void {
        this.pendingNonces.delete(frontRunNonce);
        this.pendingNonces.delete(backRunNonce);
        logger.info(`Confirmed nonces: [${frontRunNonce}, ${backRunNonce}]`);
    }

    /**
     * Handle bundle failure - resync nonces
     */
    async handleBundleFailure(): Promise<void> {
        logger.warn('Bundle failed - resyncing nonces');
        // Resync by fetching the count of confirmed transactions (not pending)
        this.currentNonce = await this.provider.getTransactionCount(this.address, 'latest');
        this.pendingNonces.clear();
        logger.info(`Nonce resynced to: ${this.currentNonce}`);
    }

    async resyncIfNeeded(): Promise<void> {
        const currentBlock = await this.provider.getBlockNumber();
       
        // Resync every 10 blocks or if we have too many pending nonces
        if (
            currentBlock - this.lastSyncBlock >= 10 ||
            this.pendingNonces.size > 10
        ) {
            logger.info('Periodic nonce resync triggered');
            // Fetch pending nonce to ensure we don't reuse a nonce that may still be pending
            const blockchainNonce = await this.provider.getTransactionCount(this.address, 'pending');
            this.currentNonce = blockchainNonce;
            this.pendingNonces.clear();
            this.lastSyncBlock = currentBlock;
        }
    }
   
    getCurrentNonce(): number {
        return this.currentNonce;
    }

    getPendingCount(): number {
        return this.pendingNonces.size;
    }
}
