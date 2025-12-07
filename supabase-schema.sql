-- ==========================================
-- LUMEXIA RACING GAME - SUPABASE SCHEMA
-- ==========================================
-- Bu SQL dosyasını Supabase Dashboard > SQL Editor'de çalıştırın
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
--
-- Son güncelleme: 2025-12-07
-- Değişiklikler: daily_leaderboard VIEW yerine TABLE olarak güncellendi
--               daily_leaderboard_history tablosu eklendi

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

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
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
-- Oyun skorları (tüm skorlar burada saklanır)
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

-- ==================== DAILY LEADERBOARD TABLE ====================
-- Günlük en iyi skorlar (Top 100)
-- NOT: Bu artık VIEW değil, gerçek bir TABLE
-- Trigger ile otomatik güncellenir
CREATE TABLE IF NOT EXISTS daily_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  full_wallet TEXT,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_distance INTEGER DEFAULT 0,
  games_played_today INTEGER DEFAULT 1,
  play_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Her wallet için her gün tek kayıt
  UNIQUE(wallet_address, play_date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_dl_score ON daily_leaderboard(best_score DESC);
CREATE INDEX IF NOT EXISTS idx_dl_date ON daily_leaderboard(play_date);
CREATE INDEX IF NOT EXISTS idx_dl_wallet ON daily_leaderboard(wallet_address);

-- ==================== DAILY LEADERBOARD HISTORY TABLE ====================
-- Geçmiş günlerin arşivi (her gece 00:00'da kopyalanır)
CREATE TABLE IF NOT EXISTS daily_leaderboard_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  full_wallet TEXT,
  best_score INTEGER NOT NULL,
  best_distance INTEGER,
  games_played_today INTEGER DEFAULT 1,
  play_date DATE NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT NOW(),

  -- Her wallet için her gün tek kayıt
  UNIQUE(wallet_address, play_date)
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_dlh_play_date ON daily_leaderboard_history(play_date DESC);
CREATE INDEX IF NOT EXISTS idx_dlh_score ON daily_leaderboard_history(best_score DESC);
CREATE INDEX IF NOT EXISTS idx_dlh_wallet ON daily_leaderboard_history(wallet_address);

-- ==================== ROW LEVEL SECURITY (RLS) ====================
-- Güvenlik için RLS aktif edilmeli

-- Users table RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own data" ON users;
CREATE POLICY "Users can read their own data" ON users
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own data" ON users;
CREATE POLICY "Users can insert their own data" ON users
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own data" ON users;
CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (true);

-- Transactions table RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own transactions" ON transactions;
CREATE POLICY "Users can read their own transactions" ON transactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert transactions" ON transactions;
CREATE POLICY "Users can insert transactions" ON transactions
  FOR INSERT WITH CHECK (true);

-- Scores table RLS
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read scores" ON scores;
CREATE POLICY "Everyone can read scores" ON scores
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own scores" ON scores;
CREATE POLICY "Users can insert their own scores" ON scores
  FOR INSERT WITH CHECK (true);

-- Daily Leaderboard table RLS
ALTER TABLE daily_leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read daily_leaderboard" ON daily_leaderboard;
CREATE POLICY "Everyone can read daily_leaderboard" ON daily_leaderboard
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "System can insert daily_leaderboard" ON daily_leaderboard;
CREATE POLICY "System can insert daily_leaderboard" ON daily_leaderboard
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "System can update daily_leaderboard" ON daily_leaderboard;
CREATE POLICY "System can update daily_leaderboard" ON daily_leaderboard
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "System can delete daily_leaderboard" ON daily_leaderboard;
CREATE POLICY "System can delete daily_leaderboard" ON daily_leaderboard
  FOR DELETE USING (true);

-- Daily Leaderboard History table RLS
ALTER TABLE daily_leaderboard_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can read history" ON daily_leaderboard_history;
CREATE POLICY "Everyone can read history" ON daily_leaderboard_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role can insert history" ON daily_leaderboard_history;
CREATE POLICY "Service role can insert history" ON daily_leaderboard_history
  FOR INSERT WITH CHECK (true);

-- ==================== ALL-TIME LEADERBOARD VIEW ====================
-- Tüm zamanların en iyi skorları (VIEW olarak kalabilir - sadece okuma)
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

-- ==========================================
-- KURULUM NOTLARI:
-- ==========================================
-- 1. Supabase Dashboard'a gidin: https://supabase.com/dashboard
-- 2. Projenizi seçin (cldjwajhcepyzvmwjcmz)
-- 3. Sol menüden "SQL Editor" seçin
-- 4. "New Query" butonuna tıklayın
-- 5. Bu dosyanın içeriğini yapıştırın
-- 6. "Run" butonuna tıklayın
--
-- TABLOLAR:
-- - users: Kullanıcı bilgileri ve credit'ler
-- - transactions: Ödeme işlemleri
-- - scores: Tüm oyun skorları
-- - daily_leaderboard: Günlük top 100 (trigger ile otomatik)
-- - daily_leaderboard_history: Geçmiş günlerin arşivi
--
-- VIEWS:
-- - alltime_leaderboard: Tüm zamanların en iyi skorları
--
-- ==========================================
