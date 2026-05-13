/**
 * Token Price API Integration
 * Fetches real-time payment token price in USD.
 *
 * Source chain (first non-null wins):
 *   1. DexScreener — works once the token graduates to Raydium/Meteora.
 *   2. Jupiter Price API v2 — works once Jupiter has the token routed.
 *   3. pump.fun bonding-curve API — works during the pre-graduation phase
 *      when neither aggregator has indexed the mint yet (e.g. fresh launches).
 *
 * Jupiter v6 was retired in late 2024; the v2 endpoint returns `usdPrice`
 * (not `price`) on the same `data[mint]` shape. pump.fun exposes
 * `usd_market_cap` per coin; price = usd_market_cap / 1e9 since every
 * pump.fun mint has a fixed 1B total supply.
 */

import { TOKEN_CONFIG, JUPITER_CONFIG, PUMPFUN_CONFIG } from '../solana.config.js';

// pump.fun total supply is fixed at 1,000,000,000 (1B) for every coin.
const PUMPFUN_TOTAL_SUPPLY = 1_000_000_000;

// Price cache
let priceCache = {
  price: null,
  timestamp: 0
};

/**
 * Fetch token price - DexScreener → Jupiter v2 → pump.fun fallback.
 * @returns {Promise<number>} Price in USD
 */
export async function getTokenPrice() {
  // Check cache
  const now = Date.now();
  if (priceCache.price && (now - priceCache.timestamp) < JUPITER_CONFIG.priceCacheDuration) {
    console.log('[Price] Using cached price:', priceCache.price);
    return priceCache.price;
  }

  // Try DexScreener first (better for graduated tokens with deep liquidity)
  try {
    const price = await getDexScreenerPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[DexScreener] Failed:', error.message);
  }

  // Fallback to Jupiter v2
  try {
    const price = await getJupiterPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[Jupiter] Failed:', error.message);
  }

  // Final fallback: pump.fun bonding curve (works for fresh, pre-graduation mints)
  try {
    const price = await getPumpFunPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[pump.fun] Failed:', error.message);
  }

  // Return cached price if all sources fail
  if (priceCache.price) {
    console.log('[Price] Using stale cached price:', priceCache.price);
    return priceCache.price;
  }

  throw new Error('Unable to fetch token price from any source');
}

/**
 * Get price from DexScreener API
 */
async function getDexScreenerPrice() {
  console.log('[DexScreener] Fetching price for:', TOKEN_CONFIG.mint);

  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_CONFIG.mint}`,
    { signal: AbortSignal.timeout(JUPITER_CONFIG.timeout) }
  );

  if (!response.ok) {
    throw new Error(`DexScreener API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.pairs && data.pairs.length > 0) {
    // Get the pair with highest liquidity
    const bestPair = data.pairs.reduce((best, pair) =>
      (pair.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? pair : best
    );

    const price = parseFloat(bestPair.priceUsd);
    console.log(`[DexScreener] Token Price: $${price}`);
    return price;
  }

  return null;
}

/**
 * Get price from Jupiter Price API v2.
 *
 * v2 response shape: `{ data: { [mint]: { usdPrice, blockId, decimals, ... } } }`.
 * The legacy v6 endpoint exposed `price` on the same path; we accept either
 * key so a future schema tweak doesn't take the chain down.
 */
async function getJupiterPrice() {
  const url = `${JUPITER_CONFIG.priceApiUrl}?ids=${TOKEN_CONFIG.mint}`;
  console.log('[Jupiter] Fetching price from:', url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(JUPITER_CONFIG.timeout),
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Jupiter API error: ${response.status}`);
  }

  const data = await response.json();
  const tokenData = data.data?.[TOKEN_CONFIG.mint];
  const rawPrice = tokenData?.usdPrice ?? tokenData?.price;

  if (rawPrice) {
    const price = Number(rawPrice);
    if (Number.isFinite(price) && price > 0) {
      console.log(`[Jupiter] Token Price: $${price}`);
      return price;
    }
  }

  return null;
}

/**
 * Get price from pump.fun bonding-curve API.
 *
 * For pre-graduation mints (still on the pump.fun bonding curve), neither
 * DexScreener nor Jupiter exposes a price. pump.fun's coins endpoint
 * returns `usd_market_cap`, and every pump.fun mint has a fixed 1B total
 * supply, so price = usd_market_cap / 1e9.
 */
async function getPumpFunPrice() {
  const url = `${PUMPFUN_CONFIG.coinApiUrl}/${TOKEN_CONFIG.mint}`;
  console.log('[pump.fun] Fetching price from:', url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(PUMPFUN_CONFIG.timeout),
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`pump.fun API error: ${response.status}`);
  }

  const data = await response.json();
  const marketCap = Number(data?.usd_market_cap);

  if (Number.isFinite(marketCap) && marketCap > 0) {
    const price = marketCap / PUMPFUN_TOTAL_SUPPLY;
    console.log(`[pump.fun] Token Price: $${price} (mcap=$${marketCap})`);
    return price;
  }

  return null;
}

/**
 * Calculate required token amount for USD value
 * @param {number} usdAmount - Amount in USD
 * @returns {Promise<{tokenAmount: number, price: number}>}
 */
export async function calculateTokenAmount(usdAmount) {
  const price = await getTokenPrice();

  if (!price || price <= 0) {
    throw new Error(`Invalid ${TOKEN_CONFIG.symbol} price`);
  }

  const tokenAmount = usdAmount / price;

  console.log(`[Price] $${usdAmount} USD = ${tokenAmount.toFixed(6)} ${TOKEN_CONFIG.symbol} (@ $${price}/${TOKEN_CONFIG.symbol})`);

  return {
    tokenAmount,
    price
  };
}

/**
 * Format price for display
 * @param {number} price - Price in USD
 * @returns {string} Formatted price
 */
export function formatPrice(price) {
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  } else if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  } else if (price >= 0.0001) {
    return `$${price.toFixed(6)}`;
  } else {
    return `$${price.toExponential(2)}`;
  }
}

/**
 * Get price with retry logic
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<number>} Price in USD
 */
export async function getTokenPriceWithRetry(maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getTokenPrice();
    } catch (error) {
      lastError = error;
      console.warn(`[Price] Retry ${i + 1}/${maxRetries} failed:`, error.message);

      // Wait before retry (exponential backoff)
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
}

/**
 * Clear price cache (useful for forcing fresh price)
 */
export function clearPriceCache() {
  priceCache = {
    price: null,
    timestamp: 0
  };
  console.log('[Price] Cache cleared');
}

export default {
  getTokenPrice,
  calculateTokenAmount,
  formatPrice,
  getTokenPriceWithRetry,
  clearPriceCache
};
