// Supabase Edge Function: reconcile-payments
//
// Self-healing payment reconciliation. Scans the receiver wallet's recent
// TOKABU SPL transfers via Solana RPC. For each transfer not yet recorded
// in `transactions`, validates and credits the sender. Idempotent via
// `transactions.transaction_hash` UNIQUE constraint.
//
// Edge cases (unknown sender, amount mismatch, price unavailable, etc.)
// get logged to `unverified_payments` for admin review.
//
// Auth: only callers presenting a service_role JWT in the Authorization
// header may invoke. We decode the JWT and check the `role` claim rather
// than doing a literal equality match against SUPABASE_SERVICE_ROLE_KEY,
// because the Supabase platform may reformat the header in transit and
// because env-var caching can desync from a recently-rotated key.
// Signature validation is handled at the platform level (verify_jwt=true).
//
// Body: { dryRun?: boolean, source?: string }
//   dryRun=true  -> scan + log only, no DB writes
//   source       -> 'cron' | 'manual' | etc. (logged for traceability)
//
// Tunables (kept conservative):
//   SIGNATURE_LIMIT     - max signatures fetched per scan (100)
//   SCAN_WINDOW_DAYS    - ignore TXs older than this (30 days)
//   PRICE_TOLERANCE     - 7% (must match verify-payment)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY') ?? '';
const SOLANA_MAINNET_RPCS = [
  ...(HELIUS_API_KEY
    ? [`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`]
    : []),
  'https://api.mainnet-beta.solana.com',
];

const PAYMENT_TOKEN_MINT =
  Deno.env.get('PAYMENT_TOKEN_MINT') ??
  'ELaSGbXf6KMcw9wzyLgG78Tef6BLrHwkGpH5euLSpump';
const TOKEN_SYMBOL = Deno.env.get('TOKEN_SYMBOL') ?? 'LMX';
const PAYMENT_RECEIVER =
  Deno.env.get('PAYMENT_RECEIVER_ADDRESS') ??
  Deno.env.get('PAYMENT_RECEIVER') ??
  'T6EkvAVdHPRr6Ngub1vk7VTzqtgw2KoGJwA8RCJmmGg';

const SIGNATURE_LIMIT = 100;
const SCAN_WINDOW_DAYS = 30;
const PRICE_TOLERANCE = 0.07;
const PACKAGE_USD: ReadonlyArray<number> = [1, 5, 10];

// Price API endpoints — kept in sync with verify-payment + src/utils/jupiterPrice.js.
// Jupiter v6 retired late 2024; v2 returns `usdPrice` on `data[mint]`.
// pump.fun covers fresh, pre-graduation mints (price = usd_market_cap / 1e9 since
// every pump.fun mint has a fixed 1B total supply).
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const PUMPFUN_COIN_API = 'https://frontend-api.pump.fun/coins';
const PUMPFUN_TOTAL_SUPPLY = 1_000_000_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignatureInfo {
  signature: string;
  blockTime: number | null;
  err: unknown;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner: string;
  uiTokenAmount: { uiAmount: number | null };
}

interface TxJson {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown | null;
    preTokenBalances: TokenBalance[] | null;
    postTokenBalances: TokenBalance[] | null;
  };
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean }>;
    };
  };
}

interface ReconcileBody {
  dryRun?: boolean;
  source?: string;
}

interface ReconcileResult {
  scanned: number;
  alreadyCredited: number;
  newlyCredited: number;
  unverified: number;
  skipped: number;
  errors: string[];
  dryRun: boolean;
  source: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Returns true iff Authorization header carries a JWT whose `role` claim
// is `service_role`. Signature is already validated by the platform.
function isServiceRoleJwt(authHeader: string): boolean {
  const m = authHeader.match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const parts = m[1].trim().split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

async function rpc(method: string, params: unknown[], maxRetries = 3): Promise<unknown> {
  let lastError: Error | null = null;
  for (const url of SOLANA_MAINNET_RPCS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || 'RPC error');
        return data.result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) await sleep(500 * attempt);
      }
    }
  }
  throw lastError ?? new Error('All RPC endpoints failed');
}

