-- Sprint 2.1: RLS lockdown.
--
-- Closes the security gaps the Supabase advisor has been flagging since
-- Sprint 0.5. Three sections:
--   1. INSERT policies that allowed anyone to write to scores/users
--   2. Duplicate permissive SELECT policies (perf + cognitive load)
--   3. EXECUTE on SECURITY DEFINER functions revoked from anon/authenticated
--
-- This is safe to apply now because Sprint 2.2b shipped the submit-score
-- Edge Function and the frontend already calls it via the service role.
-- Edge Functions (verify-payment, use-credit, submit-score,
-- calculate-daily-rewards) all use SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS and is unaffected by these REVOKE statements.

BEGIN;

-- ============================================================================
-- Section 1: INSERT lockdown
-- ============================================================================
-- public.scores: anon could insert via "Anyone can insert scores" with
-- WITH CHECK (true). Drop it; submit-score Edge Function (service role)
-- still inserts via the submit_score RPC, which bypasses RLS.
DROP POLICY IF EXISTS "Anyone can insert scores" ON public.scores;

-- public.users: same pattern. verify-payment Edge Function (service role)
-- creates users on first purchase via direct INSERT.
DROP POLICY IF EXISTS "Anyone can insert users" ON public.users;

-- ============================================================================
-- Section 2: Duplicate SELECT policy cleanup
-- ============================================================================
-- Each of the following tables had 3 permissive SELECT policies that all
-- evaluate to the same thing ("public can read"). The advisor flagged
-- this as `multiple_permissive_policies` (perf concern: every query
-- evaluates every matching policy). Keep one, drop the duplicates.
--
-- We keep "Allow public read" on each table for consistency.

-- daily_leaderboard
DROP POLICY IF EXISTS "Anyone can read daily_leaderboard" ON public.daily_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.daily_leaderboard;

-- daily_leaderboard_history
DROP POLICY IF EXISTS "Anyone can read history" ON public.daily_leaderboard_history;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.daily_leaderboard_history;

-- reward_pool_distribution
DROP POLICY IF EXISTS "Allow public read access" ON public.reward_pool_distribution;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.reward_pool_distribution;

-- scores
DROP POLICY IF EXISTS "Anyone can read scores" ON public.scores;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.scores;

-- transactions
DROP POLICY IF EXISTS "Anyone can read transactions" ON public.transactions;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.transactions;

-- users
DROP POLICY IF EXISTS "Anyone can read users" ON public.users;

-- ============================================================================
-- Section 3: Revoke EXECUTE on SECURITY DEFINER functions
-- ============================================================================
-- These functions all run with elevated privileges (SECURITY DEFINER) and
-- were callable by anon/authenticated via /rest/v1/rpc/*. The advisor
-- flagged each as anon_security_definer_function_executable. They are
-- intended to be invoked from Edge Functions (service role) or from
-- triggers/cron (which do not use anon/authenticated), not directly from
-- the frontend.
--
-- Effect after this PR:
--   submit_score             -> only the submit-score Edge Function (service role)
--   check_rate_limit         -> only the Edge Functions (service role)
--   update_daily_leaderboard -> trigger fires it on scores INSERT (no role check)
--   archive_daily_leaderboard -> pg_cron runs it (postgres role)
--   cleanup_rate_limits      -> service-role admin only

REVOKE EXECUTE ON FUNCTION public.submit_score(text, integer, integer, integer, integer)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_daily_leaderboard()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.archive_daily_leaderboard()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits(integer)
  FROM anon, authenticated;

-- ============================================================================
-- Section 4: Document the rate_limits table design
-- ============================================================================
-- The rate_limits table has RLS enabled with no policies. That is the
-- intended design: only service_role (which bypasses RLS) reads or
-- writes. The advisor (rls_enabled_no_policy) raises an INFO for this;
-- adding the comment makes the design intent explicit in the schema.

COMMENT ON TABLE public.rate_limits IS
  'Service-role only by design. RLS is enabled with no policies; anon and authenticated cannot read or write directly. All access goes through public.check_rate_limit() (SECURITY DEFINER), which the Edge Functions invoke via the service role.';

COMMIT;
