// Supabase Edge Function: get-token-price
//
// Server-side proxy for the payment-token USD price. Frontend calls this
// when its client-side chain (DexScreener + Jupiter v2) can't reach a
// price source — most commonly because:
//   1. The token is fresh on the pump.fun bonding curve and no aggregator
//      has indexed it yet (`frontend-api.pump.fun` has no CORS for public
//      browser origins, so it can only be reached server-side).
//   2. A mobile carrier / corporate proxy DNS-blocks crypto domains like
//      pump.fun, dexscreener.com, or jup.ag. Browsers on those networks
//      can still reach *.supabase.co, so the proxy keeps the purchase
//      flow alive.
//
// Source chain (first non-null wins):
//   1. DexScreener           — graduated tokens with deep liquidity
//   2. Jupiter v2            — graduated tokens, alternate coverage
//   3. Bonding curve direct  — Solana RPC read of pump.fun bonding curve
//                              state. Authoritative for pre-graduation
//                              mints and indexer-independent: as long as
//                              the token exists on-chain we can derive a
//                              price from virtualSolReserves /
//                              virtualTokenReserves × SOL/USD.
//   4. pump.fun frontend-api — last-resort indexer (rate-limited from
//                              shared egress IPs, kept for completeness)
//
// Returns: { price: number | null, source: 'dexscreener' | 'jupiter' | 'bondingCurve' | 'pumpfun' | null, mint: string }
//
// No auth beyond the Supabase anon key (read-only price lookup, no PII,
// no writes). Same CORS allowlist as verify-payment.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { PublicKey } from 'https://esm.sh/@solana/web3.js@1.95.3';

