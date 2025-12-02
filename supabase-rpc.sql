-- ==========================================
-- SUPABASE RPC FUNCTION: submit_score
-- ==========================================
-- Bu fonksiyonu Supabase SQL Editor'de çalıştırarak
-- oyunun skor kaydetme özelliğini aktifleştirin.

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

    -- Eğer kullanıcı yoksa hata döndür (veya istersen oluştur)
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    -- 2. Skoru kaydet
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

    -- 3. Başarılı dönüşü yap
    RETURN jsonb_build_object('success', true, 'message', 'Score saved successfully');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
