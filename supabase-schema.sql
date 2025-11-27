-- ==========================================
-- LUMEXIA RACING GAME - SUPABASE SCHEMA
-- ==========================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- ==================== USERS TABLE ====================
-- Kullanıcı bilgileri ve credit'leri
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  credits INTEGER DEFAULT 0 CHECK (credits >= 0),
  total_games_played INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,
  last_played TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==================== TRANSACTIONS TABLE ====================
-- Ödeme işlemi kayıtları
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  credits_added INTEGER NOT NULL,
  transaction_hash TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'pending', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- ==================== SCORES TABLE ====================
-- Oyun skorları ve leaderboard için
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  distance INTEGER NOT NULL CHECK (distance >= 0),
  coins_collected INTEGER DEFAULT 0,
  play_duration INTEGER, -- saniye cinsinden
  game_mode TEXT DEFAULT 'normal', -- future: 'normal', 'hard', 'expert'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores(DATE(created_at), score DESC);

-- ==================== ROW LEVEL SECURITY (RLS) ====================
-- Güvenlik için RLS aktif edilmeli

-- Users table RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own data" ON users
  FOR SELECT USING (true); -- Herkes kendi cüzdanını okuyabilir

CREATE POLICY "Users can insert their own data" ON users
  FOR INSERT WITH CHECK (true); -- Mock sistem için herkes insert yapabilir

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (true); -- Mock sistem için herkes update yapabilir

-- Transactions table RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own transactions" ON transactions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert transactions" ON transactions
  FOR INSERT WITH CHECK (true);

-- Scores table RLS
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read scores" ON scores
  FOR SELECT USING (true); -- Leaderboard için herkes okuyabilir

CREATE POLICY "Users can insert their own scores" ON scores
  FOR INSERT WITH CHECK (true);

-- ==================== USEFUL VIEWS ====================

-- Daily Leaderboard View
CREATE OR REPLACE VIEW daily_leaderboard AS
SELECT
  s.wallet_address,
  u.wallet_address as full_wallet,
  MAX(s.score) as best_score,
  MAX(s.distance) as best_distance,
  COUNT(*) as games_played_today,
  DATE(s.created_at) as play_date
FROM scores s
JOIN users u ON s.user_id = u.id
WHERE DATE(s.created_at) = CURRENT_DATE
GROUP BY s.wallet_address, u.wallet_address, DATE(s.created_at)
ORDER BY best_score DESC
LIMIT 100;

-- All-Time Leaderboard View
CREATE OR REPLACE VIEW alltime_leaderboard AS
SELECT
  u.wallet_address,
  u.total_games_played,
  u.total_spent,
  MAX(s.score) as best_score,
  MAX(s.distance) as best_distance,
  AVG(s.score) as avg_score,
  COUNT(s.id) as total_games
FROM users u
LEFT JOIN scores s ON u.id = s.user_id
GROUP BY u.id, u.wallet_address, u.total_games_played, u.total_spent
ORDER BY best_score DESC
LIMIT 100;

-- ==================== TEST DATA (OPTIONAL) ====================
-- Test için örnek veri (isteğe bağlı)

-- INSERT INTO users (wallet_address, credits, total_games_played, total_spent) VALUES
--   ('0xABCD...1234', 5, 2, 5.00),
--   ('0xEF01...5678', 10, 1, 10.00),
--   ('0x9876...CDEF', 0, 0, 0.00);

-- ==========================================
-- KURULUM NOTLARI:
-- ==========================================
-- 1. Supabase Dashboard'a gidin: https://supabase.com/dashboard
-- 2. Projenizi seçin (cldjwajhcepyzvmwjcmz)
-- 3. Sol menüden "SQL Editor" seçin
-- 4. "New Query" butonuna tıklayın
-- 5. Bu dosyanın içeriğini yapıştırın
-- 6. "Run" butonuna tıklayın
-- 7. Tüm tablolar ve indexler oluşturulacak
--
-- Tablolarınızı kontrol etmek için:
-- - Sol menüden "Table Editor" seçin
-- - users, transactions, scores tablolarını göreceksiniz
--
-- ==========================================
