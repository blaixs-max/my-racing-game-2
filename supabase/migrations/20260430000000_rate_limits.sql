-- Migration: rate-limit table + check_rate_limit helper
-- Date: 2026-04-30
-- Description:
--   Lightweight token-bucket-ish rate limiter backed by a tiny table.
--   Each (key, action) row records request_count + window_start.
--   check_rate_limit() atomically:
--     - Resets the window if it has expired.
--     - Increments the counter and returns true if under the cap.
--     - Returns false (over the cap) without incrementing.
--
--   Used by Edge Functions (use-credit, verify-payment) via the public
--   anon key. The function is SECURITY DEFINER so the caller does not
--   need direct write access to the table — important once RLS is
--   eventually tightened on rate_limits itself.

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT NOT NULL,             -- usually wallet_address; falls back to a synthetic id from caller
    action TEXT NOT NULL,          -- 'use_credit', 'verify_payment', etc.
    request_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (key, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
    ON public.rate_limits(window_start);

-- Atomic check + increment. Returns TRUE if the request is allowed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key TEXT,
    p_action TEXT,
    p_max_requests INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    -- Insert-or-fetch the row
    INSERT INTO public.rate_limits (key, action, request_count, window_start)
    VALUES (p_key, p_action, 0, NOW())
    ON CONFLICT (key, action) DO NOTHING;

    -- Lock the row for the rest of the transaction
    SELECT request_count, window_start
      INTO v_count, v_window_start
    FROM public.rate_limits
    WHERE key = p_key AND action = p_action
    FOR UPDATE;

    -- Reset the window if expired
    IF v_window_start + (p_window_seconds || ' seconds')::INTERVAL < NOW() THEN
        UPDATE public.rate_limits
           SET request_count = 1,
               window_start = NOW()
         WHERE key = p_key AND action = p_action;
        RETURN TRUE;
    END IF;

    -- Reject if over the cap
    IF v_count >= p_max_requests THEN
        RETURN FALSE;
    END IF;

    UPDATE public.rate_limits
       SET request_count = request_count + 1
     WHERE key = p_key AND action = p_action;

    RETURN TRUE;
END;
$$;

-- Cleanup helper for old window rows (optional, can be cron'd)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits(p_keep_seconds INTEGER DEFAULT 3600)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.rate_limits
     WHERE window_start + (p_keep_seconds || ' seconds')::INTERVAL < NOW();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;
