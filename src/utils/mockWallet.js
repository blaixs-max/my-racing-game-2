// Mock Wallet Utility - BSC Simülasyonu
// Gerçek $LMX token hazır olunca burası değiştirilecek

/**
 * Fake wallet adresi oluştur
 */
export const generateMockWalletAddress = () => {
  const chars = '0123456789ABCDEF';
  let address = '0x';
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  // İlk 6 ve son 4 karakter göster: 0x7a3b...92A1
  return address.slice(0, 6) + '...' + address.slice(-4);
};

/**
 * Mock wallet bağlantısı simülasyonu
 * @param {function} onSuccess - Başarılı bağlantı callback
 * @param {function} onError - Hata callback
 */
export const connectMockWallet = async (onSuccess, onError) => {
  try {
    // Bağlantı simülasyonu (800ms delay)
    await new Promise(resolve => setTimeout(resolve, 800));

    const mockAddress = generateMockWalletAddress();
    const mockFullAddress = '0x' + Math.random().toString(16).slice(2, 42);

    // Mock bağlantı bilgileri
    const walletData = {
      address: mockAddress,
      fullAddress: mockFullAddress,
      network: 'BSC Mainnet (Mock)',
      chainId: 56, // BSC Chain ID
      connected: true
    };

    if (onSuccess) {
      onSuccess(walletData);
    }

    return walletData;
  } catch (error) {
    console.error('Mock Wallet Connection Failed:', error);
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

/**
 * Mock token transfer simülasyonu
 * @param {number} amount - Ödeme miktarı ($1, $5, $10)
 * @param {string} walletAddress - Gönderen cüzdan adresi
 */
export const mockTokenTransfer = async (amount, walletAddress) => {
  try {
    // Ödeme işlemi simülasyonu (1.5 saniye)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Fake transaction hash oluştur
    const txHash = '0x' + Math.random().toString(16).slice(2, 66);

    // Mock transaction data
    const transaction = {
      hash: txHash,
      from: walletAddress,
      to: '0xLUMEXIA_CONTRACT...', // Mock contract adresi
      amount: amount,
      token: '$LMX',
      network: 'BSC',
      status: 'success',
      timestamp: Date.now(),
      credits: amount // $1 = 1 credit
    };

    console.log('🎉 Mock Transaction Successful:', transaction);

    return transaction;
  } catch (error) {
    console.error('Mock Transaction Failed:', error);
    throw new Error('Payment failed. Please try again.');
  }
};

/**
 * Wallet bağlantısını kapat (mock)
 */
export const disconnectMockWallet = () => {
  console.log('🔌 Mock Wallet Disconnected');
  return true;
};
