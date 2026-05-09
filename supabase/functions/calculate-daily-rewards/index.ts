// Sprint 7-mini PR 2: payment-tracking + multi-currency reward storage.
//
// Builds on Sprint 6 PR 6.1's 48h-cycle calculation. New responsibilities:
//   1) Fetch SOL/USD price (3-tier: DexScreener -> Jupiter -> CoinGecko).
//   2) Fetch TOKABU/USD price (2-tier API: DexScreener -> Jupiter).
//   3) If both TOKABU API sources fail, fall back to the transactions
//      table per-wallet: each top-100 wallet's most recent successful
//      payment carries an implicit price (amount / token_amount). For
//      wallets with no transaction history, fall back to the most recent
//      global successful transaction. If even that is missing, write NULL.
//   4) Write reward_amount_sol, reward_amount_tokabu, sol_price_usd,
//      tokabu_price_usd alongside the canonical USD reward_amount.
//
// Defensive design: any individual price fetch can fail without taking
// the cron call down. The USD reward_amount is always written; the
// affected currency column is set to NULL and the ops team backfills
// via Dashboard SQL if needed. See docs/RUNBOOKS/manual-payout.md
// (Sprint 7-mini PR 3) for the manual fix-up procedure.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// 1 Game = $1 USD (matches verify-payment package pricing: 1/5/10 USD).
const GAME_TO_USD = 1.0

// Cycle anchor: must match update_daily_leaderboard() and
// archive_daily_leaderboard() in 20260509200000_cycle_reset_token_launch.sql.
// Sprint 8 token launch reset moved the anchor from 2026-05-01 to 2026-05-09.
const CYCLE_ANCHOR_DATE = '2026-05-09'
const MS_PER_DAY = 86_400_000

// Token + SOL identifiers for price API calls. PAYMENT_TOKEN_MINT mirrors
// the verify-payment / reconcile-payments env contract.
const TOKABU_MINT = Deno.env.get('PAYMENT_TOKEN_MINT')
  ?? 'H8xQ6poBjB9DTPMDTKWzWPrnxu4bDEhybxiouF8Ppump'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const COINGECKO_SOL_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'

// Hard timeout per external request — keeps the cron call from hanging
// when an upstream API is slow.
const FETCH_TIMEOUT_MS = 8000

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

function cycleStartFor(now: Date): Date {
  const anchor = new Date(`${CYCLE_ANCHOR_DATE}T00:00:00Z`)
  const daysSinceAnchor = Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY)
  const cycleStartDay = daysSinceAnchor - (daysSinceAnchor % 2)
  return new Date(anchor.getTime() + cycleStartDay * MS_PER_DAY)
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Pick the highest-liquidity pair from a DexScreener tokens response —
// most accurate price; smaller pools can be heavily manipulated.
async function fetchPriceFromDexScreener(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
  if (!res || !res.ok) return null
  try {
    const data = await res.json()
    const pairs = data?.pairs
    if (!Array.isArray(pairs) || pairs.length === 0) return null
    const best = pairs.reduce((acc: any, p: any) => {
      const liq = Number(p?.liquidity?.usd ?? 0)
      const accLiq = Number(acc?.liquidity?.usd ?? 0)
      return liq > accLiq ? p : acc
    }, pairs[0])
    const priceStr = best?.priceUsd
    if (!priceStr) return null
    const price = Number.parseFloat(String(priceStr))
    return Number.isFinite(price) && price > 0 ? price : null
  } catch {
    return null
  }
}

async function fetchPriceFromJupiter(mint: string): Promise<number | null> {
  const res = await fetchWithTimeout(`https://price.jup.ag/v6/price?ids=${mint}`)
  if (!res || !res.ok) return null
  try {
    const data = await res.json()
    const price = data?.data?.[mint]?.price
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null
    return price
  } catch {
    return null
  }
}

async function fetchSolPriceFromCoinGecko(): Promise<number | null> {
  const res = await fetchWithTimeout(COINGECKO_SOL_URL)
  if (!res || !res.ok) return null
  try {
    const data = await res.json()
    const price = data?.solana?.usd
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null
    return price
  } catch {
    return null
  }
}

async function fetchSolPriceUsd(): Promise<number | null> {
  const dex = await fetchPriceFromDexScreener(SOL_MINT)
  if (dex !== null) return dex
  const jup = await fetchPriceFromJupiter(SOL_MINT)
  if (jup !== null) return jup
  const cg = await fetchSolPriceFromCoinGecko()
  if (cg !== null) return cg
  return null
}

async function fetchTokabuPriceUsd(): Promise<number | null> {
  const dex = await fetchPriceFromDexScreener(TOKABU_MINT)
  if (dex !== null) return dex
  const jup = await fetchPriceFromJupiter(TOKABU_MINT)
  if (jup !== null) return jup
  return null
}

