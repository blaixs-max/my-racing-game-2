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
 * Fetch COAL token price from Jupiter API
 * @returns {Promise<number>} Price in USD
 */
export async function getCoalPrice() {
  // Check cache
  const now = Date.now();
  if (priceCache.price && (now - priceCache.timestamp) < JUPITER_CONFIG.priceCacheDuration) {
    console.log('[Jupiter] Using cached price:', priceCache.price);
    return priceCache.price;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JUPITER_CONFIG.timeout);

    const url = `${JUPITER_CONFIG.priceApiUrl}?ids=${TOKEN_CONFIG.mint}`;
    console.log('[Jupiter] Fetching price from:', url);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Jupiter] API Response:', data);

    // Extract price from response
    const tokenData = data.data?.[TOKEN_CONFIG.mint];

    if (!tokenData || !tokenData.price) {
      // Try alternative price sources if Jupiter doesn't have data
      console.warn('[Jupiter] No price data from Jupiter, trying alternatives...');
      return await getAlternativePrice();
    }

    const price = tokenData.price;
    console.log(`[Jupiter] COAL Price: $${price}`);

    // Update cache
    priceCache = {
      price,
      timestamp: now
    };

    return price;
  } catch (error) {
    console.error('[Jupiter] Error fetching price:', error);

    // Return cached price if available
    if (priceCache.price) {
      console.log('[Jupiter] Using stale cached price:', priceCache.price);
      return priceCache.price;
    }

    // Try alternative price source
    return await getAlternativePrice();
  }
}

/**
 * Alternative price fetching from DexScreener
 * @returns {Promise<number>} Price in USD
 */
async function getAlternativePrice() {
  try {
    console.log('[DexScreener] Trying alternative price source...');

    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_CONFIG.mint}`,
      { timeout: JUPITER_CONFIG.timeout }
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
      console.log(`[DexScreener] COAL Price: $${price}`);

      // Update cache
      priceCache = {
        price,
        timestamp: Date.now()
      };

      return price;
    }

    throw new Error('No pairs found on DexScreener');
  } catch (error) {
    console.error('[DexScreener] Error:', error);
    throw new Error('Unable to fetch COAL price from any source');
  }
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
