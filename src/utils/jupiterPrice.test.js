/**
 * Tests for src/utils/jupiterPrice.js.
 *
 * Sprint 4.2 of v3 roadmap — locks down the price-fetch path that the
 * RealLauncherUI credit-purchase flow depends on. The function tries
 * DexScreener first, falls back to Jupiter, and serves stale cache as
 * a last resort. Each leg is pinned here so a regression cannot ship
 * silently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  getTokenPrice,
  calculateTokenAmount,
  formatPrice,
  getTokenPriceWithRetry,
  clearPriceCache,
} from './jupiterPrice';
import { TOKEN_CONFIG } from '../solana.config.js';

// ---------------------------------------------------------------------------
// formatPrice — pure function, four numeric ranges
// ---------------------------------------------------------------------------
describe('formatPrice', () => {
  it('formats prices >= 1 with 2 decimals', () => {
    expect(formatPrice(123.456)).toBe('$123.46');
    expect(formatPrice(1)).toBe('$1.00');
  });

  it('formats prices in [0.01, 1) with 4 decimals', () => {
    expect(formatPrice(0.5)).toBe('$0.5000');
    expect(formatPrice(0.01)).toBe('$0.0100');
  });

  it('formats prices in [0.0001, 0.01) with 6 decimals', () => {
    expect(formatPrice(0.001)).toBe('$0.001000');
    expect(formatPrice(0.0001)).toBe('$0.000100');
  });

  it('formats very small prices with exponential notation', () => {
    expect(formatPrice(0.00001)).toBe('$1.00e-5');
    expect(formatPrice(0.000001)).toBe('$1.00e-6');
  });
});

// ---------------------------------------------------------------------------
// getTokenPrice — DexScreener first, Jupiter fallback, stale cache last
// ---------------------------------------------------------------------------
describe('getTokenPrice', () => {
  beforeEach(() => {
    clearPriceCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns DexScreener price (highest-liquidity pair) on success', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        pairs: [
          { liquidity: { usd: 100000 }, priceUsd: '0.001' },
          { liquidity: { usd: 200000 }, priceUsd: '0.0015' }, // highest
          { liquidity: { usd: 50000 }, priceUsd: '0.0009' },
        ],
      }),
    });

    const price = await getTokenPrice();
    expect(price).toBe(0.0015);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to Jupiter when DexScreener returns no pairs', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pairs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { [TOKEN_CONFIG.mint]: { price: 0.002 } },
        }),
      });

    const price = await getTokenPrice();
    expect(price).toBe(0.002);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to Jupiter when DexScreener throws', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('DexScreener down'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: { [TOKEN_CONFIG.mint]: { price: 0.003 } },
        }),
      });

    const price = await getTokenPrice();
    expect(price).toBe(0.003);
  });

  it('throws when both DexScreener and Jupiter fail and cache is empty', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('DexScreener network'))
      .mockRejectedValueOnce(new Error('Jupiter network'));

    await expect(getTokenPrice()).rejects.toThrow(/Unable to fetch token price/);
  });

  it('serves cached price within the cache window without re-fetching', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        pairs: [{ liquidity: { usd: 100 }, priceUsd: '0.001' }],
      }),
    });

    const first = await getTokenPrice();
    const second = await getTokenPrice();

    expect(first).toBe(0.001);
    expect(second).toBe(0.001);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// calculateTokenAmount — usdAmount / price, throws on invalid price
// ---------------------------------------------------------------------------
describe('calculateTokenAmount', () => {
  beforeEach(() => {
    clearPriceCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes tokenAmount = usdAmount / price for a valid price', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        pairs: [{ liquidity: { usd: 100 }, priceUsd: '0.001' }],
      }),
    });

    const result = await calculateTokenAmount(1);
    expect(result.price).toBe(0.001);
    expect(result.tokenAmount).toBe(1000); // 1 USD / 0.001 per token
  });

  it('throws when DexScreener returns price of zero', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        pairs: [{ liquidity: { usd: 100 }, priceUsd: '0' }],
      }),
    });

    await expect(calculateTokenAmount(1)).rejects.toThrow(/Invalid .* price/);
  });
});

// ---------------------------------------------------------------------------
// getTokenPriceWithRetry — first-attempt success path
// ---------------------------------------------------------------------------
describe('getTokenPriceWithRetry', () => {
  beforeEach(() => {
    clearPriceCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the price on first-attempt success without retrying', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        pairs: [{ liquidity: { usd: 100 }, priceUsd: '0.001' }],
      }),
    });

    const price = await getTokenPriceWithRetry(3);
    expect(price).toBe(0.001);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
