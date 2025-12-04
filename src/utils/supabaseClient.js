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

/**
 * Günlük team skorlarını getir (bugün)
 * @returns {object} { blueScore: number, redScore: number, winner: 'blue'|'red'|'tie' }
 */
export const getTodayTeamScores = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('daily_team_scores')
      .select('*')
      .eq('play_date', today);

    if (error) throw error;

    const blueTeam = data.find(d => d.team === 'blue');
    const redTeam = data.find(d => d.team === 'red');

    const blueScore = blueTeam?.total_score || 0;
    const redScore = redTeam?.total_score || 0;

    let winner = 'tie';
    if (blueScore > redScore) winner = 'blue';
    else if (redScore > blueScore) winner = 'red';

    return {
      blueScore,
      redScore,
      winner,
      blueGames: blueTeam?.total_games || 0,
      redGames: redTeam?.total_games || 0
    };
  } catch (error) {
    console.error('Error fetching team scores:', error);
    return { blueScore: 0, redScore: 0, winner: 'tie', blueGames: 0, redGames: 0 };
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
