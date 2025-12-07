-- ==========================================
-- LUMEXIA RACING GAME - SUPABASE FUNCTIONS
-- ==========================================
-- Bu dosya tüm PostgreSQL fonksiyonlarını, trigger'ları ve cron job'ları içerir
-- Supabase Dashboard > SQL Editor'de çalıştırın
--
-- Son güncelleme: 2025-12-07
--
-- İÇERİK:
-- 1. submit_score() - Skor kaydetme RPC
-- 2. update_daily_leaderboard() - Trigger fonksiyonu
-- 3. archive_daily_leaderboard() - Arşivleme fonksiyonu
-- 4. pg_cron job - Gece 00:00 arşivleme
--
-- ÖNEMLİ: Bu dosyayı çalıştırmadan önce:
-- 1. supabase-schema.sql çalıştırılmış olmalı
-- 2. pg_cron ve pg_net extension'ları aktif olmalı

-- ==================== 1. SUBMIT SCORE RPC ====================
-- Oyun bittiğinde skoru kaydetmek için kullanılır
-- Frontend'den çağrılır: supabase.rpc('submit_score', {...})

CREATE OR REPLACE FUNCTION public.submit_score(
    p_wallet TEXT,
    p_score INTEGER,
    p_duration INTEGER,
    p_distance INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Kullanıcıyı bul
    SELECT id INTO v_user_id
    FROM public.users
    WHERE wallet_address = p_wallet
    LIMIT 1;

    -- Eğer kullanıcı yoksa hata döndür
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    -- 2. Skoru kaydet (Bu INSERT, update_daily_leaderboard trigger'ını tetikler)
    INSERT INTO public.scores (
        user_id,
        wallet_address,
        score,
        distance,
        play_duration,
        created_at
    ) VALUES (
        v_user_id,
        p_wallet,
        p_score,
        p_distance,
        p_duration,
        NOW()
    );

    -- 3. Başarılı dönüş
    RETURN jsonb_build_object('success', true, 'message', 'Score saved successfully');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- ==================== 2. UPDATE DAILY LEADERBOARD TRIGGER ====================
-- scores tablosuna INSERT olduğunda otomatik çalışır
-- daily_leaderboard tablosunu günceller
--
-- Mantık:
-- - Aynı wallet + aynı gün kaydı varsa → sadece daha yüksek skoru güncelle
-- - Kayıt yoksa → yeni kayıt ekle
-- - Top 100 dışındakileri sil

CREATE OR REPLACE FUNCTION update_daily_leaderboard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  existing_score INTEGER;
  player_rank INTEGER;
BEGIN
  -- 1. Bu kullanıcının bugünkü kaydını kontrol et
  SELECT best_score INTO existing_score
  FROM daily_leaderboard
  WHERE wallet_address = NEW.wallet_address
    AND play_date = today;

  IF existing_score IS NULL THEN
    -- 2a. Kayıt yok - yeni kayıt ekle
    INSERT INTO daily_leaderboard (
      wallet_address,
      full_wallet,
      best_score,
      best_distance,
      games_played_today,
      play_date
    ) VALUES (
      NEW.wallet_address,
      NEW.wallet_address,
      NEW.score,
      NEW.distance,
      1,
      today
    );
  ELSE
    -- 2b. Kayıt var - güncelle
    UPDATE daily_leaderboard
    SET
      best_score = GREATEST(best_score, NEW.score),
      best_distance = GREATEST(best_distance, NEW.distance),
      games_played_today = games_played_today + 1
    WHERE wallet_address = NEW.wallet_address
      AND play_date = today;
  END IF;

  -- 3. Top 100 dışındakileri temizle (bugün için)
  DELETE FROM daily_leaderboard
  WHERE play_date = today
    AND wallet_address NOT IN (
      SELECT wallet_address
      FROM daily_leaderboard
      WHERE play_date = today
      ORDER BY best_score DESC
      LIMIT 100
    );

  RETURN NEW;
END;
$$;

-- Trigger tanımı
DROP TRIGGER IF EXISTS trg_update_daily_leaderboard ON scores;

CREATE TRIGGER trg_update_daily_leaderboard
  AFTER INSERT ON scores
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_leaderboard();

-- ==================== 3. ARCHIVE DAILY LEADERBOARD ====================
-- Her gece 00:00'da çalışır (pg_cron ile)
-- daily_leaderboard → daily_leaderboard_history kopyalar
-- daily_leaderboard tablosunu temizler

CREATE OR REPLACE FUNCTION archive_daily_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  archived_count INTEGER;
  result jsonb;
BEGIN
  -- 1. Kayıt sayısını al
  SELECT COUNT(*) INTO archived_count FROM daily_leaderboard;

  -- 2. Eğer veri varsa arşivle
  IF archived_count > 0 THEN
    -- daily_leaderboard'dan history'e kopyala
    INSERT INTO daily_leaderboard_history (
      wallet_address,
      full_wallet,
      best_score,
      best_distance,
      games_played_today,
      play_date,
      archived_at
    )
    SELECT
      wallet_address,
      full_wallet,
      best_score,
      best_distance,
      games_played_today,
      play_date,
      NOW()
    FROM daily_leaderboard
    ON CONFLICT (wallet_address, play_date) DO NOTHING;

    -- 3. daily_leaderboard'u temizle
    DELETE FROM daily_leaderboard;

    result := jsonb_build_object(
      'success', true,
      'archived_count', archived_count,
      'message', 'Daily leaderboard archived and cleared',
      'timestamp', NOW()
    );
  ELSE
    result := jsonb_build_object(
      'success', true,
      'archived_count', 0,
      'message', 'No data to archive',
      'timestamp', NOW()
    );
  END IF;

  -- Log the result
  RAISE NOTICE 'Archive result: %', result;

  RETURN result;
END;
$$;

-- ==================== 4. PG_CRON JOB ====================
-- Her gece 00:00 UTC'de arşivleme fonksiyonunu çağırır
-- NOT: pg_cron extension'ı aktif olmalı (Database > Extensions > pg_cron)
--
-- Cron expression: '0 0 * * *' = Her gün 00:00 UTC
-- Türkiye saati (UTC+3) için bu 03:00'a denk gelir
-- Türkiye 00:00 için '0 21 * * *' kullanın (21:00 UTC = 00:00 TR)

-- Mevcut job'ı sil (varsa)
SELECT cron.unschedule('archive-daily-leaderboard')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive-daily-leaderboard');

-- Yeni job oluştur
SELECT cron.schedule(
  'archive-daily-leaderboard',      -- job ismi
  '0 0 * * *',                      -- her gün 00:00 UTC
  'SELECT archive_daily_leaderboard();'
);

-- ==========================================
-- KONTROL SORGULARI
-- ==========================================
-- Cron job'ları görmek için:
-- SELECT * FROM cron.job;
--
-- Cron job çalışma geçmişi:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- Manuel arşivleme testi:
-- SELECT archive_daily_leaderboard();
--
-- Daily leaderboard'u görmek için:
-- SELECT * FROM daily_leaderboard ORDER BY best_score DESC;
--
-- History'yi görmek için:
-- SELECT * FROM daily_leaderboard_history ORDER BY play_date DESC, best_score DESC;
-- ==========================================
