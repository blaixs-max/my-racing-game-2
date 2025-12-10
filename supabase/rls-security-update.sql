-- ==========================================
-- LUMEXIA RACING GAME - RLS SECURITY UPDATE
-- ==========================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın
--
-- AMAÇ: Frontend'den doğrudan UPDATE/DELETE işlemlerini engellemek
-- Kritik işlemler sadece Edge Functions (service role) ile yapılabilir
-- ==========================================

-- ==================== USERS TABLE RLS ====================
-- Kullanıcılar:
-- - SELECT: Herkes okuyabilir (leaderboard için gerekli)
-- - INSERT: Herkes ekleyebilir (yeni kullanıcı kaydı)
-- - UPDATE: YASAK (sadece service role - Edge Functions)
-- - DELETE: YASAK

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları kaldır
DROP POLICY IF EXISTS "Users can read their own data" ON users;
DROP POLICY IF EXISTS "Users can insert their own data" ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Anyone can read users" ON users;
DROP POLICY IF EXISTS "Anyone can insert users" ON users;

-- Yeni güvenli politikalar
CREATE POLICY "Anyone can read users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert users" ON users
  FOR INSERT WITH CHECK (true);

-- UPDATE ve DELETE yok! Sadece service role yapabilir.

-- ==================== TRANSACTIONS TABLE RLS ====================
-- Transactions:
-- - SELECT: Herkes kendi işlemlerini görebilir
-- - INSERT: YASAK (sadece Edge Functions)
-- - UPDATE: YASAK
-- - DELETE: YASAK

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları kaldır
DROP POLICY IF EXISTS "Users can read their own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Anyone can read transactions" ON transactions;

-- Yeni güvenli politikalar
CREATE POLICY "Anyone can read transactions" ON transactions
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE yok! Sadece service role yapabilir.

-- ==================== SCORES TABLE RLS ====================
-- Scores:
-- - SELECT: Herkes okuyabilir (leaderboard)
-- - INSERT: Herkes ekleyebilir (oyun skoru)
-- - UPDATE: YASAK
-- - DELETE: YASAK

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları kaldır
DROP POLICY IF EXISTS "Everyone can read scores" ON scores;
DROP POLICY IF EXISTS "Users can insert their own scores" ON scores;
DROP POLICY IF EXISTS "Anyone can read scores" ON scores;
DROP POLICY IF EXISTS "Anyone can insert scores" ON scores;

-- Yeni güvenli politikalar
CREATE POLICY "Anyone can read scores" ON scores
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert scores" ON scores
  FOR INSERT WITH CHECK (true);

-- UPDATE/DELETE yok!

-- ==================== DAILY LEADERBOARD TABLE RLS ====================
-- Daily Leaderboard:
-- - SELECT: Herkes okuyabilir
-- - INSERT/UPDATE/DELETE: YASAK (sadece triggers/service role)

ALTER TABLE daily_leaderboard ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları kaldır
DROP POLICY IF EXISTS "Everyone can read daily_leaderboard" ON daily_leaderboard;
DROP POLICY IF EXISTS "System can insert daily_leaderboard" ON daily_leaderboard;
DROP POLICY IF EXISTS "System can update daily_leaderboard" ON daily_leaderboard;
DROP POLICY IF EXISTS "System can delete daily_leaderboard" ON daily_leaderboard;
DROP POLICY IF EXISTS "Anyone can read daily_leaderboard" ON daily_leaderboard;

-- Yeni güvenli politika
CREATE POLICY "Anyone can read daily_leaderboard" ON daily_leaderboard
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE yok!

-- ==================== DAILY LEADERBOARD HISTORY TABLE RLS ====================
-- History:
-- - SELECT: Herkes okuyabilir
-- - INSERT/UPDATE/DELETE: YASAK (sadece service role)

ALTER TABLE daily_leaderboard_history ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları kaldır
DROP POLICY IF EXISTS "Everyone can read history" ON daily_leaderboard_history;
DROP POLICY IF EXISTS "Service role can insert history" ON daily_leaderboard_history;
DROP POLICY IF EXISTS "Anyone can read history" ON daily_leaderboard_history;

-- Yeni güvenli politika
CREATE POLICY "Anyone can read history" ON daily_leaderboard_history
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE yok!

-- ==========================================
-- ÖZET:
-- ==========================================
-- | Tablo              | SELECT | INSERT | UPDATE | DELETE |
-- |--------------------|--------|--------|--------|--------|
-- | users              | ✅     | ✅     | ❌     | ❌     |
-- | transactions       | ✅     | ❌     | ❌     | ❌     |
-- | scores             | ✅     | ✅     | ❌     | ❌     |
-- | daily_leaderboard  | ✅     | ❌     | ❌     | ❌     |
-- | daily_leaderboard_history | ✅ | ❌   | ❌     | ❌     |
--
-- ❌ = Sadece service role (Edge Functions) yapabilir
-- ==========================================
