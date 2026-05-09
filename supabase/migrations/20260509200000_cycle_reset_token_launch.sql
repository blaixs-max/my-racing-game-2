-- Sprint 8: Token launch cycle reset.
--
-- Resets the cycle anchor from 2026-05-01 to 2026-05-09 (token launch day).
-- Both update_daily_leaderboard() and archive_daily_leaderboard() are
-- recreated with the new anchor; the rest of their bodies are byte-identical
-- to 20260501160000_cycle_48h.sql.
--
-- Also expands the paid_in_token CHECK constraint to allow 'CANCELLED' so
-- the ops team can mark pre-launch unpaid cycle reward rows as cancelled
-- (clean-slate decision, see docs/RUNBOOKS/token-launch.md Phase 1b
-- Option B). The actual UPDATE on paid_at IS NULL rows is run manually
-- via Dashboard SQL during Phase 1, not by this migration — that way the
-- wipe happens at the ops-controlled cutover moment, not on CI deploy.
--
-- Anchor selection rationale: 2026-05-09 is a Saturday. Even-day offsets
-- from this anchor align cycle-end days at 00:00 UTC every other day
-- (2026-05-11, 2026-05-13, ...). The cycle math is identical to
-- 20260501160000_cycle_48h.sql, only the anchor literal differs.
--
-- daily_leaderboard / daily_leaderboard_history wipes are NOT in this
-- migration. They are also Phase 1 ops-team SQL (Dashboard) so they fire
-- at T-15m, not on CI deploy.

BEGIN;

-- ---------------------------------------------------------------------------
-- update_daily_leaderboard() — new anchor 2026-05-09
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_daily_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cycle_start DATE := CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-09')::int % 2);
  existing_score INTEGER;
BEGIN
  SELECT best_score INTO existing_score
  FROM daily_leaderboard
  WHERE wallet_address = NEW.wallet_address
    AND play_date = cycle_start;

  IF existing_score IS NULL THEN
    INSERT INTO daily_leaderboard (
      wallet_address, full_wallet, best_score, best_distance, games_played_today, play_date
    ) VALUES (
      NEW.wallet_address, NEW.wallet_address, NEW.score, NEW.distance, 1, cycle_start
    );
  ELSE
    UPDATE daily_leaderboard
    SET
      best_score = GREATEST(best_score, NEW.score),
      best_distance = GREATEST(best_distance, NEW.distance),
      games_played_today = games_played_today + 1
    WHERE wallet_address = NEW.wallet_address
      AND play_date = cycle_start;
  END IF;

  -- Top 100 cleanup, scoped to the current cycle.
  DELETE FROM daily_leaderboard
  WHERE play_date = cycle_start
    AND wallet_address NOT IN (
      SELECT wallet_address
      FROM daily_leaderboard
      WHERE play_date = cycle_start
      ORDER BY best_score DESC
      LIMIT 100
    );

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- archive_daily_leaderboard() — new anchor 2026-05-09
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_daily_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_cycle_start DATE := CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-09')::int % 2);
  archived_count INTEGER;
  result jsonb;
BEGIN
  SELECT COUNT(*) INTO archived_count
  FROM daily_leaderboard
  WHERE play_date < current_cycle_start;

  IF archived_count > 0 THEN
    INSERT INTO daily_leaderboard_history (
      wallet_address,
      full_wallet,
      best_score,
      best_distance,
      games_played_today,
      play_date,
      archived_at
    )
    SELECT
      wallet_address,
      full_wallet,
      best_score,
      best_distance,
      games_played_today,
      play_date,
      NOW()
    FROM daily_leaderboard
    WHERE play_date < current_cycle_start
    ON CONFLICT (wallet_address, play_date) DO NOTHING;

    DELETE FROM daily_leaderboard WHERE play_date < current_cycle_start;

    result := jsonb_build_object(
      'success', true,
      'archived_count', archived_count,
      'message', 'Expired cycles archived and cleared',
      'current_cycle_start', current_cycle_start,
      'timestamp', NOW()
    );
  ELSE
    result := jsonb_build_object(
      'success', true,
      'archived_count', 0,
      'message', 'No expired cycles to archive (intra-cycle day)',
      'current_cycle_start', current_cycle_start,
      'timestamp', NOW()
    );
  END IF;

  RAISE NOTICE 'Archive result: %', result;

  RETURN result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Expand paid_in_token CHECK to allow 'CANCELLED'
-- ---------------------------------------------------------------------------
-- Pre-launch wipe (Phase 1b Option B in token-launch.md) marks unpaid
-- reward rows with paid_in_token = 'CANCELLED' to preserve audit trail
-- while signalling these rewards will not be paid (clean slate).

ALTER TABLE public.reward_pool_distribution
  DROP CONSTRAINT IF EXISTS reward_pool_distribution_paid_in_token_check;

ALTER TABLE public.reward_pool_distribution
  ADD CONSTRAINT reward_pool_distribution_paid_in_token_check
  CHECK (paid_in_token IN ('SOL', 'TOKABU', 'CANCELLED') OR paid_in_token IS NULL);

COMMENT ON COLUMN public.reward_pool_distribution.paid_in_token IS
  'Which asset was actually transferred to the wallet: SOL, TOKABU, or CANCELLED (pre-launch wipe). NULL until ops team confirms the transfer.';

COMMIT;
