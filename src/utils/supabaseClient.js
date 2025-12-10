import { createClient } from '@supabase/supabase-js';

// Supabase Configuration - Environment Variables kullan
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Güvenlik kontrolü - env variables tanımlı mı?
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase environment variables eksik! .env dosyasını kontrol edin.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== USER OPERATIONS ====================

/**
 * Kullanıcıyı wallet adresine göre getir veya oluştur
 * @param {string} walletAddress - Wallet adresi
 */
export const getOrCreateUser = async (walletAddress) => {
  try {
    // Önce kullanıcıyı ara
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (existingUser) {
      console.log('✅ User found:', existingUser);
      return existingUser;
    }

    // Yoksa yeni kullanıcı oluştur
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([
        {
          wallet_address: walletAddress,
          credits: 0,
          total_games_played: 0,
          total_spent: 0
        }
      ])
      .select()
      .single();

    if (createError) throw createError;

    console.log('🆕 New user created:', newUser);
    return newUser;
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
};

/**
 * Kullanıcının credit'ini getir
 * @param {string} walletAddress
 */
export const getUserCredits = async (walletAddress) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('credits')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) throw error;

    return data.credits || 0;
  } catch (error) {
    console.error('Error getting user credits:', error);
    return 0;
  }
};

// ==================== CREDIT OPERATIONS ====================

// NOT: addCredits fonksiyonu KALDIRILDI - Güvenlik riski!
// Kredi ekleme SADECE verify-payment Edge Function üzerinden yapılmalı.
// Frontend'den doğrudan kredi ekleme yapılamaz.

/**
 * Kullanıcıdan credit düş (oyun oynandığında)
 * GÜVENLİ: Edge Function üzerinden çalışır
 * @param {string} walletAddress
 * @param {number} amount - Düşülecek kredi miktarı (varsayılan: 1)
 */
export const useCredit = async (walletAddress, amount = 1) => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/use-credit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          walletAddress,
          amount
        })
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to use credit');
    }

    console.log(`✅ Used ${amount} credit(s). Remaining: ${result.remainingCredits}`);
    return {
      credits: result.remainingCredits,
      total_games_played: result.totalGamesPlayed
    };
  } catch (error) {
    console.error('Error using credit:', error);
    throw error;
  }
};

// ==================== TEAM OPERATIONS ====================

/**
 * Kullanıcının mevcut team seçimini getir
 * @param {string} walletAddress
 * @returns {object} { team: 'blue'|'red'|null, selectionDate: Date|null, canChange: boolean }
 */
export const getUserTeamSelection = async (walletAddress) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('selected_team, team_selection_date')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) throw error;

    const today = new Date().toISOString().split('T')[0];
    const selectionDate = data.team_selection_date;
    const canChange = !selectionDate || selectionDate !== today;

    return {
      team: data.selected_team,
      selectionDate: selectionDate,
      canChange: canChange
    };
  } catch (error) {
    console.error('Error getting team selection:', error);
    return { team: null, selectionDate: null, canChange: true };
  }
};

/**
 * Team seçimini güncelle (günde bir kez)
 * @param {string} walletAddress
 * @param {string} team - 'blue' veya 'red'
 * @returns {object} { success: boolean, error?: string }
 */
export const updateTeamSelection = async (walletAddress, team) => {
  try {
    // RPC fonksiyonunu çağır (SQL'de tanımladık)
    const { data, error } = await supabase
      .rpc('update_team_selection', {
        p_wallet_address: walletAddress,
        p_team: team
      });

    if (error) throw error;

    // RPC fonksiyonu JSON döndürür
    return data;
  } catch (error) {
    console.error('Error updating team selection:', error);
    return {
      success: false,
      error: error.message || 'Failed to update team selection'
    };
  }
};

