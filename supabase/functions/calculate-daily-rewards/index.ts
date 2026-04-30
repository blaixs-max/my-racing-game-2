import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// 1 Game = $1 USD (matches verify-payment package pricing: 1/5/10 USD)
// USD chosen as the stable unit of account; frontend converts to TOKABU
// at display time using the live token price (Jupiter / DexScreener).
const GAME_TO_USD = 1.0

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

Deno.serve(async (req) => {
  try {
    // 1. Bugünün tarihini al (UTC)
    const today = new Date().toISOString().split('T')[0]

    // 2. Bugünkü oyun sayısını scores tablosundan al
    const { count: totalGames, error: scoresError } = await supabase
      .from('scores')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)

    if (scoresError) throw scoresError

    // Oyun sayısını USD havuzuna çevir
    const totalPoolUSD = (totalGames || 0) * GAME_TO_USD
    const netPoolUSD = totalPoolUSD * 0.925 // %7.5 kesinti (treasury / marketing / weekly burns)

    // 3. Bugünkü leaderboard'u al
    const { data: leaderboard, error: lbError } = await supabase
      .from('daily_leaderboard')
      .select('wallet_address, full_wallet, best_score')
      .limit(100)

    if (lbError) throw lbError
    if (!leaderboard || leaderboard.length === 0) {
      return new Response(JSON.stringify({ message: 'No players today' }), { status: 200 })
    }

    // 4. Her oyuncu için bugünkü oyun sayısını al ve boosted score hesapla
    const playersWithBonus = await Promise.all(
      leaderboard.map(async (player) => {
        const walletToCheck = player.full_wallet || player.wallet_address

        // Oyuncunun bugünkü oyun sayısını al
        const { count: gamesPlayed } = await supabase
          .from('scores')
          .select('*', { count: 'exact', head: true })
          .eq('wallet_address', walletToCheck)
          .gte('created_at', `${today}T00:00:00`)
          .lt('created_at', `${today}T23:59:59`)

        const games = gamesPlayed || 0
        const bonusPercent = games >= 2 ? games : 0
        const boostedScore = Math.round(player.best_score * (1 + bonusPercent / 100))

        return {
          ...player,
          wallet_id: walletToCheck,
          gamesPlayed: games,
          bonusPercent,
          boostedScore
        }
      })
    )

    // 5. Boosted score'a göre sırala
    playersWithBonus.sort((a, b) => b.boostedScore - a.boostedScore)

    // 6. Toplam hisse puanını hesapla
    let totalShares = 0
    playersWithBonus.slice(0, 100).forEach((_, index) => {
      totalShares += getSharePoints(index + 1)
    })

    // 7. Birim değeri hesapla (USD per share)
    const unitValue = totalShares > 0 ? netPoolUSD / totalShares : 0

    // 8. Her oyuncunun ödülünü hesapla ve kaydet
    const rewardRecords = playersWithBonus.slice(0, 100).map((player, index) => {
      const rank = index + 1
      const sharePoints = getSharePoints(rank)
      const rewardAmount = sharePoints * unitValue

      return {
        wallet_id: player.wallet_id,
        score: player.boostedScore,
        reward_amount: Number(rewardAmount.toFixed(4)),
        reward_date: today
      }
    })

    // 9. Önce bugünün eski kayıtlarını sil (varsa)
    await supabase
      .from('reward_pool_distribution')
      .delete()
      .eq('reward_date', today)

    // 10. Yeni kayıtları ekle
    const { error: insertError } = await supabase
      .from('reward_pool_distribution')
      .insert(rewardRecords)

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({
        success: true,
        message: `Calculated rewards for ${rewardRecords.length} players`,
        totalGames: totalGames || 0,
        totalPoolUSD,
        netPoolUSD,
        totalShares,
        unitValue,
        topPlayers: playersWithBonus.slice(0, 5).map(p => ({
          wallet: p.wallet_id.slice(0, 10) + '...',
          originalScore: p.best_score,
          gamesPlayed: p.gamesPlayed,
          bonusPercent: p.bonusPercent,
          boostedScore: p.boostedScore
        }))
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
