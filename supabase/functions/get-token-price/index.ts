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
// Returns: { price: number | null, source: 'dexscreener' | 'jupiter' | 'pumpfun' | null, mint: string }
//
// No auth beyond the Supabase anon key (read-only price lookup, no PII,
// no writes). Same CORS allowlist as verify-payment.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fromDexScreener(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`${DEXSCREENER_API}/${mint}`);
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    if (!Array.isArray(data?.pairs) || data.pairs.length === 0) return null;
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
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const tokenData = data?.data?.[mint];
    const rawPrice = tokenData?.usdPrice ?? tokenData?.price;
    if (rawPrice === undefined || rawPrice === null) return null;
    const price = Number(rawPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fromPumpFun(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`${PUMPFUN_COIN_API}/${mint}`);
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const marketCap = Number(data?.usd_market_cap);
    if (!Number.isFinite(marketCap) || marketCap <= 0) return null;
    return marketCap / PUMPFUN_TOTAL_SUPPLY;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Accept GET (cacheable) or POST (matches existing client patterns).
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Optional `?mint=...` override so the frontend can request a price for a
  // non-default mint (useful for explorer/diagnostic UIs). Falls back to the
  // active payment mint when absent.
  const url = new URL(req.url);
  const requestedMint = url.searchParams.get('mint') ?? PAYMENT_TOKEN_MINT;

  // Same order as verify-payment / reconcile-payments — DexScreener first
  // (deepest signal once a token has on-chain liquidity), Jupiter v2
  // second, pump.fun bonding curve as the final tier for pre-graduation mints.
  const dex = await fromDexScreener(requestedMint);
  if (dex !== null) {
    return new Response(
      JSON.stringify({ price: dex, source: 'dexscreener', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const jup = await fromJupiter(requestedMint);
  if (jup !== null) {
    return new Response(
      JSON.stringify({ price: jup, source: 'jupiter', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const pump = await fromPumpFun(requestedMint);
  if (pump !== null) {
    return new Response(
      JSON.stringify({ price: pump, source: 'pumpfun', mint: requestedMint }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ price: null, source: null, mint: requestedMint, error: 'No price source returned a value' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
