// Supabase Edge Function: Archive Daily Leaderboard
// Bu function her gece 00:00'da çalışır ve daily_leaderboard'u arşivler

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authorization check (cron secret veya service role)
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');

    // Cron secret ile veya service role key ile çağrılabilir
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Service role key kontrolü
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!authHeader?.includes(supabaseKey || '')) {
        console.log('⚠️ Unauthorized request attempt');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🕐 Starting daily leaderboard archive process...');

    // 1. GET TODAY'S DATE (for logging)
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Archiving data for date: ${today}`);

    // 2. GET ALL RECORDS FROM daily_leaderboard
    const { data: leaderboardData, error: fetchError } = await supabase
      .from('daily_leaderboard')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch daily_leaderboard: ${fetchError.message}`);
    }

    if (!leaderboardData || leaderboardData.length === 0) {
      console.log('ℹ️ No data to archive - daily_leaderboard is empty');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No data to archive',
          archived_count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${leaderboardData.length} records to archive`);

    // 3. COPY TO daily_leaderboard_history
    const historyRecords = leaderboardData.map(record => ({
      wallet_address: record.wallet_address,
      full_wallet: record.full_wallet,
      best_score: record.best_score,
      best_distance: record.best_distance,
      games_played_today: record.games_played_today,
      play_date: record.play_date,
      archived_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('daily_leaderboard_history')
      .insert(historyRecords);

    if (insertError) {
      throw new Error(`Failed to insert into history: ${insertError.message}`);
    }

    console.log(`✅ Archived ${historyRecords.length} records to history`);

    // 4. CLEAR daily_leaderboard
    const { error: deleteError } = await supabase
      .from('daily_leaderboard')
      .delete()
      .neq('wallet_address', ''); // Delete all records (Supabase requires a condition)

    if (deleteError) {
      throw new Error(`Failed to clear daily_leaderboard: ${deleteError.message}`);
    }

    console.log('🧹 Cleared daily_leaderboard table');

    // 5. RETURN SUCCESS
    const result = {
      success: true,
      message: 'Daily leaderboard archived successfully',
      archived_count: historyRecords.length,
      archive_date: today,
      timestamp: new Date().toISOString()
    };

    console.log('🎉 Archive process completed:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Archive Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
