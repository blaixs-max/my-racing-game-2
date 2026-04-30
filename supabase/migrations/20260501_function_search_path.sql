-- Sprint 2.5: Pin search_path on all SECURITY DEFINER / public functions
--
-- Supabase advisor flags 9 functions whose search_path is "mutable" — the
-- function body resolves unqualified names against whatever search_path the
-- caller has set. A malicious caller can set search_path to a schema they
-- control and have the function call their version of (e.g.) `now()` or
-- table references, escalating privileges via SECURITY DEFINER functions.
--
-- Fix: ALTER FUNCTION ... SET search_path = public, pg_temp.
-- This is a metadata-only change; function bodies and behaviour are
-- unchanged. Reversible via `RESET search_path`.
--
-- The DO block below resolves overloaded signatures dynamically via
-- pg_get_function_identity_arguments, so we do not have to enumerate
-- argument lists for each function.
--
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

DO $$
DECLARE
  func_signature text;
BEGIN
  FOR func_signature IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_updated_at_column',
        'distribute_daily_team_bonus',
        'update_team_selection',
        'archive_daily_leaderboard',
        'update_daily_leaderboard',
        'submit_score',
        'check_rate_limit',
        'cleanup_rate_limits',
        'end_the_day'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp',
                   func_signature);
    RAISE NOTICE 'Pinned search_path on %', func_signature;
  END LOOP;
END $$;
