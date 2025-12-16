/**
 * LMX Token Price Service
 *
 * Fetches real-time LMX/USDT price from DEX APIs
 * Uses multiple sources for reliability with fallback mechanism
 */

import { LMX_TOKEN, PRICING_USDT } from '../wagmi.config';

// Cache configuration
const PRICE_CACHE_DURATION = 60 * 1000; // 1 minute cache
let priceCache = {
  price: null,
  timestamp: 0,
};

/**
 * Fetch LMX price from DexScreener API
 * Most reliable free API for BSC tokens
 */
async function fetchFromDexScreener() {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${LMX_TOKEN.address}`,
    { signal: AbortSignal.timeout(10000) }
  );

  if (!response.ok) {
    throw new Error(`DexScreener API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.pairs || data.pairs.length === 0) {
    throw new Error('No trading pairs found for LMX token');
  }

  // Find the best pair (highest liquidity USDT/BUSD pair on BSC)
  const bscPairs = data.pairs.filter(p => p.chainId === 'bsc');

  // Prefer USDT or BUSD pairs
  const stablePair = bscPairs.find(p =>
    p.quoteToken.symbol === 'USDT' ||
    p.quoteToken.symbol === 'BUSD' ||
    p.baseToken.symbol === 'USDT' ||
    p.baseToken.symbol === 'BUSD'
  ) || bscPairs[0];

  if (!stablePair) {
    throw new Error('No BSC pairs found for LMX token');
  }

  return parseFloat(stablePair.priceUsd);
}

/**
 * Fetch LMX price from GeckoTerminal API (backup)
 */
async function fetchFromGeckoTerminal() {
  const response = await fetch(
    `https://api.geckoterminal.com/api/v2/simple/networks/bsc/token_price/${LMX_TOKEN.address}`,
    { signal: AbortSignal.timeout(10000) }
  );

  if (!response.ok) {
    throw new Error(`GeckoTerminal API error: ${response.status}`);
  }

  const data = await response.json();
  const tokenData = data.data?.attributes?.token_prices?.[LMX_TOKEN.address.toLowerCase()];

  if (!tokenData) {
    throw new Error('Token price not found in GeckoTerminal');
  }

  return parseFloat(tokenData);
}

/**
 * Get LMX price in USDT with caching and fallback
 * @returns {Promise<number>} LMX price in USDT
 */
export async function getLMXPrice() {
  const now = Date.now();

  // Return cached price if still valid
  if (priceCache.price !== null && (now - priceCache.timestamp) < PRICE_CACHE_DURATION) {
    return priceCache.price;
  }

  // Try multiple sources
  const sources = [
    { name: 'DexScreener', fetch: fetchFromDexScreener },
    { name: 'GeckoTerminal', fetch: fetchFromGeckoTerminal },
  ];

  let lastError = null;

  for (const source of sources) {
    try {
      console.log(`[TokenPrice] Fetching LMX price from ${source.name}...`);
      const price = await source.fetch();

      if (price && price > 0) {
        // Update cache
        priceCache = {
          price,
          timestamp: now,
        };
        console.log(`[TokenPrice] LMX price: $${price.toFixed(8)} (from ${source.name})`);
        return price;
      }
    } catch (error) {
      console.warn(`[TokenPrice] ${source.name} failed:`, error.message);
      lastError = error;
    }
  }

  // If we have a cached price (even if expired), use it as fallback
  if (priceCache.price !== null) {
    console.warn('[TokenPrice] Using expired cached price as fallback');
    return priceCache.price;
  }

  throw new Error(`Failed to fetch LMX price: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Calculate LMX amount needed for a credit package
 * @param {number} credits - Number of credits (1, 5, or 10)
 * @returns {Promise<{lmxAmount: number, usdtValue: number, lmxPrice: number}>}
 */
export async function calculateLMXAmount(credits) {
  const usdtValue = PRICING_USDT[credits];

  if (!usdtValue) {
    throw new Error(`Invalid credit package: ${credits}`);
  }

  const lmxPrice = await getLMXPrice();

  // Calculate LMX amount: USDT value / LMX price
  // Round to 0 decimals as requested
  const lmxAmount = Math.round(usdtValue / lmxPrice);

  return {
    lmxAmount,
    usdtValue,
    lmxPrice,
  };
}

/**
 * Get all package prices in LMX
 * @returns {Promise<Object>} Package prices with LMX amounts
 */
export async function getAllPackagePrices() {
  const lmxPrice = await getLMXPrice();

  const packages = {};

  for (const [credits, usdtValue] of Object.entries(PRICING_USDT)) {
    const lmxAmount = Math.round(usdtValue / lmxPrice);
    packages[credits] = {
      credits: parseInt(credits),
      usdtValue,
      lmxAmount,
      lmxPrice,
    };
  }

  return packages;
}

/**
 * Format LMX amount for display
 * @param {number} amount - LMX amount
 * @returns {string} Formatted string
 */
export function formatLMXAmount(amount) {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M LMX`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K LMX`;
  }
  return `${amount} LMX`;
}

/**
 * Clear price cache (useful for testing or forcing refresh)
 */
export function clearPriceCache() {
  priceCache = {
    price: null,
    timestamp: 0,
  };
}

export default {
  getLMXPrice,
  calculateLMXAmount,
  getAllPackagePrices,
  formatLMXAmount,
  clearPriceCache,
};
