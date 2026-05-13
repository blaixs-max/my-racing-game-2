/**
 * Solana Configuration for Racing Game
 * Token Payment System - tum token bilgileri TOKEN_CONFIG icinde.
 * Yeni token'a gecis icin sadece TOKEN_CONFIG icindeki `mint`, `name`, `symbol`,
 * `decimals`, `logoUrl` degerlerini degistirmek yeterlidir.
 */

import { clusterApiUrl } from '@solana/web3.js';

// =============================================================================
// NETWORK CONFIGURATION
// =============================================================================

export const SOLANA_NETWORK = 'mainnet-beta';

// RPC Endpoints with fallbacks
// Helius key'i build-time env var ile alinir (VITE_HELIUS_API_KEY).
// Key domain-restricted (Helius dashboard'dan lumexia.net whitelist) olmalidir.
// Key yoksa dogrudan public RPC'lere dusulur.
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;
const HELIUS_ENDPOINT = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

export const RPC_ENDPOINTS = [
  ...(HELIUS_ENDPOINT ? [HELIUS_ENDPOINT] : []),
  'https://api.mainnet-beta.solana.com',
  clusterApiUrl('mainnet-beta')
];

export const DEFAULT_RPC_ENDPOINT = RPC_ENDPOINTS[0];

// =============================================================================
// TOKEN CONFIGURATION
// =============================================================================

// Payment token - yeni token'a gecerken sadece buradaki degerleri guncelle.
export const TOKEN_CONFIG = {
  mint: 'ELaSGbXf6KMcw9wzyLgG78Tef6BLrHwkGpH5euLSpump',
  name: 'Lumexia',
  symbol: 'LMX',
  decimals: 6,
  logoUrl: ''
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

  // Price tolerance for verification (7%, must match verify-payment Edge Function)
  priceTolerance: 0.07,

  // Minimum SOL balance required for transaction fees
  minSolBalance: 0.005,

  // Transaction confirmation commitment
  commitment: 'confirmed'
};

// =============================================================================
// JUPITER PRICE API CONFIGURATION
// =============================================================================

export const JUPITER_CONFIG = {
  // Jupiter Price API v2 — v6 was retired late 2024.
  // Response shape: `{ data: { [mint]: { usdPrice, blockId, decimals, ... } } }`.
  priceApiUrl: 'https://lite-api.jup.ag/price/v2',

  // USDC mint for price reference
  usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',

  // Cache duration for price (30 seconds)
  priceCacheDuration: 30000,

  // Price fetch timeout
  timeout: 10000
};

// =============================================================================
// PUMP.FUN BONDING-CURVE FALLBACK CONFIGURATION
// =============================================================================

// pump.fun's frontend API exposes per-coin data (`usd_market_cap`, virtual
// reserves, etc.) for mints that are still on the bonding curve and therefore
// haven't been indexed by Jupiter or DexScreener yet. Final fallback in the
// price chain so fresh launches don't break credit purchases on day one.
export const PUMPFUN_CONFIG = {
  coinApiUrl: 'https://frontend-api.pump.fun/coins',
  timeout: 8000
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
  PUMPFUN_CONFIG,
  WALLET_CONFIG,
  TRANSACTION_CONFIG,
  getRpcEndpoint,
  toRawAmount,
  fromRawAmount,
  formatTokenAmount
};
