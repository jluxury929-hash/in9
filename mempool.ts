import { ethers } from 'ethers';
import logger from '../utils/logger';

export interface RawMEVOpportunity {
    type: 'sandwich';
    targetTxHash: string;
    targetTxRaw: string; // CRITICAL: Raw signed transaction hex
    targetTxParsed: ethers.TransactionResponse;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    estimatedProfitEth: string;
}

export class MempoolMonitor {
    private provider: ethers.WebSocketProvider;
    private uniswapV2Router: string;
    private wethAddress: string;
    private minTradeValueEth: number;

    constructor(
        rpcWss: string,
        uniswapV2Router: string,
        wethAddress: string,
        minTradeValueEth: number = 0.1
    ) {
        this.provider = new ethers.WebSocketProvider(rpcWss);
        this.uniswapV2Router = uniswapV2Router.toLowerCase();
        this.wethAddress = wethAddress;
        this.minTradeValueEth = minTradeValueEth;
    }

    async start(callback: (opportunity: RawMEVOpportunity) => void): Promise<void> {
        logger.info(' Starting advanced mempool monitoring...');

        this.provider.on('pending', async (txHash: string) => {
            try {
                const tx = await this.provider.getTransaction(txHash);
                if (!tx) return;

                const rawTx = await this.getRawTransaction(txHash);
                if (!rawTx) return;

                const opportunity = await this.analyzeTransaction(tx, rawTx);
                if (opportunity) {
                    callback(opportunity);
                }
            } catch (error) {
                // Silently ignore minor mempool errors
            }
        });

        logger.info('✓ Mempool monitoring active (with raw transaction support)');
    }

    private async getRawTransaction(txHash: string): Promise<string | null> {
        try {
            const rawTx = await this.provider.send('eth_getRawTransactionByHash', [txHash]);
            if (rawTx) return rawTx;

            const tx = await this.provider.getTransaction(txHash);
            if (!tx) return null;

            return ethers.Transaction.from(tx).serialized;
        } catch (error) {
            logger.debug(`Could not get raw tx for ${txHash}`);
            return null;
        }
    }

    private async analyzeTransaction(
        tx: ethers.TransactionResponse,
        rawTx: string
    ): Promise<RawMEVOpportunity | null> {
        try {
            // Filter: Only Uniswap V2 Router trades
            if (!tx.to || tx.to.toLowerCase() !== this.uniswapV2Router) {
                return null;
            }

            // Decode transaction data
            const functionSelector = tx.data.slice(0, 10);
            const iface = new ethers.Interface([
                'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)',
                'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)',
                'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)'
            ]);

            let decoded;
            try {
                decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
            } catch {
                return null;
            }

            if (!decoded) return null;

            const path = decoded.args.path as string[];
            if (path.length < 2) return null;

            // Check trade size
            let amountIn: bigint;
            if (functionSelector === '0x7ff36ab5') { // swapExactETHForTokens
                amountIn = tx.value || 0n;
            } else if (functionSelector === '0x18cbafe5' || functionSelector === '0x38ed1739') { // swapExactTokensForETH/Tokens
                amountIn = decoded.args.amountIn as bigint;
            } else {
                return null;
            }

            const amountInEth = parseFloat(ethers.formatEther(amountIn));
            if (amountInEth < this.minTradeValueEth) return null;

            const estimatedProfitEth = (amountInEth * 0.003).toFixed(6); // Simplified profit estimation

            return {
                type: 'sandwich',
                targetTxHash: tx.hash,
                targetTxRaw: rawTx,
                targetTxParsed: tx,
                tokenIn: path[0],
                tokenOut: path[path.length - 1],
                amountIn: amountIn,
                estimatedProfitEth
            };

        } catch (error) {
            return null;
        }
    }

    async stop(): Promise<void> {
        await this.provider.destroy();
        logger.info('Mempool monitor stopped');
    }
}
