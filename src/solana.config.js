/**
 * Solana Configuration for Racing Game
 * COAL Token Payment System
 */

import { clusterApiUrl } from '@solana/web3.js';

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

export const SOLANA_NETWORK = 'mainnet-beta';

// RPC Endpoints with fallbacks
// Note: Public RPCs have rate limits. For production, use Helius/QuickNode free tier
export const RPC_ENDPOINTS = [
  'https://mainnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff', // Helius free public
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://api.mainnet-beta.solana.com',
  clusterApiUrl('mainnet-beta')
];

export const DEFAULT_RPC_ENDPOINT = RPC_ENDPOINTS[0];

// =============================================================================
// TOKEN CONFIGURATION
// =============================================================================

export const TOKEN_CONFIG = {
  // OILTOWN Token Mint Address
  mint: 'AakmsJ4vebK1Uk3eWPRPx89WzEDq2knvN2sgGcXEpump',

  // Token Details
  name: 'OIL TOWN',
  symbol: 'OILTOWN',
  decimals: 6,

  // Logo URL (update with actual logo)
  logoUrl: '/oiltown-token-logo.png'
};

// =============================================================================
// PAYMENT CONFIGURATION
// =============================================================================

export const PAYMENT_CONFIG = {
  // Receiver wallet address for payments
  receiverWallet: 'T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg',

  // Credit packages (USD value)
  packages: {
    1: { credits: 1, usdValue: 1 },
    5: { credits: 5, usdValue: 5 },
    10: { credits: 10, usdValue: 10 }
  },

  // Price tolerance for verification (5%)
  priceTolerance: 0.05,

  // Minimum SOL balance required for transaction fees
  minSolBalance: 0.005,

  // Transaction confirmation commitment
  commitment: 'confirmed'
};

// =============================================================================
// JUPITER PRICE API CONFIGURATION
// =============================================================================

export const JUPITER_CONFIG = {
  priceApiUrl: 'https://price.jup.ag/v6/price',

  // USDC mint for price reference
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',

  // Cache duration for price (30 seconds)
  priceCacheDuration: 30000,

  // Price fetch timeout
  timeout: 10000
};

// =============================================================================
// WALLET CONFIGURATION
// =============================================================================

export const WALLET_CONFIG = {
  // Auto-connect on page load
  autoConnect: true,

  // Supported wallets (in order of preference)
  supportedWallets: [
    'phantom',
    'solflare',
    'backpack',
    'coinbase',
    'trust'
  ],

  // Modal z-index
  modalZIndex: 99999
};

// =============================================================================
// TRANSACTION CONFIGURATION
// =============================================================================

export const TRANSACTION_CONFIG = {
  // Maximum retries for failed transactions
  maxRetries: 3,

  // Retry delay in ms
  retryDelay: 2000,

  // Transaction timeout in ms
  timeout: 60000,

  // Polling interval for confirmation
  pollingInterval: 2000
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get RPC endpoint with fallback
 */
export function getRpcEndpoint(index = 0) {
  return RPC_ENDPOINTS[index] || DEFAULT_RPC_ENDPOINT;
}

/**
 * Convert token amount to raw amount (with decimals)
 */
export function toRawAmount(amount) {
  return Math.floor(amount * Math.pow(10, TOKEN_CONFIG.decimals));
}

/**
 * Convert raw amount to display amount
 */
export function fromRawAmount(rawAmount) {
  return rawAmount / Math.pow(10, TOKEN_CONFIG.decimals);
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount, maxDecimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals
  }).format(amount);
}

export default {
  SOLANA_NETWORK,
  RPC_ENDPOINTS,
  DEFAULT_RPC_ENDPOINT,
  TOKEN_CONFIG,
  PAYMENT_CONFIG,
  JUPITER_CONFIG,
  WALLET_CONFIG,
  TRANSACTION_CONFIG,
  getRpcEndpoint,
  toRawAmount,
  fromRawAmount,
  formatTokenAmount
};
