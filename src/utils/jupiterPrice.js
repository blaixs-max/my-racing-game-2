/**
 * Token Price API Integration
 * Fetches real-time payment token price in USD.
 *
 * Source chain (first non-null wins):
 *   1. DexScreener — works once the token graduates to Raydium/Meteora.
 *   2. Jupiter Price API v2 — works once Jupiter has the token routed.
 *   3. Supabase Edge Function `get-token-price` proxy — server-side
 *      DexScreener + Jupiter + pump.fun chain. Used when the browser
 *      can't reach the public APIs directly, most commonly because:
 *        a) pump.fun's frontend-api has no CORS for public origins
 *           (so its bonding-curve price for pre-graduation mints is
 *           only reachable server-side), or
 *        b) the user's mobile carrier / corporate proxy DNS-blocks
 *           crypto-data domains (pump.fun, dexscreener.com, jup.ag).
 *           *.supabase.co stays reachable on those networks.
 *
 * Jupiter v6 was retired in late 2024; the v2 endpoint returns `usdPrice`
 * (not `price`) on the same `data[mint]` shape.
 */

import { TOKEN_CONFIG, JUPITER_CONFIG } from '../solana.config.js';

// Price cache
let priceCache = {
  price: null,
  timestamp: 0
};

/**
 * Fetch token price - DexScreener → Jupiter v2 → Edge Function proxy fallback.
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

  // Try Jupiter v2
  try {
    const price = await getJupiterPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[Jupiter] Failed:', error.message);
  }

  // Final fallback: Edge Function proxy. The proxy itself tries
  // DexScreener + Jupiter + pump.fun server-side, so it covers both
  // pre-graduation mints (CORS-blocked pump.fun) and clients on
  // networks that DNS-filter crypto-data domains.
  try {
    const price = await getEdgeFunctionPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[EdgeProxy] Failed:', error.message);
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
 * Get price from the Supabase Edge Function proxy.
 *
 * The proxy runs the full server-side chain (DexScreener → Jupiter →
 * pump.fun) and returns `{ price, source, mint }`. We hit this when the
 * browser-side chain can't reach a price source — either because the
 * mint is pump.fun-only (CORS-blocked) or because the user is on a
 * network that DNS-filters crypto-data domains. Mainstream cloud
 * (`*.supabase.co`) stays reachable on those networks.
 */
async function getEdgeFunctionPrice() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Build wasn't given Supabase env vars — skip silently so unit tests
    // and offline builds don't blow up on a missing fallback.
    return null;
  }

  const url = `${supabaseUrl}/functions/v1/get-token-price?mint=${TOKEN_CONFIG.mint}`;
  console.log('[EdgeProxy] Fetching price from:', url);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(JUPITER_CONFIG.timeout),
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    }
  });

  if (!response.ok) {
    throw new Error(`Edge proxy error: ${response.status}`);
  }

  const data = await response.json();
  const price = Number(data?.price);

  if (Number.isFinite(price) && price > 0) {
    console.log(`[EdgeProxy] Token Price: $${price} (source=${data.source})`);
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
