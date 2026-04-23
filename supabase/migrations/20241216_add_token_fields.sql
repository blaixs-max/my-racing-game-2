-- Migration: Add token fields to transactions table
-- Date: 2024-12-16
-- Description: Add columns for token payment tracking (token_amount, token_symbol)
--
-- NOT: Bu dosya fresh install icin tek sefer calisan ilk migration'dir.
-- Aktif degerler backend (verify-payment Edge Function) tarafindan INSERT sirasinda yazilir.
-- Default'lar NULL birakildi - eski LMX/BNB migration kalintilari duzeltildi.
-- Historical veri duzeltmesi icin ikinci migration dosyasini (20260423_*) calistirin.

-- Add token_amount column to store the amount of tokens transferred
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS token_amount DECIMAL(20, 8);

-- Add token_symbol column to track which token was used for payment
-- Default NULL - backend INSERT sirasinda dogru symbol yazar
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS token_symbol VARCHAR(10);

-- Add index for token queries
CREATE INDEX IF NOT EXISTS idx_transactions_token_symbol
ON transactions(token_symbol);

-- Comment on columns
COMMENT ON COLUMN transactions.token_amount IS 'Amount of tokens transferred in the payment';
COMMENT ON COLUMN transactions.token_symbol IS 'Symbol of the token used for payment (written by backend)';
