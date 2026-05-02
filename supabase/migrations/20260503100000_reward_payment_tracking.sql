-- Sprint 7-mini PR 1: payment tracking + multi-currency reward storage.
--
-- Adds columns to reward_pool_distribution so the manual-payout workflow
-- can:
--   1) See each cycle winner's reward in USD, SOL, and TOKABU side by side.
--   2) Mark a winner as paid and link the on-chain TX hash.
--   3) Filter "winners not yet paid for cycle X" with a fast partial index.
--
-- The Edge Function calculate-daily-rewards (separate PR) will fill the
-- USD column as before plus the four currency/price columns. paid_at /
-- paid_tx_hash / paid_in_token are filled manually by the ops team via
-- Supabase Dashboard SQL after each cycle's transfers settle.
--
-- Cleanup: 4 legacy rows from the BNB era (2025-12 daily-cycle test data,
-- never paid, no longer applicable since Sprint 1.7b moved to USD and
-- Sprint 6 PR 6.1 moved to 48h cycles). User confirmed deletion 2026-05-03.

-- 1) Multi-currency reward storage. Filled by calculate-daily-rewards at
--    cycle end. NULL on price-fetch failure (defensive — USD column always
--    written, ops team can backfill SOL/TOKABU manually if needed).
ALTER TABLE public.reward_pool_distribution
  ADD COLUMN IF NOT EXISTS reward_amount_sol NUMERIC,
  ADD COLUMN IF NOT EXISTS reward_amount_tokabu NUMERIC,
  ADD COLUMN IF NOT EXISTS sol_price_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS tokabu_price_usd NUMERIC;

-- 2) Payment tracking columns. Filled manually by the ops team after each
--    cycle's transfers are confirmed on-chain. paid_in_token records which
--    asset was actually sent (not which was calculated).
ALTER TABLE public.reward_pool_distribution
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS paid_in_token TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reward_pool_distribution_paid_in_token_check'
  ) THEN
    ALTER TABLE public.reward_pool_distribution
      ADD CONSTRAINT reward_pool_distribution_paid_in_token_check
      CHECK (paid_in_token IN ('SOL', 'TOKABU') OR paid_in_token IS NULL);
  END IF;
END $$;

-- 3) Partial index — fast lookup for "this cycle's unpaid winners" which
--    is the dominant query in the manual-payout runbook.
CREATE INDEX IF NOT EXISTS idx_reward_unpaid
  ON public.reward_pool_distribution (reward_date, wallet_id)
  WHERE paid_at IS NULL;

-- 4) Cleanup legacy BNB-era test rows. The 48h cycle anchor is 2026-05-01;
--    anything older is from the BNB / 24h "daily" world and is invalid in
--    the current USD / 48h system. User-confirmed test data, never paid.
DELETE FROM public.reward_pool_distribution
WHERE reward_date < DATE '2026-05-01';

-- 5) Refresh table comment to reflect the new payment-tracking semantics.
COMMENT ON TABLE public.reward_pool_distribution IS
  'Per-wallet 48h cycle rewards. reward_amount = USD (canonical, 1 LMX UI display). '
  'reward_amount_sol/tokabu = converted at cycle end via DexScreener/Jupiter; NULL on fetch failure. '
  'paid_at + paid_tx_hash + paid_in_token are filled manually by ops after on-chain transfer settles.';

COMMENT ON COLUMN public.reward_pool_distribution.reward_amount IS
  'Canonical USD reward (= getSharePoints(rank) * unitValue, where unitValue = netPoolUSD / totalShares). UI displays this as "X LMX".';

COMMENT ON COLUMN public.reward_pool_distribution.reward_amount_sol IS
  'reward_amount converted to SOL at cycle end. NULL if SOL/USD price fetch failed (DexScreener + Jupiter + CoinGecko all failed).';

COMMENT ON COLUMN public.reward_pool_distribution.reward_amount_tokabu IS
  'reward_amount converted to TOKABU at cycle end. NULL if all price sources failed (DexScreener + Jupiter + transactions-table fallback).';

COMMENT ON COLUMN public.reward_pool_distribution.paid_in_token IS
  'Which asset was actually transferred to the wallet: SOL or TOKABU. NULL until the ops team confirms the transfer.';
