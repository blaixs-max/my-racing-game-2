// Supabase Edge Function: Use Credit
// This function safely deducts credits from a user's account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS
const allowedOrigins = [
  'https://lumexia.net',
  'https://game.lumexia.net',
  'http://localhost:5173', // Development
];

// Dynamic CORS headers based on request origin
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface UseCreditRequest {
  walletAddress: string;
  amount?: number; // Default: 1
}

// Validation helper - Solana addresses are base58 encoded, 32-44 characters
const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { walletAddress, amount = 1 }: UseCreditRequest = await req.json();

    // Validate input
    if (!walletAddress || !isValidSolanaAddress(walletAddress)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid wallet address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid credit amount (must be integer 1-10)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: max 30 credit uses per wallet per minute. Generous enough
    // for normal play (≤1 game/sec); a script burning the wallet's credits
    // hits the cap immediately.
    const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
      p_key: walletAddress,
      p_action: 'use_credit',
      p_max_requests: 30,
      p_window_seconds: 60,
    });
    if (rlError) {
      // If the rate-limit table is not yet migrated, fail open (logging) so
      // we do not break the live deploy. After the migration is applied,
      // rlError stops appearing and the limit is enforced.
      console.warn('⚠️ Rate limit check failed (failing open):', rlError.message);
    } else if (allowed === false) {
      return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded. Try again in a minute.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎮 Using ${amount} credit(s) for wallet: ${walletAddress}`);

    // Get current user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, credits, total_games_played')
      .eq('wallet_address', walletAddress)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has enough credits
    if (user.credits < amount) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Insufficient credits',
          currentCredits: user.credits,
          required: amount
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduct credits
    const newCredits = user.credits - amount;
    const newGamesPlayed = (user.total_games_played || 0) + 1;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        credits: newCredits,
        total_games_played: newGamesPlayed,
        last_played: new Date().toISOString()
      })
      .eq('wallet_address', walletAddress);

    if (updateError) {
      console.error('❌ Update error:', updateError);
      throw updateError;
    }

    console.log(`✅ Credit used. Remaining: ${newCredits}`);

    return new Response(
      JSON.stringify({
        success: true,
        creditsUsed: amount,
        remainingCredits: newCredits,
        totalGamesPlayed: newGamesPlayed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
