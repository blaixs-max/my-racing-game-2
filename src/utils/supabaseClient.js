import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
const SUPABASE_URL = 'https://cldjwajhcepyzvmwjcmz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZGp3YWpoY2VweXp2bXdqY216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMzIxMDcsImV4cCI6MjA3OTcwODEwN30.y4s4UH2JERVhUgdztg1u6DaAsvMy4PNNM2euYQCvre0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== USER OPERATIONS ====================

/**
 * Kullanıcıyı wallet adresine göre getir veya oluştur
 * @param {string} walletAddress - Wallet adresi
 */
export const getOrCreateUser = async (walletAddress) => {
  try {
    // Önce kullanıcıyı ara
    const { data: existingUser, error: fetchError } = await supabase
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

/**
 * Kullanıcıya credit ekle
 * @param {string} walletAddress
 * @param {number} amount - Credit miktarı
 * @param {number} spentAmount - Harcanan para ($)
 */
export const addCredits = async (walletAddress, amount, spentAmount) => {
  try {
    // Önce mevcut user'ı al
    const user = await getOrCreateUser(walletAddress);

    const newCredits = (user.credits || 0) + amount;
    const newTotalSpent = (user.total_spent || 0) + spentAmount;

    const { data, error } = await supabase
      .from('users')
      .update({
        credits: newCredits,
        total_spent: newTotalSpent
      })
      .eq('wallet_address', walletAddress)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Added ${amount} credits. New total: ${newCredits}`);
    return data;
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
};

/**
 * Kullanıcıdan 1 credit düş (oyun oynandığında)
 * @param {string} walletAddress
 */
export const useCredit = async (walletAddress) => {
  try {
    const user = await getOrCreateUser(walletAddress);

    if (user.credits <= 0) {
      throw new Error('Insufficient credits');
    }

    const newCredits = user.credits - 1;
    const newGamesPlayed = (user.total_games_played || 0) + 1;

    const { data, error } = await supabase
      .from('users')
      .update({
        credits: newCredits,
        total_games_played: newGamesPlayed,
        last_played: new Date().toISOString()
      })
      .eq('wallet_address', walletAddress)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Used 1 credit. Remaining: ${newCredits}`);
    return data;
  } catch (error) {
    console.error('Error using credit:', error);
    throw error;
  }
};

// ==================== TRANSACTION LOGGING ====================

/**
 * İşlemi kaydet
 * @param {string} walletAddress
 * @param {object} transaction - Transaction data
 */
export const logTransaction = async (walletAddress, transaction) => {
  try {
    const user = await getOrCreateUser(walletAddress);

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: user.id,
          amount: transaction.amount,
          credits_added: transaction.credits,
          transaction_hash: transaction.hash,
          status: transaction.status
        }
      ])
      .select()
      .single();

    if (error) throw error;

    console.log('📝 Transaction logged:', data);
    return data;
  } catch (error) {
    console.error('Error logging transaction:', error);
    // İşlem logu hata verirse devam et
    return null;
  }
};

// ==================== LEADERBOARD (İlerisi için) ====================

/**
 * Günlük skor tablosu (placeholder)
 */
export const getTodayLeaderboard = async () => {
  try {
    // TODO: Scores tablosu oluşturulunca implement edilecek
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('scores')
      .select('*')
      .gte('created_at', today)
      .order('score', { ascending: false })
      .limit(10);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
};
