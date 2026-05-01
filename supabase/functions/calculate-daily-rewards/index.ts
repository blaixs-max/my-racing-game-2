// Sprint 6 PR 6.1: 48-hour cycle reward calculation.
//
// pg_cron fires this every night at 00:00 UTC, but rewards are calculated
// only on cycle-end days (every 2 days from the 2026-05-01 anchor). On
// intra-cycle days the function returns 200 with a skip message.
//
// On a cycle-end day:
//   - "previous cycle" = the just-ended 48-hour window
//   - leaderboard source: daily_leaderboard (filtered to the previous cycle's
//     play_date) with daily_leaderboard_history fallback in case the archive
//     job already swept the row before this Edge Function read it.
//   - games count window: scores.created_at in [prevCycleStart, cycleStart).
//   - reward_pool_distribution.reward_date is set to prevCycleStartIso so
//     the row identifies the cycle the rewards were earned in.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// 1 Game = $1 USD (matches verify-payment package pricing: 1/5/10 USD).
// USD is the stable unit of account; the frontend converts to TOKABU at
// display time using the live token price (Jupiter / DexScreener).
const GAME_TO_USD = 1.0

// Cycle anchor: must match the value baked into update_daily_leaderboard()
// and archive_daily_leaderboard() in migration 20260501160000_cycle_48h.sql.
const CYCLE_ANCHOR_DATE = '2026-05-01'
const MS_PER_DAY = 86_400_000

// Hisse puanları referans tablosu
function getSharePoints(rank: number): number {
  if (rank === 1) return 125
  if (rank === 2) return 100
  if (rank === 3) return 75
  if (rank === 4) return 50
  if (rank === 5) return 25
  if (rank >= 6 && rank <= 50) return 8
  if (rank >= 51 && rank <= 100) return 4
  return 0
}

// Returns the start date (UTC) of the 48h cycle that contains `now`.
function cycleStartFor(now: Date): Date {
  const anchor = new Date(`${CYCLE_ANCHOR_DATE}T00:00:00Z`)
  const daysSinceAnchor = Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY)
  const cycleStartDay = daysSinceAnchor - (daysSinceAnchor % 2)
  return new Date(anchor.getTime() + cycleStartDay * MS_PER_DAY)
}

