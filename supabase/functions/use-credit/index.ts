// Supabase Edge Function: Use Credit
// This function safely deducts credits from a user's account

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UseCreditRequest {
  walletAddress: string;
  amount?: number; // Default: 1
}

serve(async (req) => {
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
    if (!walletAddress) {
      return new Response(
        JSON.stringify({ success: false, error: 'Wallet address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amount < 1 || amount > 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid credit amount (1-10)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
