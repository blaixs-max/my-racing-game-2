/**
 * Jupiter Price API Integration
 * Fetches real-time COAL token price in USD
 */

import { TOKEN_CONFIG, JUPITER_CONFIG } from '../solana.config.js';

// Price cache
let priceCache = {
  price: null,
  timestamp: 0
};

/**
 * Fetch token price - tries DexScreener first (better for new tokens), then Jupiter
 * @returns {Promise<number>} Price in USD
 */
export async function getCoalPrice() {
  // Check cache
  const now = Date.now();
  if (priceCache.price && (now - priceCache.timestamp) < JUPITER_CONFIG.priceCacheDuration) {
    console.log('[Price] Using cached price:', priceCache.price);
    return priceCache.price;
  }

  // Try DexScreener first (better for new/pump.fun tokens)
  try {
    const price = await getDexScreenerPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[DexScreener] Failed:', error.message);
  }

  // Fallback to Jupiter
  try {
    const price = await getJupiterPrice();
    if (price) {
      priceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.warn('[Jupiter] Failed:', error.message);
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
 * Get price from Jupiter API
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

  if (tokenData?.price) {
    console.log(`[Jupiter] Token Price: $${tokenData.price}`);
    return tokenData.price;
  }

  return null;
}

/**
 * Calculate required COAL amount for USD value
 * @param {number} usdAmount - Amount in USD
 * @returns {Promise<{coalAmount: number, price: number}>}
 */
export async function calculateCoalAmount(usdAmount) {
  const price = await getCoalPrice();

  if (!price || price <= 0) {
    throw new Error('Invalid COAL price');
  }

  const coalAmount = usdAmount / price;

  console.log(`[Price] $${usdAmount} USD = ${coalAmount.toFixed(6)} COAL (@ $${price}/COAL)`);

  return {
    coalAmount,
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
export async function getCoalPriceWithRetry(maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getCoalPrice();
    } catch (error) {
      lastError = error;
      console.warn(`[Jupiter] Retry ${i + 1}/${maxRetries} failed:`, error.message);

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
  console.log('[Jupiter] Price cache cleared');
}

export default {
  getCoalPrice,
  calculateCoalAmount,
  formatPrice,
  getCoalPriceWithRetry,
  clearPriceCache
};