async function getTokenPrice(): Promise<number | null> {
  // DexScreener first — most accurate once a token has on-chain liquidity.
  try {
    const res = await fetch(`${DEXSCREENER_API}/${PAYMENT_TOKEN_MINT}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.pairs) && data.pairs.length > 0) {
        const best = data.pairs.reduce(
          (a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
            (b?.liquidity?.usd ?? 0) > (a?.liquidity?.usd ?? 0) ? b : a,
        );
        const price = parseFloat(best.priceUsd);
        if (Number.isFinite(price) && price > 0) return price;
      }
    }
  } catch (err) {
    console.warn('[reconcile-payments] DexScreener price fetch failed:', err);
  }
  // Jupiter v2 — `usdPrice` (with legacy `price` accepted as fallback).
  try {
    const res = await fetch(`${JUPITER_PRICE_API}?ids=${PAYMENT_TOKEN_MINT}`);
    if (res.ok) {
      const data = await res.json();
      const tokenData = data?.data?.[PAYMENT_TOKEN_MINT];
      const rawPrice = tokenData?.usdPrice ?? tokenData?.price;
      if (rawPrice !== undefined && rawPrice !== null) {
        const price = Number(rawPrice);
        if (Number.isFinite(price) && price > 0) return price;
      }
    }
  } catch (err) {
    console.warn('[reconcile-payments] Jupiter price fetch failed:', err);
  }
  // pump.fun bonding-curve fallback for pre-graduation mints.
  try {
    const res = await fetch(`${PUMPFUN_COIN_API}/${PAYMENT_TOKEN_MINT}`);
    if (res.ok) {
      const data = await res.json();
      const marketCap = Number(data?.usd_market_cap);
      if (Number.isFinite(marketCap) && marketCap > 0) {
        return marketCap / PUMPFUN_TOTAL_SUPPLY;
      }
    }
  } catch (err) {
    console.warn('[reconcile-payments] pump.fun price fetch failed:', err);
  }
  return null;
}

// Match a USD value to a known package (1/5/10) within PRICE_TOLERANCE.
function matchPackage(usdValue: number): number | null {
  for (const pkg of PACKAGE_USD) {
    const min = pkg * (1 - PRICE_TOLERANCE);
    const max = pkg * (1 + PRICE_TOLERANCE);
    if (usdValue >= min && usdValue <= max) return pkg;
  }
  return null;
}

// Find a TOKABU transfer to PAYMENT_RECEIVER in this TX. Uses balance deltas
// (matches verify-payment's primary detection method).
function findTokabuTransferToReceiver(tx: TxJson): { amount: number } | null {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];

  for (const postBal of post) {
    if (postBal.mint !== PAYMENT_TOKEN_MINT) continue;
    if (postBal.owner !== PAYMENT_RECEIVER) continue;
    const preBal = pre.find(
      (p) => p.owner === postBal.owner && p.mint === PAYMENT_TOKEN_MINT,
    );
    const before = preBal?.uiTokenAmount?.uiAmount ?? 0;
    const after = postBal.uiTokenAmount?.uiAmount ?? 0;
    const delta = after - before;
    if (delta > 0) return { amount: delta };
  }
  return null;
}

// Find the sender wallet (whose TOKABU balance decreased).
function findSenderForMint(tx: TxJson): string | null {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];

  for (const preBal of pre) {
    if (preBal.mint !== PAYMENT_TOKEN_MINT) continue;
    const postBal = post.find(
      (p) => p.owner === preBal.owner && p.mint === PAYMENT_TOKEN_MINT,
    );
    const before = preBal.uiTokenAmount?.uiAmount ?? 0;
    const after = postBal?.uiTokenAmount?.uiAmount ?? 0;
    if (after - before < 0) return preBal.owner;
  }

  // Fallback: first signer (typical for an SPL transfer the user signed).
  const signer = tx.transaction.message.accountKeys.find((k) => k.signer);
  return signer?.pubkey ?? null;
}

// ---------------------------------------------------------------------------
// Per-signature processing
// ---------------------------------------------------------------------------

async function logUnverified(
  supabase: ReturnType<typeof createClient>,
  signature: string,
  sender: string,
  amount: number,
  blockTime: number | null,
  reason: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(
      `[reconcile-payments] DRY_RUN unverified: tx=${signature} sender=${sender} amount=${amount} reason=${reason}`,
    );
    return;
  }
  const { error } = await supabase.from('unverified_payments').insert({
    transaction_hash: signature,
    sender_wallet: sender,
    receiver_wallet: PAYMENT_RECEIVER,
    token_mint: PAYMENT_TOKEN_MINT,
    token_amount: amount,
    block_time: blockTime ? new Date(blockTime * 1000).toISOString() : null,
    reason,
  });
  if (error && error.code !== '23505') {
    console.warn(`[reconcile-payments] unverified insert failed: ${error.message}`);
  }
}

async function processSignature(
  supabase: ReturnType<typeof createClient>,
  signature: string,
  blockTime: number | null,
  dryRun: boolean,
  cachedPrice: { value: number | null },
  result: ReconcileResult,
): Promise<void> {
  // Skip if already credited.
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('transaction_hash', signature)
    .maybeSingle();
  if (existingTx) {
    result.alreadyCredited++;
    return;
  }

  // Skip if already logged as unverified (avoid duplicate work / log spam).
  const { data: existingUnv } = await supabase
    .from('unverified_payments')
    .select('id')
    .eq('transaction_hash', signature)
    .maybeSingle();
  if (existingUnv) {
    result.skipped++;
    return;
  }

  // Fetch full TX.
  const tx = (await rpc('getTransaction', [
    signature,
    {
      encoding: 'jsonParsed',
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    },
  ])) as TxJson | null;

  if (!tx) {
    result.skipped++;
    return;
  }
  if (tx.meta?.err) {
    result.skipped++;
    return;
  }

  const transfer = findTokabuTransferToReceiver(tx);
  if (!transfer) {
    // Not a TOKABU transfer to our receiver (could be SOL fee, other SPL,
    // or unrelated TX involving our address). Skip silently.
    result.skipped++;
    return;
  }

  const sender = findSenderForMint(tx);
  if (!sender) {
    await logUnverified(supabase, signature, '', transfer.amount, blockTime, 'no_sender_found', dryRun);
    result.unverified++;
    return;
  }

  // Lazy-fetch price, cached for the whole scan.
  if (cachedPrice.value === null) {
    cachedPrice.value = await getTokenPrice();
  }
  const price = cachedPrice.value;
  if (!price) {
    await logUnverified(supabase, signature, sender, transfer.amount, blockTime, 'price_unavailable', dryRun);
    result.unverified++;
    return;
  }

  const usdValue = transfer.amount * price;
  const pkg = matchPackage(usdValue);
  if (!pkg) {
    await logUnverified(
      supabase,
      signature,
      sender,
      transfer.amount,
      blockTime,
      `amount_mismatch_$${usdValue.toFixed(4)}`,
      dryRun,
    );
    result.unverified++;
    return;
  }

  // Look up or auto-create the user (mirrors verify-payment).
  let { data: user } = await supabase
    .from('users')
    .select('id, credits, total_spent')
    .eq('wallet_address', sender)
    .maybeSingle();

  if (!user) {
    if (dryRun) {
      console.log(
        `[reconcile-payments] DRY_RUN would auto-create user: ${sender} and credit $${pkg}`,
      );
      result.newlyCredited++;
      return;
    }
    const { data: newUser, error: createErr } = await supabase
      .from('users')
      .insert({
        wallet_address: sender,
        credits: 0,
        total_games_played: 0,
        total_spent: 0,
      })
      .select('id, credits, total_spent')
      .single();
    if (createErr || !newUser) {
      throw createErr ?? new Error('User auto-create returned no row');
    }
    user = newUser;
  }

  if (dryRun) {
    console.log(
      `[reconcile-payments] DRY_RUN would credit: user=${sender} package=$${pkg} ` +
        `tx=${signature} tokens=${transfer.amount.toFixed(4)} ${TOKEN_SYMBOL}`,
    );
    result.newlyCredited++;
    return;
  }

  // Insert transactions row first (idempotent via UNIQUE constraint).
  const { data: txRecord, error: txInsertError } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      amount: pkg,
      credits_added: pkg,
      transaction_hash: signature,
      status: 'success',
      token_amount: transfer.amount,
      token_symbol: TOKEN_SYMBOL,
    })
    .select('id')
    .single();

  if (txInsertError) {
    if (txInsertError.code === '23505') {
      // Race: another reconciler / verify-payment beat us. Idempotent.
      result.alreadyCredited++;
      return;
    }
    throw txInsertError;
  }

  // Update user balance.
  const { error: updateError } = await supabase
    .from('users')
    .update({
      credits: (user.credits ?? 0) + pkg,
      total_spent: (user.total_spent ?? 0) + pkg,
    })
    .eq('id', user.id);

  if (updateError) {
    // Rollback the transactions insert so the next run can retry cleanly.
    await supabase.from('transactions').delete().eq('id', txRecord.id);
    throw updateError;
  }

  console.log(
    `[reconcile-payments] Credited: user=${sender} package=$${pkg} tx=${signature}`,
  );
  result.newlyCredited++;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth: require a service_role JWT in the Authorization header.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!isServiceRoleJwt(authHeader)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = (await req.json().catch(() => ({}))) as ReconcileBody;
  const dryRun = body.dryRun === true;
  const source = body.source ?? 'manual';

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey,
  );

  const result: ReconcileResult = {
    scanned: 0,
    alreadyCredited: 0,
    newlyCredited: 0,
    unverified: 0,
    skipped: 0,
    errors: [],
    dryRun,
    source,
  };

  console.log(
    `[reconcile-payments] Starting (dryRun=${dryRun}, source=${source}, ` +
      `receiver=${PAYMENT_RECEIVER}, mint=${PAYMENT_TOKEN_MINT})`,
  );

  try {
    const signatures = (await rpc('getSignaturesForAddress', [
      PAYMENT_RECEIVER,
      { limit: SIGNATURE_LIMIT },
    ])) as SignatureInfo[];

    if (!Array.isArray(signatures)) {
      throw new Error('getSignaturesForAddress returned non-array');
    }

    const cutoff = Math.floor(Date.now() / 1000) - SCAN_WINDOW_DAYS * 86400;
    const cachedPrice = { value: null as number | null };

    for (const sig of signatures) {
      result.scanned++;
      if (sig.err) {
        result.skipped++;
        continue;
      }
      if (sig.blockTime && sig.blockTime < cutoff) {
        result.skipped++;
        continue;
      }
      try {
        await processSignature(
          supabase,
          sig.signature,
          sig.blockTime,
          dryRun,
          cachedPrice,
          result,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`${sig.signature}: ${msg}`);
        console.error(`[reconcile-payments] Error processing ${sig.signature}:`, msg);
      }
    }

    console.log('[reconcile-payments] Done:', JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[reconcile-payments] Fatal:', msg);
    return new Response(JSON.stringify({ ...result, fatal: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
