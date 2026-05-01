-- Sprint 4.5: unverified_payments table for the reconcile-payments Edge Function.
--
-- reconcile-payments scans the receiver wallet's recent TOKABU transfers and
-- auto-credits any sender whose TX did not get processed by verify-payment.
-- Cases that cannot be auto-credited (unknown wallet, amount does not map to
-- a 1/5/10 USD package, price unavailable, etc.) get logged here for admin
-- review. resolved=TRUE + resolved_tx_id ties a manual fix back to the
-- transactions row that eventually credited the user.
--
-- RLS is enabled with no policies. service_role bypasses RLS, so anon and
-- authenticated cannot read or write. Project admins access via Dashboard.

CREATE TABLE IF NOT EXISTS public.unverified_payments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash  TEXT        UNIQUE NOT NULL,
  sender_wallet     TEXT        NOT NULL,
  receiver_wallet   TEXT        NOT NULL,
  token_mint        TEXT        NOT NULL,
  token_amount      NUMERIC     NOT NULL,
  block_time        TIMESTAMPTZ,
  reason            TEXT        NOT NULL,
  resolved          BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_tx_id    UUID        REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unverified_payments_sender
  ON public.unverified_payments (sender_wallet);

CREATE INDEX IF NOT EXISTS idx_unverified_payments_unresolved
  ON public.unverified_payments (created_at DESC) WHERE resolved = FALSE;

ALTER TABLE public.unverified_payments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.unverified_payments IS
  'Payments that reconcile-payments could not auto-credit. Service-role only.';
