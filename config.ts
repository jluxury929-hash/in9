// Define configuration settings for the Massive Trading Engine.
export const config = {
    // ---------------- API Server Configuration ----------------
    server: {
        port: parseInt(process.env.PORT || '8080'),
        wsPort: parseInt(process.env.WS_PORT || '8081'),
        // Environment variable for production/development mode
        environment: process.env.NODE_ENV || 'development'
    },

    // ---------------- Ethereum Network Configuration ----------------
    ethereum: {
        // Main RPC URL for block monitoring and general reads
        rpcUrl: process.env.ETHEREUM_RPC_1 || 'http://localhost:8545',
        rpcHttp: process.env.ETHEREUM_RPC_1 || 'http://localhost:8545',
        rpcWss: process.env.ETHEREUM_WSS || 'wss://eth-mainnet.g.alchemy.com/v2/demo'
    },

    // ---------------- Wallet Configuration ----------------
    wallet: {
        privateKey: process.env.WALLET_PRIVATE_KEY || '',
        profitAddress: process.env.PROFIT_WALLET_ADDRESS || '',
        // MINIMUM ETH BALANCE to allow trading to start (UPDATED to 0.0008)
        minEthBalance: parseFloat(process.env.MIN_ETH_BALANCE || '0.008'), 
        // ETH reserve to ensure gas fees can always be paid
        gasReserveEth: parseFloat(process.env.GAS_RESERVE_ETH || '0.0002')
    },

    // ---------------- MEV Configuration ----------------
    mev: {
        // Address of your deployed MEV Helper Contract
        helperContract: process.env.MEV_HELPER_CONTRACT_ADDRESS || '',
        // Standard Uniswap V2 Router address (Mainnet)
        uniswapRouter: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        // Standard WETH address (Mainnet)
        wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    },

    // ---------------- Flashbots Configuration ----------------
    flashbots: {
        // Official Flashbots relay endpoint
        relayUrl: process.env.FLASHBOTS_RELAY || 'https://relay.flashbots.net',
        // Signer key used to authenticate with the Flashbots relay
        relaySignerKey: process.env.FLASHBOTS_RELAY_SIGNER_KEY || '',
        // Minimum profit (in ETH) required for the engine to submit a bundle
        minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD || '0.001'),
        minProfitEth: parseFloat(process.env.MIN_PROFIT_ETH || '0.001')
    },
    
    // ---------------- Trading Configuration ----------------
    trading: {
        // Should match or be slightly above minEthBalance (UPDATED to 0.0008)
        minTradeValueEth: parseFloat(process.env.MIN_TRADE_VALUE_ETH || '0.0008'), 
    }
};
