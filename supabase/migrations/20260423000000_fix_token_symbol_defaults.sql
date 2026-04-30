-- Migration: Fix token_symbol defaults and clear legacy BNB/LMX rows
-- Date: 2026-04-23
-- Description:
--   Eski 20241216_add_token_fields.sql migration'inda:
--     - DEFAULT 'LMX' yanlis olarak set edilmisti
--     - UPDATE token_symbol = 'BNB' ile tarihi kayitlar BNB'ye cevrilmisti
--   Bu migration:
--     1) transactions.token_symbol default'unu kaldirir (NULL izin verilir)
--     2) Eski 'LMX' ve 'BNB' kayitlarini NULL yapar (dogru token sembolu bilinmiyor)
--   Yeni kayitlar backend (verify-payment Edge Function) tarafindan
--   aktif token_symbol ile INSERT edilir.

-- 1. Default'u kaldir (artik NULL izin veriliyor)
ALTER TABLE transactions
ALTER COLUMN token_symbol DROP DEFAULT;

-- 2. Eski tarihi kayitlari NULL yap (LMX ve BNB artik kullanilmiyor)
-- Sadece kesinlikle kullanilmayan tokenlari NULL'a cevir
UPDATE transactions
SET token_symbol = NULL
WHERE token_symbol IN ('LMX', 'BNB');

-- Comment guncelle
COMMENT ON COLUMN transactions.token_symbol IS 'Symbol of the token used for payment (written by backend). NULL for historical records with unknown symbol.';