// Build a per-wallet TOKABU/USD price map from past successful payments.
// Invoked only when both DexScreener and Jupiter fail. Each wallet's most
// recent transaction at or before the cycle end carries an implicit price
// (USD amount / TOKABU amount). The global most-recent transaction price
// covers wallets that have no payment history of their own.
async function buildTokabuPriceDbFallback(
  walletAddresses: string[],
  cycleEndTs: string,
): Promise<{ perWallet: Map<string, number>; globalPrice: number | null }> {
  const perWallet = new Map<string, number>()
  let globalPrice: number | null = null

  // transactions.user_id is FK to users.id (UUID), not the wallet string;
  // resolve walletAddress -> user_id once.
  const { data: users } = await supabase
    .from('users')
    .select('id, wallet_address')
    .in('wallet_address', walletAddresses)

  const userIdToWallet = new Map<string, string>()
  for (const u of (users ?? [])) {
    userIdToWallet.set(u.id, u.wallet_address)
  }
  const userIds = Array.from(userIdToWallet.keys())

  if (userIds.length > 0) {
    const { data: txs } = await supabase
      .from('transactions')
      .select('user_id, amount, token_amount, created_at')
      .in('user_id', userIds)
      .gt('token_amount', 0)
      .gt('amount', 0)
      .lte('created_at', cycleEndTs)
      .order('created_at', { ascending: false })

    // First (most recent) row per user wins.
    const seen = new Set<string>()
    for (const tx of (txs ?? [])) {
      if (seen.has(tx.user_id)) continue
      seen.add(tx.user_id)
      const wa = userIdToWallet.get(tx.user_id)
      if (!wa) continue
      const price = Number(tx.amount) / Number(tx.token_amount)
      if (Number.isFinite(price) && price > 0) {
        perWallet.set(wa, price)
      }
    }
  }

  // Global fallback: most recent successful TOKABU transaction (any wallet).
  const { data: globalTx } = await supabase
    .from('transactions')
    .select('amount, token_amount, created_at')
    .gt('token_amount', 0)
    .gt('amount', 0)
    .lte('created_at', cycleEndTs)
    .order('created_at', { ascending: false })
    .limit(1)

  if (globalTx?.[0]) {
    const price = Number(globalTx[0].amount) / Number(globalTx[0].token_amount)
    if (Number.isFinite(price) && price > 0) {
      globalPrice = price
    }
  }

  return { perWallet, globalPrice }
}

Deno.serve(async () => {
  try {
    const now = new Date()
    const cycleStart = cycleStartFor(now)
    const anchor = new Date(`${CYCLE_ANCHOR_DATE}T00:00:00Z`)
    const daysSinceAnchor = Math.floor((now.getTime() - anchor.getTime()) / MS_PER_DAY)

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
    const netPoolUSD = totalPoolUSD * 0.925 // %7.5 treasury / marketing / weekly burns

    // 2. Leaderboard (history fallback if archive cron beat us to it).
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

    // 3. Per-player games + bonus.
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
    const top100 = playersWithBonus.slice(0, 100)

    // 5. Total share points.
    let totalShares = 0
    top100.forEach((_, index) => {
      totalShares += getSharePoints(index + 1)
    })

    // 6. Unit value (USD per share).
    const unitValue = totalShares > 0 ? netPoolUSD / totalShares : 0

    // 7. Multi-currency price discovery (run SOL + TOKABU API in parallel).
    const [solPriceUsd, tokabuApiPrice] = await Promise.all([
      fetchSolPriceUsd(),
      fetchTokabuPriceUsd(),
    ])

    let tokabuDbFallback: { perWallet: Map<string, number>; globalPrice: number | null } | null = null
    if (tokabuApiPrice === null) {
      console.warn(
        'TOKABU price unavailable from DexScreener+Jupiter; using transactions-table fallback',
      )
      tokabuDbFallback = await buildTokabuPriceDbFallback(
        top100.map((p) => p.wallet_id),
        cycleStartTs,
      )
    }

    function tokabuPriceForWallet(walletId: string): number | null {
      if (tokabuApiPrice !== null) return tokabuApiPrice
      if (!tokabuDbFallback) return null
      return tokabuDbFallback.perWallet.get(walletId)
        ?? tokabuDbFallback.globalPrice
        ?? null
    }

    // 8. Build reward records — USD canonical, SOL/TOKABU best-effort.
    let priceFallbackHits = 0
    const rewardRecords = top100.map((player, index) => {
      const rank = index + 1
      const sharePoints = getSharePoints(rank)
      const rewardAmount = sharePoints * unitValue

      const tokabuPrice = tokabuPriceForWallet(player.wallet_id)
      if (tokabuApiPrice === null && tokabuPrice !== null) priceFallbackHits++

      const rewardSol = solPriceUsd !== null && solPriceUsd > 0
        ? rewardAmount / solPriceUsd
        : null
      const rewardTokabu = tokabuPrice !== null && tokabuPrice > 0
        ? rewardAmount / tokabuPrice
        : null

      return {
        wallet_id: player.wallet_id,
        score: player.boostedScore,
        reward_amount: Number(rewardAmount.toFixed(4)),
        reward_amount_sol: rewardSol !== null ? Number(rewardSol.toFixed(8)) : null,
        reward_amount_tokabu: rewardTokabu !== null ? Number(rewardTokabu.toFixed(4)) : null,
        sol_price_usd: solPriceUsd !== null ? Number(solPriceUsd.toFixed(6)) : null,
        tokabu_price_usd: tokabuPrice !== null ? Number(tokabuPrice.toFixed(10)) : null,
        reward_date: prevCycleStartIso,
      }
    })

    // 9. Idempotent insert: clear cycle's old records, insert fresh.
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
        prices: {
          sol_usd: solPriceUsd,
          tokabu_usd_api: tokabuApiPrice,
          tokabu_used_db_fallback: tokabuApiPrice === null,
          tokabu_db_fallback_hits: priceFallbackHits,
          tokabu_db_global_fallback: tokabuDbFallback?.globalPrice ?? null,
        },
        topPlayers: top100.slice(0, 5).map((p) => ({
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
