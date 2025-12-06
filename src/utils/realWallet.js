/**
 * REAL WALLET UTILITIES - 2025 STABLE VERSION
 * BSC Testnet - Real Blockchain Integration
 *
 * Key improvements:
 * 1. Universal links for iOS (more reliable than deep links)
 * 2. Android intent:// fallback
 * 3. Better error handling and retry logic
 * 4. Robust transaction confirmation
 */

import { sendTransaction, waitForTransactionReceipt, getTransactionReceipt, reconnect, getAccount } from '@wagmi/core';
import { parseEther } from 'viem';
import { PAYMENT_RECEIVER_ADDRESS, PRICING } from '../wagmi.config';

/**
 * Helper: Sleep function for delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Detect if user is on mobile device
 * Enhanced detection for tablets and modern devices
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;

  // Check user agent
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

  // Check touch support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Check screen size (mobile typically < 768px width)
  const isSmallScreen = window.innerWidth < 768;

  return mobileRegex.test(userAgent) || (hasTouch && isSmallScreen);
}

/**
 * Detect if user is on iOS
 * Includes iPad detection (iPadOS reports as MacIntel)
 */
export function isIOS() {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detect if user is on Android
 */
export function isAndroid() {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Get MetaMask universal link URL
 *
 * 2025 Best Practice: Use universal links instead of deep links
 * - iOS: Universal links are more reliable in Safari
 * - Avoids "open in app?" prompts
 */
export function getMetaMaskDeepLink() {
  // Universal link - works on both iOS and Android
  // This triggers MetaMask to check for pending WalletConnect requests
  return 'https://metamask.app.link/wc';
}

/**
 * Get Trust Wallet universal link
 */
export function getTrustWalletDeepLink() {
  return 'https://link.trustwallet.com/wc';
}

/**
 * Open wallet app on mobile
 *
 * Strategy:
 * 1. iOS: Use universal links (window.location.href)
 * 2. Android: Try universal link, fallback to intent://
 * 3. Delay slightly to ensure WalletConnect session is ready
 */
export function openWalletOnMobile(walletType = 'metamask') {
  if (!isMobileDevice()) {
    console.log('📱 Not a mobile device, skipping wallet open');
    return false;
  }

  try {
    let deepLink;

    switch (walletType) {
      case 'trust':
        deepLink = getTrustWalletDeepLink();
        break;
      case 'metamask':
      default:
        deepLink = getMetaMaskDeepLink();
        break;
    }

    console.log(`📱 Opening ${walletType} via link:`, deepLink);

    if (isIOS()) {
      // iOS: Use location.href for more reliable universal link handling
      // This avoids the "Open in App?" confirmation dialog
      window.location.href = deepLink;
    } else if (isAndroid()) {
      // Android: Try universal link first
      // If MetaMask is not installed, this will open browser
      const win = window.open(deepLink, '_blank');
      if (!win || win.closed || typeof win.closed === 'undefined') {
        // Popup blocked, try direct navigation
        window.location.href = deepLink;
      }
    } else {
      // Fallback for other mobile browsers
      window.open(deepLink, '_blank');
    }

    return true;
  } catch (error) {
    console.warn('Failed to open wallet:', error);
    return false;
  }
}

/**
 * Ensure wallet is connected before transaction
 * Attempts reconnection if needed with exponential backoff
 */
export async function ensureWalletConnected(config, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const account = getAccount(config);

      if (account.isConnected && account.address) {
        console.log('✅ Wallet connected:', account.address);
        return account;
      }

      console.log(`🔄 Wallet not connected, attempting reconnect (${attempt}/${maxRetries})...`);
      await reconnect(config);

      // Wait for reconnection to settle
      await sleep(500 * attempt);

      const newAccount = getAccount(config);
      if (newAccount.isConnected && newAccount.address) {
        console.log('✅ Wallet reconnected:', newAccount.address);
        return newAccount;
      }

    } catch (error) {
      console.warn(`Reconnect attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        await sleep(1000 * attempt); // Exponential backoff
      }
    }
  }

  throw new Error('Wallet not connected. Please reconnect your wallet.');
}

/**
 * Send BNB Payment (Step 1: Initiate Transaction)
 *
 * Enhanced for mobile with:
 * - Automatic wallet app opening
 * - Retry logic with exponential backoff
 * - Better error categorization
 *
 * @param {object} config - wagmi config
 * @param {string} userAddress - User's wallet address
 * @param {number} packageAmount - Package amount (1, 5, or 10)
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<string>} Transaction Hash
 */
export async function initiateBNBPayment(config, userAddress, packageAmount, maxRetries = 3) {
  const bnbAmount = PRICING[packageAmount];
  if (!bnbAmount) {
    throw new Error(`Invalid package amount: ${packageAmount}`);
  }

  const valueInWei = parseEther(bnbAmount);
  let lastError = null;
  const isMobile = isMobileDevice();

  // Step 0: Ensure wallet is connected
  await ensureWalletConnected(config);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Initiating BNB payment (attempt ${attempt}/${maxRetries})...`, {
        from: userAddress,
        to: PAYMENT_RECEIVER_ADDRESS,
        amount: bnbAmount,
        credits: packageAmount,
        isMobile,
      });

      // Create transaction promise
      const transactionPromise = sendTransaction(config, {
        to: PAYMENT_RECEIVER_ADDRESS,
        value: valueInWei,
        chainId: 97, // BSC Testnet
      });

      // On mobile, open wallet after transaction is queued in WalletConnect
      // Small delay ensures the request is ready when wallet opens
      if (isMobile) {
        setTimeout(() => {
          console.log('📱 Opening wallet app to show transaction...');
          openWalletOnMobile();
        }, 800);
      }

      // Wait for transaction hash
      const hash = await transactionPromise;

      console.log('📝 Transaction initiated. Hash:', hash);
      return hash;

    } catch (error) {
      lastError = error;
      console.error(`❌ Payment attempt ${attempt} failed:`, error);

      // Categorize errors - don't retry user-caused errors
      const errorMessage = error.message?.toLowerCase() || '';

      // User rejected - no retry
      if (errorMessage.includes('user rejected') ||
          errorMessage.includes('user denied') ||
          errorMessage.includes('cancelled') ||
          error.code === 4001) {
        throw new Error('Transaction rejected by user');
      }

      // Insufficient funds - no retry
      if (errorMessage.includes('insufficient funds') ||
          errorMessage.includes('insufficient balance')) {
        throw new Error('Insufficient BNB balance. Please get test BNB from faucet.');
      }

      // Connection issues - try to reconnect
      if (errorMessage.includes('connector') ||
          errorMessage.includes('disconnected') ||
          errorMessage.includes('no active connector') ||
          errorMessage.includes('provider')) {
        console.log('🔄 Connection issue detected, attempting reconnect...');
        try {
          await reconnect(config);
          await sleep(1000);
        } catch (reconnectError) {
          console.warn('Reconnect failed:', reconnectError.message);
        }
      }

      // Retry for network/transient errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw new Error(
    lastError?.message ||
    'Payment initiation failed after multiple attempts. Please check your connection and try again.'
  );
}

/**
 * Wait for Transaction Confirmation (Step 2)
 *
 * Robust confirmation with:
 * - Standard wait with timeout
 * - Fallback to polling
 * - Proper error handling for reverted transactions
 *
 * @param {object} config - wagmi config
 * @param {string} hash - Transaction Hash
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Transaction Receipt
 */
export async function waitForPaymentConfirmation(config, hash, options = {}) {
  const {
    maxPollingAttempts = 40,    // Up to 2 minutes of polling
    pollingInterval = 3000,     // Poll every 3 seconds
    initialWaitTimeout = 30000, // Initial wait: 30 seconds
  } = options;

  console.log('⏳ Waiting for confirmation of:', hash);

  // Step 1: Try standard wait first (faster when network is responsive)
  try {
    const receipt = await waitForTransactionReceipt(config, {
      hash,
      confirmations: 1,
      timeout: initialWaitTimeout,
    });

    if (receipt) {
      console.log('✅ Transaction confirmed (Standard wait):', receipt);
      return formatReceipt(receipt);
    }
  } catch (error) {
    // TimeoutError is expected on slow networks
    if (!error.message?.includes('timed out') && !error.message?.includes('timeout')) {
      console.warn('⚠️ Standard wait error:', error.message);
    }
    console.log('🔄 Switching to polling mode...');
  }

  // Step 2: Polling mode - more reliable for mobile/slow networks
  for (let attempt = 1; attempt <= maxPollingAttempts; attempt++) {
    try {
      if (attempt % 5 === 0) {
        console.log(`📡 Polling attempt ${attempt}/${maxPollingAttempts}...`);
      }

      const receipt = await getTransactionReceipt(config, { hash });

      if (receipt) {
        if (receipt.status === 'success') {
          console.log('✅ Transaction confirmed (Polling):', receipt);
          return formatReceipt(receipt);
        } else if (receipt.status === 'reverted') {
          throw new Error('Transaction was reverted on blockchain. Please try again.');
        }
      }
    } catch (error) {
      // Re-throw reverted errors
      if (error.message?.includes('reverted')) {
        throw error;
      }
      // Log other polling errors but continue
      if (attempt % 10 === 0) {
        console.warn(`Polling attempt ${attempt} error:`, error.message);
      }
    }

    // Wait before next poll
    if (attempt < maxPollingAttempts) {
      await sleep(pollingInterval);
    }
  }

  // Timeout - but transaction might still confirm
  throw new Error(
    'Transaction confirmation timed out. ' +
    'Your transaction may still be processing. ' +
    'Please check the "Check Status" button or view on BSCScan.'
  );
}

/**
 * Format transaction receipt for consistent response
 */
function formatReceipt(receipt) {
  return {
    success: receipt.status === 'success',
    hash: receipt.transactionHash,
    from: receipt.from,
    to: receipt.to,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    network: 'BSC Testnet',
    timestamp: Date.now(),
  };
}

/**
 * Get BSCScan link for transaction
 */
export function getBSCScanLink(hash) {
  return `https://testnet.bscscan.com/tx/${hash}`;
}

/**
 * Check if user has enough BNB for package
 * Includes gas buffer for transaction fees
 */
export function hasEnoughBalance(balance, packageAmount) {
  const required = parseFloat(PRICING[packageAmount]);
  const current = parseFloat(balance);
  const gasBuffer = 0.0005; // ~0.0005 BNB for gas on BSC
  return current >= (required + gasBuffer);
}
