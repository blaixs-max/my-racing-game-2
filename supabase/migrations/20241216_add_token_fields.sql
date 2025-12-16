-- Migration: Add token fields to transactions table
-- Date: 2024-12-16
-- Description: Add columns for LMX token payment tracking

-- Add token_amount column to store the LMX amount transferred
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS token_amount DECIMAL(20, 8);

-- Add token_symbol column to track which token was used
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS token_symbol VARCHAR(10) DEFAULT 'LMX';

-- Add index for token queries
CREATE INDEX IF NOT EXISTS idx_transactions_token_symbol
ON transactions(token_symbol);

-- Comment on columns
COMMENT ON COLUMN transactions.token_amount IS 'Amount of tokens transferred (e.g., LMX amount)';
COMMENT ON COLUMN transactions.token_symbol IS 'Symbol of the token used for payment (e.g., LMX)';

-- Update existing transactions to have default token_symbol
UPDATE transactions
SET token_symbol = 'BNB'
WHERE token_symbol IS NULL OR token_symbol = 'LMX';