Deno.serve(async () => {
  try {
    const now = new Date()
    const cycleStart = cycleStartFor(now)
    const anchor = new Date(`${CYCLE_ANCHOR_DATE}T00:00:00Z`)
    const daysSinceAnchor = Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY)

    // Cycle-end days are even-day offsets from the anchor (e.g. day 2, 4, 6).
    // Day 0 (the anchor itself) is the start of cycle 1 — there is no
    // previous cycle yet, so we skip too.
    const isCycleEndDay = daysSinceAnchor > 0 && daysSinceAnchor % 2 === 0
    if (!isCycleEndDay) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: 'Not a cycle-end day; rewards unchanged',
          daysSinceAnchor,
          currentCycleStart: cycleStart.toISOString().split('T')[0],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Previous cycle: the 48h window that just closed.
    const prevCycleStart = new Date(cycleStart.getTime() - 2 * MS_PER_DAY)
    const prevCycleStartIso = prevCycleStart.toISOString().split('T')[0]
    const prevCycleStartTs = prevCycleStart.toISOString()
    const cycleStartTs = cycleStart.toISOString()

    // 1. Total games in the just-closed cycle.
    const { count: totalGames, error: scoresError } = await supabase
      .from('scores')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', prevCycleStartTs)
      .lt('created_at', cycleStartTs)

    if (scoresError) throw scoresError

    const totalPoolUSD = (totalGames || 0) * GAME_TO_USD
    const netPoolUSD = totalPoolUSD * 0.925 // %7.5 kesinti (treasury / marketing / weekly burns)

    // 2. Leaderboard for the just-closed cycle. Read from daily_leaderboard
    //    first; if the archive cron already swept the row, fall back to
    //    daily_leaderboard_history. Both jobs fire at 00:00 UTC, so this
    //    fallback removes the cron-ordering race condition.
    let leaderboard: Array<{ wallet_address: string; full_wallet: string | null; best_score: number }> = []

    const { data: liveLb, error: liveLbError } = await supabase
      .from('daily_leaderboard')
      .select('wallet_address, full_wallet, best_score')
      .eq('play_date', prevCycleStartIso)
      .order('best_score', { ascending: false })
      .limit(100)

    if (liveLbError) throw liveLbError
    leaderboard = liveLb ?? []

    if (leaderboard.length === 0) {
      const { data: historyLb, error: historyLbError } = await supabase
        .from('daily_leaderboard_history')
        .select('wallet_address, full_wallet, best_score')
        .eq('play_date', prevCycleStartIso)
        .order('best_score', { ascending: false })
        .limit(100)

      if (historyLbError) throw historyLbError
      leaderboard = historyLb ?? []
    }

    if (leaderboard.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No players in previous cycle', prevCycleStart: prevCycleStartIso }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 3. Per-player games in the just-closed cycle, used for the bonus.
    const playersWithBonus = await Promise.all(
      leaderboard.map(async (player) => {
        const walletToCheck = player.full_wallet || player.wallet_address

        const { count: gamesPlayed } = await supabase
          .from('scores')
          .select('*', { count: 'exact', head: true })
          .eq('wallet_address', walletToCheck)
          .gte('created_at', prevCycleStartTs)
          .lt('created_at', cycleStartTs)

        const games = gamesPlayed || 0
        const bonusPercent = games >= 2 ? games : 0
        const boostedScore = Math.round(player.best_score * (1 + bonusPercent / 100))

        return {
          ...player,
          wallet_id: walletToCheck,
          gamesPlayed: games,
          bonusPercent,
          boostedScore,
        }
      }),
    )

    // 4. Re-rank by boosted score.
    playersWithBonus.sort((a, b) => b.boostedScore - a.boostedScore)

    // 5. Total share points across the top 100.
    let totalShares = 0
    playersWithBonus.slice(0, 100).forEach((_, index) => {
      totalShares += getSharePoints(index + 1)
    })

    // 6. Unit value (USD per share).
    const unitValue = totalShares > 0 ? netPoolUSD / totalShares : 0

    // 7. Build reward records, tagged with the cycle they belong to.
    const rewardRecords = playersWithBonus.slice(0, 100).map((player, index) => {
      const rank = index + 1
      const sharePoints = getSharePoints(rank)
      const rewardAmount = sharePoints * unitValue

      return {
        wallet_id: player.wallet_id,
        score: player.boostedScore,
        reward_amount: Number(rewardAmount.toFixed(4)),
        reward_date: prevCycleStartIso,
      }
    })

    // 8. Idempotency: clear the cycle's old records (in case of re-run) and
    //    insert fresh ones.
    await supabase
      .from('reward_pool_distribution')
      .delete()
      .eq('reward_date', prevCycleStartIso)

    const { error: insertError } = await supabase
      .from('reward_pool_distribution')
      .insert(rewardRecords)

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({
        success: true,
        message: `Calculated rewards for ${rewardRecords.length} players (cycle ${prevCycleStartIso})`,
        cycle: {
          start: prevCycleStartIso,
          windowEndsAt: cycleStartTs,
        },
        totalGames: totalGames || 0,
        totalPoolUSD,
        netPoolUSD,
        totalShares,
        unitValue,
        topPlayers: playersWithBonus.slice(0, 5).map((p) => ({
          wallet: p.wallet_id.slice(0, 10) + '...',
          originalScore: p.best_score,
          gamesPlayed: p.gamesPlayed,
          bonusPercent: p.bonusPercent,
          boostedScore: p.boostedScore,
        })),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
