-- Migration: extend submit_score with coins_collected parameter
-- Date: 2026-04-30
-- Description:
--   The scores table already has a coins_collected column (default 0)
--   but the submit_score RPC's signature did not accept it, so every
--   row was being written as 0 regardless of how many coins the player
--   picked up during the run.
--
--   This migration:
--     1) DROPS the legacy 4-parameter submit_score so PostgreSQL does not
--        keep both signatures and resolve the call as ambiguous.
--     2) Creates submit_score with an additional p_coins parameter
--        (defaulting to 0 so older callers without p_coins keep working).
--     3) Writes p_coins into scores.coins_collected on INSERT.
--
--   Frontend GameOverUI.jsx now passes coinsCollected from the Zustand
--   store; older clients that omit the argument will continue to land
--   the row with coins_collected = 0 (current behavior preserved).

-- 1) Remove the legacy signature so the new DEFAULT-bearing one is unique
DROP FUNCTION IF EXISTS public.submit_score(TEXT, INTEGER, INTEGER, INTEGER);

-- 2) Create the new signature with p_coins (default 0)
CREATE OR REPLACE FUNCTION public.submit_score(
    p_wallet TEXT,
    p_score INTEGER,
    p_duration INTEGER,
    p_distance INTEGER,
    p_coins INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. Resolve user
    SELECT id INTO v_user_id
    FROM public.users
    WHERE wallet_address = p_wallet
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    -- 2. Insert score (triggers update_daily_leaderboard)
    INSERT INTO public.scores (
        user_id,
        wallet_address,
        score,
        distance,
        play_duration,
        coins_collected,
        created_at
    ) VALUES (
        v_user_id,
        p_wallet,
        p_score,
        p_distance,
        p_duration,
        GREATEST(p_coins, 0),
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Score saved successfully');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
