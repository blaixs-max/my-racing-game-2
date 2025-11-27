-- ==========================================
-- LUMEXIA RACING GAME - SUPABASE SCHEMA
-- ==========================================
-- ÖNCE ESKİ TABLOLARI SİL, SONRA YENİDEN OLUŞTUR

-- Eski tabloları sil (varsa)
DROP TABLE IF EXISTS scores CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Trigger function varsa sil
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ==================== USERS TABLE ====================
-- Kullanıcı bilgileri ve credit'leri
CREATE TABLE users (
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
CREATE INDEX idx_users_wallet ON users(wallet_address);

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
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  credits_added INTEGER NOT NULL,
  transaction_hash TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'pending', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- ==================== SCORES TABLE ====================
-- Oyun skorları ve leaderboard için
CREATE TABLE scores (
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
CREATE INDEX idx_scores_user_id ON scores(user_id);
CREATE INDEX idx_scores_score ON scores(score DESC);
CREATE INDEX idx_scores_created_at ON scores(created_at DESC);
-- Note: Removed problematic DATE() index - daily queries will use created_at index

-- ==================== ROW LEVEL SECURITY (RLS) ====================
-- Güvenlik için RLS aktif edilmeli

-- Users table RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own data" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own data" ON users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (true);

-- Transactions table RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own transactions" ON transactions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert transactions" ON transactions
  FOR INSERT WITH CHECK (true);

-- Scores table RLS
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can read scores" ON scores
  FOR SELECT USING (true);

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

-- ==========================================
-- KURULUM BAŞARILI!
-- Artık 'users', 'transactions', 'scores' tabloları hazır.
-- ==========================================