const allowedOrigins = [
  'https://lumexia.net',
  'https://game.lumexia.net',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

// Same env contract as verify-payment / reconcile-payments — single source
// of truth for the active mint.
const PAYMENT_TOKEN_MINT =
  Deno.env.get('PAYMENT_TOKEN_MINT') ?? 'ELaSGbXf6KMcw9wzyLgG78Tef6BLrHwkGpH5euLSpump';

const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v2';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const PUMPFUN_COIN_API = 'https://frontend-api.pump.fun/coins';
const PUMPFUN_TOTAL_SUPPLY = 1_000_000_000;

// pump.fun on-chain config. Program ID and seed match the pump.fun
// canonical bonding-curve PDA. Token decimals are fixed at 6 for every
// pump.fun mint (lamports stay at 9).
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const BONDING_CURVE_SEED = new TextEncoder().encode('bonding-curve');
const PUMPFUN_TOKEN_DECIMALS = 6;
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const COINGECKO_SOL_PRICE_API =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY') ?? '';
const SOLANA_RPC_URLS = [
  ...(HELIUS_API_KEY
    ? [`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`]
    : []),
  'https://api.mainnet-beta.solana.com',
];

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Diagnostic timer wrapper so every source logs its own outcome + duration.
// Supabase captures these in the edge-function log stream, which is the
// only window we have into why a fallback chose null.
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - t0);
    console.log(`[price:${label}] result=${JSON.stringify(result)} duration_ms=${ms}`);
    return result;
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[price:${label}] threw="${message}" duration_ms=${ms}`);
    throw err;
  }
}

async function fromDexScreener(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`${DEXSCREENER_API}/${mint}`);
  if (!res) {
    console.warn('[price:dexscreener] no response (timeout or network)');
    return null;
  }
  if (!res.ok) {
    console.warn(`[price:dexscreener] non-ok status=${res.status}`);
    return null;
  }
  try {
    const data = await res.json();
    if (!Array.isArray(data?.pairs) || data.pairs.length === 0) {
      console.log('[price:dexscreener] pairs=[] (no indexed pool)');
      return null;
    }
    const best = data.pairs.reduce(
      (acc: { liquidity?: { usd?: number } }, p: { liquidity?: { usd?: number } }) =>
        (p?.liquidity?.usd ?? 0) > (acc?.liquidity?.usd ?? 0) ? p : acc,
      data.pairs[0],
    );
    const price = parseFloat((best as { priceUsd?: string }).priceUsd ?? '');
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fromJupiter(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`${JUPITER_PRICE_API}?ids=${mint}`);
  if (!res) {
    console.warn('[price:jupiter] no response (timeout or network)');
    return null;
  }
  if (!res.ok) {
    console.warn(`[price:jupiter] non-ok status=${res.status}`);
    return null;
  }
  try {
    const data = await res.json();
    const tokenData = data?.data?.[mint];
    const rawPrice = tokenData?.usdPrice ?? tokenData?.price;
    if (rawPrice === undefined || rawPrice === null) {
      console.log('[price:jupiter] no usdPrice for mint');
      return null;
    }
    const price = Number(rawPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fromPumpFun(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`${PUMPFUN_COIN_API}/${mint}`);
  if (!res) {
    console.warn('[price:pumpfun] no response (timeout or network)');
    return null;
  }
  if (!res.ok) {
    console.warn(`[price:pumpfun] non-ok status=${res.status}`);
    return null;
  }
  try {
    const data = await res.json();
    const marketCap = Number(data?.usd_market_cap);
    if (!Number.isFinite(marketCap) || marketCap <= 0) return null;
    return marketCap / PUMPFUN_TOTAL_SUPPLY;
  } catch {
    return null;
  }
}

// SOL/USD spot price for the bonding-curve calculation. Jupiter is the
// fast path (SOL is always indexed); Coingecko is the indexer-independent
// fallback so a single rate-limited host doesn't sink the chain.
async function getSolPriceUsd(): Promise<number | null> {
  const jup = await fromJupiter(WSOL_MINT);
  if (jup !== null) return jup;
  const res = await fetchWithTimeout(COINGECKO_SOL_PRICE_API);
  if (!res || !res.ok) {
    console.warn(`[price:sol-usd] coingecko failed status=${res?.status ?? 'none'}`);
    return null;
  }
  try {
    const data = await res.json();
    const price = Number(data?.solana?.usd);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// Read pump.fun bonding curve state directly from Solana mainnet.
//
// Anchor account layout (49 bytes):
//   off  0..7   discriminator
//   off  8..15  virtualTokenReserves : u64 (LE)
//   off 16..23  virtualSolReserves   : u64 (LE)
//   off 24..31  realTokenReserves    : u64 (LE)
//   off 32..39  realSolReserves      : u64 (LE)
//   off 40..47  tokenTotalSupply     : u64 (LE)
//   off 48      complete             : bool
//
// Price-in-SOL = virtualSolReserves / virtualTokenReserves, after
// normalising for the decimal mismatch between lamports (9) and the
// pump.fun token (6). Result × SOL/USD = USD per token.
//
// Returns null when:
//   - PDA derivation fails (malformed mint)
//   - account doesn't exist (not a pump.fun token)
//   - bonding curve has graduated (`complete=true`) — at that point AMM
//     state is the wrong signal; DexScreener / Jupiter already cover it
//   - either the RPC call or SOL/USD lookup fails
async function fromBondingCurve(mint: string): Promise<number | null> {
  let bondingCurvePda: PublicKey;
  try {
    const mintPubkey = new PublicKey(mint);
    const programId = new PublicKey(PUMPFUN_PROGRAM_ID);
    [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [BONDING_CURVE_SEED, mintPubkey.toBuffer()],
      programId,
    );
  } catch (err) {
    console.error(
      `[price:bondingCurve] PDA derivation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  console.log(`[price:bondingCurve] pda=${bondingCurvePda.toBase58()}`);

  let accountDataB64: string | null = null;
  let rpcUsed = '';
  for (const rpcUrl of SOLANA_RPC_URLS) {
    const res = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [bondingCurvePda.toBase58(), { encoding: 'base64', commitment: 'confirmed' }],
      }),
    });
    if (!res || !res.ok) {
      console.warn(`[price:bondingCurve] rpc ${rpcUrl} status=${res?.status ?? 'none'}`);
      continue;
    }
    try {
      const json = await res.json();
      const data = json?.result?.value?.data;
      if (Array.isArray(data) && typeof data[0] === 'string') {
        accountDataB64 = data[0];
        rpcUsed = rpcUrl;
        break;
      }
      console.warn(`[price:bondingCurve] rpc ${rpcUrl} returned no account data`);
    } catch {
      // Try next RPC.
    }
  }
  if (!accountDataB64) {
    console.warn('[price:bondingCurve] no RPC returned account data');
    return null;
  }

  let bytes: Uint8Array;
  try {
    const bin = atob(accountDataB64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (err) {
    console.error(
      `[price:bondingCurve] base64 decode failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  if (bytes.length < 49) {
    console.warn(`[price:bondingCurve] account too small (${bytes.length} bytes)`);
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const virtualTokenReserves = view.getBigUint64(8, true);
  const virtualSolReserves = view.getBigUint64(16, true);
  const complete = bytes[48] !== 0;

  console.log(
    `[price:bondingCurve] rpc=${rpcUsed} vTok=${virtualTokenReserves} vSol=${virtualSolReserves} complete=${complete}`,
  );

  if (complete) {
    // Bonding curve doldu — token Raydium tarafına geçti. Bu noktada AMM
    // state'ini fiyat olarak kullanmak yanıltıcı, DexScreener/Jupiter zaten
    // gerçek pool fiyatını veriyor olmalı.
    return null;
  }
  if (virtualTokenReserves === 0n || virtualSolReserves === 0n) return null;

  const priceSol =
    Number(virtualSolReserves) /
    Number(virtualTokenReserves) /
    10 ** (9 - PUMPFUN_TOKEN_DECIMALS);
  if (!Number.isFinite(priceSol) || priceSol <= 0) return null;

  const solUsd = await getSolPriceUsd();
  if (!solUsd) {
    console.warn('[price:bondingCurve] SOL/USD unavailable, cannot complete USD conversion');
    return null;
  }

  const priceUsd = priceSol * solUsd;
  console.log(`[price:bondingCurve] priceSol=${priceSol} solUsd=${solUsd} priceUsd=${priceUsd}`);
  return Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const url = new URL(req.url);
  const requestedMint = url.searchParams.get('mint') ?? PAYMENT_TOKEN_MINT;

  const dex = await timed('dexscreener', () => fromDexScreener(requestedMint));
  if (dex !== null) {
    return new Response(
      JSON.stringify({ price: dex, source: 'dexscreener', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const jup = await timed('jupiter', () => fromJupiter(requestedMint));
  if (jup !== null) {
    return new Response(
      JSON.stringify({ price: jup, source: 'jupiter', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const curve = await timed('bondingCurve', () => fromBondingCurve(requestedMint));
  if (curve !== null) {
    return new Response(
      JSON.stringify({ price: curve, source: 'bondingCurve', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const pump = await timed('pumpfun', () => fromPumpFun(requestedMint));
  if (pump !== null) {
    return new Response(
      JSON.stringify({ price: pump, source: 'pumpfun', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.warn(`[price] all sources returned null for mint=${requestedMint}`);
  return new Response(
    JSON.stringify({ price: null, source: null, mint: requestedMint, error: 'No price source returned a value' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
