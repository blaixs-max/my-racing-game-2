-- Sprint 6 PR 6.1: 48-hour cycle leaderboard.
--
-- Switches the leaderboard reset interval from 24h (daily) to 48h, without
-- changing the schema or column names. `daily_leaderboard.play_date` now
-- represents the START of the cycle that contains today (every other day,
-- anchored at 2026-05-01). UNIQUE (wallet_address, play_date) becomes one
-- row per (wallet, cycle).
--
-- Cron schedule for archive + reward calc stays daily (`0 0 * * *`). The
-- function bodies self-handle cycle boundaries — archive only deletes
-- expired-cycle rows, calc Edge Function (separate file) skips on non-
-- cycle-end days. This avoids cron's tricky month-boundary semantics with
-- '*/2' day-of-month patterns.
--
-- Anchor: 2026-05-01. For any DATE D, cycle_start(D) = D - ((D - anchor) % 2).
--   D = 2026-05-01 -> 2026-05-01 (Cycle 1 starts)
--   D = 2026-05-02 -> 2026-05-01 (still Cycle 1)
--   D = 2026-05-03 -> 2026-05-03 (Cycle 2 starts)
--
-- Schema unchanged: no data migration needed. The column name
-- `games_played_today` is a misnomer post-cycle (counts games per cycle),
-- but renaming would ripple through the landing repo's typed client.

-- ---------------------------------------------------------------------------
-- update_daily_leaderboard()  -- TRIGGER on scores INSERT
--
-- Now writes play_date = cycle_start (not CURRENT_DATE), so a wallet's
-- scores from BOTH days of a cycle aggregate into one row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_daily_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cycle_start DATE := CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-01')::int % 2);
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

  -- Top 100 cleanup, scoped to the current cycle. Rows from prior cycles
  -- (still in daily_leaderboard until archive sweeps them) are not touched.
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
-- archive_daily_leaderboard()  -- pg_cron daily at 00:00 UTC
--
-- Now only archives EXPIRED cycles (play_date < current cycle_start). Daily
-- runs are idempotent: on intra-cycle days there is nothing to archive, so
-- it returns early. On cycle-end days it sweeps the just-finished cycle.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_daily_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_cycle_start DATE := CURRENT_DATE - ((CURRENT_DATE - DATE '2026-05-01')::int % 2);
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
