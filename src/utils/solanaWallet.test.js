/**
 * Tests for the balance fetching path in solanaWallet.js.
 *
 * Focus: the retry + throw behavior introduced in commit 28b4c8b.
 * Production was silently returning 0 on RPC errors because of an outer
 * catch + drop_console; these tests pin the new behavior so it cannot
 * regress.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { TOKEN_CONFIG } from '../solana.config.js';

// Mock @solana/spl-token getAccount before importing the module under test
vi.mock('@solana/spl-token', async () => {
  const actual = await vi.importActual('@solana/spl-token');
  return {
    ...actual,
    getAccount: vi.fn(),
  };
});

import { getAccount } from '@solana/spl-token';
import { getTokenBalance } from './solanaWallet.js';

const TEST_WALLET = new PublicKey('5bMz7a2UMV2uGZPFRPGmbq5uM9jWKWrLMbZz4m8m7bqY');

function makeConn(getAccountInfoImpl) {
  return {
    getAccountInfo: vi.fn(getAccountInfoImpl),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level cache between tests by re-importing — vitest gives
  // each test file a fresh module graph but same-file tests share module
  // state. We side-step the cache by always returning a NEW program owner
  // PublicKey that differs across tests where it matters.
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getTokenBalance — happy path', () => {
  it('returns parsed balance when ATA exists', async () => {
    const conn = makeConn(async () => ({ owner: TOKEN_PROGRAM_ID }));
    getAccount.mockResolvedValueOnce({ amount: 3494123463n });

    const balance = await getTokenBalance(TEST_WALLET, conn);

    expect(balance).toBeCloseTo(3494.123463, 6);
    expect(getAccount).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when token account does not exist (TokenAccountNotFoundError)', async () => {
    const conn = makeConn(async () => ({ owner: TOKEN_PROGRAM_ID }));
    const err = new Error('Account not found');
    err.name = 'TokenAccountNotFoundError';
    getAccount.mockRejectedValueOnce(err);

    const balance = await getTokenBalance(TEST_WALLET, conn);
    expect(balance).toBe(0);
  });
});

describe('getTokenBalance — error path (regression guard)', () => {
  it('throws on generic RPC error instead of silently returning 0', async () => {
    const conn = makeConn(async () => ({ owner: TOKEN_PROGRAM_ID }));
    const rpcError = new Error('429 Too Many Requests');
    getAccount.mockRejectedValueOnce(rpcError);

    await expect(getTokenBalance(TEST_WALLET, conn)).rejects.toThrow(/429/);
  });

  it('throws on deserialization error instead of returning 0', async () => {
    const conn = makeConn(async () => ({ owner: TOKEN_PROGRAM_ID }));
    const deserializeError = new TypeError('Cannot read property of undefined');
    getAccount.mockRejectedValueOnce(deserializeError);

    await expect(getTokenBalance(TEST_WALLET, conn)).rejects.toThrow(/Cannot read/);
  });
});

describe('getTokenProgramId — retry behavior (via getTokenBalance)', () => {
  it('throws when mint cannot be detected after retries', async () => {
    // Fresh module graph so the module-level cachedTokenProgramId is empty.
    vi.resetModules();
    vi.doMock('@solana/spl-token', async () => {
      const actual = await vi.importActual('@solana/spl-token');
      return { ...actual, getAccount: vi.fn() };
    });
    const { getTokenBalance: freshGetTokenBalance } = await import('./solanaWallet.js');

    const conn = { getAccountInfo: vi.fn().mockResolvedValue(null) };

    await expect(freshGetTokenBalance(TEST_WALLET, conn)).rejects.toThrow(
      /Cannot detect token program/
    );
    // Should have tried 3 times before giving up
    expect(conn.getAccountInfo).toHaveBeenCalledTimes(3);
  }, 10000);
});

describe('TOKEN_CONFIG sanity', () => {
  it('mint is a valid Solana address', () => {
    expect(() => new PublicKey(TOKEN_CONFIG.mint)).not.toThrow();
  });
  it('decimals is 6 (TOKABU)', () => {
    expect(TOKEN_CONFIG.decimals).toBe(6);
  });
  it('symbol is set', () => {
    expect(TOKEN_CONFIG.symbol).toBeTruthy();
    expect(TOKEN_CONFIG.symbol.length).toBeGreaterThan(0);
  });
});
