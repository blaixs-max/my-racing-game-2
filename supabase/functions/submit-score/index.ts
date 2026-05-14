// Supabase Edge Function: submit-score
//
// Server-side anti-cheat validation in front of the submit_score RPC.
// Frontend posts the raw game result here instead of calling the RPC
// directly. Anomalous submissions are logged to public.suspicious_scores
// and rejected with HTTP 422; the row is preserved for forensic review.
//
// Validated invariants (conservative — tighten after observing prod):
//   - wallet is a valid Solana base58 address
//   - duration >= MIN_GAME_DURATION seconds
//   - distance <= MAX_SPEED_M_PER_S * duration
//   - coins  <= floor(distance / MIN_M_PER_COIN)
//   - score  <= distance * MAX_SCORE_PER_M
//   - clientStartTime drift <= TIME_DRIFT_TOLERANCE seconds (if provided)
//
// Rate limit: 6 submissions per wallet per minute (legitimate play
// caps around 5/min since the duration floor is 10s).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface SubmitScoreBody {
  wallet: string;
  score: number;
  distance: number;
  duration: number;
  coins: number;
  nearMisses?: number;
  gameMode?: string;
  // unix seconds when the client started the game; used to detect time drift
  clientStartTime?: number;
}

const isValidSolanaAddress = (a: string): boolean =>
  /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

// --- Anti-cheat thresholds ---------------------------------------------
// Tuned to catch obvious cheats (sub-second runs, impossible distance,
// score-per-meter outliers) while allowing legitimate skilled play.
const MAX_SPEED_M_PER_S = 60;       // 200 km/h ≈ 55 m/s; +10% tolerance
const MIN_GAME_DURATION = 10;       // seconds; bot-like below this
// Coin spawn density floor. Originally 50, relaxed to 10 (2026-05-01) after
// legit plays at ~24 m/coin tripped the rule. After the magnet power-up
// shipped (commit 80e05f6) the linear density rule became a structural
// false-positive generator: magnet auto-collects every coin in front of the
// player from any lane for 10s, so 1 coin / ~7m is normal during a magnet
// burst (see suspicious_scores wallet 5bMz...7bqY, 2026-05-14). Loosen to
// 3m/coin — still catches teleport-style cheats (e.g. 1000 coins in 100m)
// while leaving room for magnet bursts. score_anomaly already enforces the
// score-density ceiling.
const MIN_M_PER_COIN = 3;
const MAX_SCORE_PER_M = 200;        // empirical score-density ceiling
const TIME_DRIFT_TOLERANCE = 5;     // seconds for clientStartTime
// -----------------------------------------------------------------------

function validate(body: SubmitScoreBody): string[] {
  const reasons: string[] = [];

  const score = Number(body.score);
  const distance = Number(body.distance);
  const duration = Number(body.duration);
  const coins = Number(body.coins ?? 0);

  if (!Number.isFinite(score) || score < 0) reasons.push('invalid_score');
  if (!Number.isFinite(distance) || distance < 0) reasons.push('invalid_distance');
  if (!Number.isFinite(duration) || duration < MIN_GAME_DURATION) reasons.push('duration_too_short');
  if (!Number.isFinite(coins) || coins < 0) reasons.push('invalid_coins');

  if (Number.isFinite(distance) && Number.isFinite(duration) && duration > 0) {
    if (distance > MAX_SPEED_M_PER_S * duration) reasons.push('speed_violation');
  }

  if (Number.isFinite(distance) && Number.isFinite(coins) && distance > 0) {
    if (coins > Math.floor(distance / MIN_M_PER_COIN)) reasons.push('coin_density');
  }

  if (Number.isFinite(score) && Number.isFinite(distance)) {
    if (score > distance * MAX_SCORE_PER_M) reasons.push('score_anomaly');
  }

  if (typeof body.clientStartTime === 'number' && Number.isFinite(duration)) {
    const nowSec = Math.floor(Date.now() / 1000);
    const drift = Math.abs(nowSec - body.clientStartTime - duration);
    if (drift > TIME_DRIFT_TOLERANCE) reasons.push('time_mismatch');
  }

  return reasons;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = (await req.json()) as SubmitScoreBody;

    // Wallet must come first so we can rate-limit per wallet.
    if (!body.wallet || !isValidSolanaAddress(body.wallet)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid_wallet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: rlAllowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_key: body.wallet,
      p_action: 'submit_score',
      p_max_requests: 6,
      p_window_seconds: 60,
    });
    if (rlError) {
      console.warn('Rate limit check failed (failing open):', rlError.message);
    } else if (rlAllowed === false) {
      return new Response(
        JSON.stringify({ ok: false, error: 'rate_limited' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const reasons = validate(body);

    if (reasons.length > 0) {
      // Log the anomalous submission (best-effort; log row failure does not
      // block the rejection response).
      const { error: logError } = await supabase.from('suspicious_scores').insert({
        wallet_address: body.wallet,
        score: Math.max(0, Math.floor(Number(body.score) || 0)),
        distance: Math.max(0, Math.floor(Number(body.distance) || 0)),
        duration: Math.max(0, Math.floor(Number(body.duration) || 0)),
        coins_collected: Math.max(0, Math.floor(Number(body.coins ?? 0) || 0)),
        near_miss_count: body.nearMisses != null ? Math.floor(Number(body.nearMisses)) : null,
        game_mode: body.gameMode ?? null,
        reasons,
        payload: body,
      });
      if (logError) {
        console.warn('suspicious_scores insert failed:', logError.message);
      }

      return new Response(
        JSON.stringify({ ok: false, error: 'score_rejected', reasons }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Valid submission — record via existing submit_score RPC.
    const { error: rpcError } = await supabase.rpc('submit_score', {
      p_wallet: body.wallet,
      p_score: Math.floor(Number(body.score)),
      p_duration: Math.floor(Number(body.duration)),
      p_distance: Math.floor(Number(body.distance)),
      p_coins: Math.floor(Number(body.coins ?? 0)),
    });

    if (rpcError) {
      console.error('submit_score RPC failed:', rpcError.message);
      return new Response(
        JSON.stringify({ ok: false, error: 'rpc_failed', message: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('submit-score error:', error);
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: 'internal_error', message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
