-- Sprint 2.1 follow-up.
--
-- The previous migration (20260501000002_rls_lockdown.sql) revoked EXECUTE
-- on five SECURITY DEFINER functions FROM anon, authenticated. Postgres'
-- default GRANT, however, is `EXECUTE ... TO PUBLIC` — and PUBLIC includes
-- anon, authenticated, and every other role. The targeted REVOKE was
-- therefore a no-op as far as the advisor was concerned: anon and
-- authenticated still inherit EXECUTE through PUBLIC.
--
-- This migration revokes EXECUTE FROM PUBLIC for the same five functions,
-- closing the gap. service_role retains EXECUTE because it has its own
-- explicit grant (set by Supabase) and bypasses RLS.
--
-- Verified after apply: get_advisors should report 0 of
--   anon_security_definer_function_executable
--   authenticated_security_definer_function_executable
--
-- Also documents suspicious_scores in the same way rate_limits was
-- documented in the previous migration.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.submit_score(text, integer, integer, integer, integer)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.update_daily_leaderboard()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.archive_daily_leaderboard()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits(integer)
  FROM PUBLIC;

COMMENT ON TABLE public.suspicious_scores IS
  'Service-role only by design. RLS enabled with no policies; only the submit-score Edge Function (service role) writes here. Read access via Supabase Dashboard for admin forensic review.';

COMMIT;
