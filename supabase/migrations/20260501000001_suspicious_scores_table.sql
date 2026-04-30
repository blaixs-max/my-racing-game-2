-- Sprint 2.2a: suspicious_scores table for server-side anti-cheat logging.
--
-- The submit-score Edge Function writes one row here whenever a posted
-- result fails the anti-cheat validation (speed/coin-density/score
-- anomaly, etc.). The row preserves the raw client payload for forensic
-- review.
--
-- RLS is enabled with no policies — only the service_role bypasses RLS,
-- so anon and authenticated roles cannot read or write this table. Read
-- access via the Supabase Dashboard remains available to project admins.

CREATE TABLE IF NOT EXISTS public.suspicious_scores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT        NOT NULL,
  score           INTEGER     NOT NULL,
  distance        INTEGER     NOT NULL,
  duration        INTEGER     NOT NULL,
  coins_collected INTEGER     NOT NULL,
  near_miss_count INTEGER,
  game_mode       TEXT,
  reasons         TEXT[]      NOT NULL,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for forensic queries
CREATE INDEX IF NOT EXISTS idx_suspicious_wallet
  ON public.suspicious_scores (wallet_address);

CREATE INDEX IF NOT EXISTS idx_suspicious_created_at
  ON public.suspicious_scores (created_at DESC);

-- Lock down: RLS on, no policies => service_role only.
ALTER TABLE public.suspicious_scores ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.suspicious_scores IS
  'Anti-cheat anomaly log written by submit-score Edge Function. Service-role only.';
