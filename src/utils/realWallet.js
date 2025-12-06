/**
 * REAL WALLET UTILITIES
 * BSC Testnet - Real Blockchain Integration
 * Enhanced for Mobile Wallet Support
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
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Detect if user is on iOS
 */
export function isIOS() {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Get MetaMask deep link URL
 * Uses universal links for iOS (recommended by MetaMask)
 */
export function getMetaMaskDeepLink() {
  // Universal link works better on iOS
  // WalletConnect bridge link - triggers MetaMask to check for pending requests
  return 'https://metamask.app.link/wc';
}

/**
 * Open MetaMask wallet on mobile
 * This forces the wallet app to open and show pending transaction
 */
export function openWalletOnMobile() {
  if (!isMobileDevice()) return false;

  try {
    const deepLink = getMetaMaskDeepLink();
    console.log('📱 Opening MetaMask via deep link:', deepLink);

    // Use window.location for more reliable deep linking on iOS Safari
    if (isIOS()) {
      window.location.href = deepLink;
    } else {
      // For Android, window.open works better
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
 * Attempts reconnection if needed
 */
export async function ensureWalletConnected(config) {
  try {
    const account = getAccount(config);

    if (!account.isConnected) {
      console.log('🔄 Wallet disconnected, attempting reconnect...');
      await reconnect(config);

      // Wait a bit for reconnection
      await sleep(500);

      const newAccount = getAccount(config);
      if (!newAccount.isConnected) {
        throw new Error('Wallet not connected. Please reconnect your wallet.');
      }
      console.log('✅ Wallet reconnected:', newAccount.address);
    }

    return account;
  } catch (error) {
    console.error('❌ Wallet connection check failed:', error);
    throw new Error('Please reconnect your wallet and try again.');
  }
}

/**
 * Send BNB to payment receiver address (Step 1: Send)
 * Enhanced for mobile with deep linking and retry logic
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

  // Step 0: Ensure wallet is still connected
  try {
    await ensureWalletConnected(config);
  } catch (error) {
    throw new Error('Wallet disconnected. Please reconnect and try again.');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Initiating BNB payment (attempt ${attempt}/${maxRetries})...`, {
        from: userAddress,
        to: PAYMENT_RECEIVER_ADDRESS,
        amount: bnbAmount,
        credits: packageAmount,
        isMobile,
      });

      // On mobile, open wallet BEFORE sending transaction
      // This primes the wallet to receive the transaction request
      if (isMobile && attempt === 1) {
        console.log('📱 Mobile detected - opening wallet for transaction...');
        // Small delay to let the UI update before opening wallet
        await sleep(100);
      }

      // Create transaction promise
      const transactionPromise = sendTransaction(config, {
        to: PAYMENT_RECEIVER_ADDRESS,
        value: valueInWei,
        chainId: 97, // BSC Testnet
      });

      // On mobile, open wallet after a short delay
      // This gives time for the transaction to be queued in WalletConnect
      if (isMobile) {
        // Open wallet after transaction is initiated (with small delay)
        setTimeout(() => {
          console.log('📱 Opening wallet app to show transaction...');
          openWalletOnMobile();
        }, 500);
      }

      // Wait for transaction hash
      const hash = await transactionPromise;

      console.log('📝 Transaction initiated. Hash:', hash);
      return hash;

    } catch (error) {
      lastError = error;
      console.error(`❌ Payment attempt ${attempt} failed:`, error);

      // Don't retry for user-caused errors
      if (error.message?.includes('User rejected') || error.code === 4001) {
        throw new Error('Transaction rejected by user');
      }
      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient BNB balance. Please get test BNB from faucet.');
      }
      if (error.message?.includes('denied') || error.message?.includes('cancelled')) {
        throw new Error('Transaction cancelled by user');
      }

      // Check for connector/connection errors and try to reconnect
      if (error.message?.includes('connector') ||
          error.message?.includes('disconnected') ||
          error.message?.includes('no active connector')) {
        console.log('🔄 Connection issue detected, attempting reconnect...');
        try {
          await reconnect(config);
          await sleep(1000);
        } catch (reconnectError) {
          console.warn('Reconnect failed:', reconnectError);
        }
      }

      // Retry for network/connection errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw new Error(lastError?.message || 'Payment initiation failed after multiple attempts. Please try again.');
}

/**
 * Wait for transaction confirmation (Step 2: Confirm)
 * Robust polling method with multiple retries
 * @param {object} config - wagmi config
 * @param {string} hash - Transaction Hash
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Transaction Receipt
 */
export async function waitForPaymentConfirmation(config, hash, options = {}) {
  const {
    maxPollingAttempts = 30,  // Maximum polling attempts
    pollingInterval = 3000,   // Poll every 3 seconds
    initialWaitTimeout = 30000, // Initial wait timeout: 30 seconds
  } = options;

  console.log('⏳ Waiting for confirmation of:', hash);

  // Step 1: Try standard wait first (shorter timeout)
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
    console.warn('⚠️ Standard wait failed, switching to polling mode...', error.message);
  }

  // Step 2: Polling mode - check receipt repeatedly
  console.log('🔄 Starting polling mode...');

  for (let attempt = 1; attempt <= maxPollingAttempts; attempt++) {
    try {
      console.log(`📡 Polling attempt ${attempt}/${maxPollingAttempts}...`);

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
      // Ignore polling errors and continue (might be network issues)
      if (error.message?.includes('reverted')) {
        throw error; // Re-throw reverted errors
      }
      console.warn(`Polling attempt ${attempt} error:`, error.message);
    }

    // Wait before next poll
    if (attempt < maxPollingAttempts) {
      await sleep(pollingInterval);
    }
  }

  // All polling attempts exhausted - but transaction might still confirm later
  throw new Error(
    'Transaction confirmation timed out. ' +
    'Your transaction may still be processing. ' +
    'Please check the "Check Status" button or view on BSCScan.'
  );
}

// Helper to format receipt consistent with previous version
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
 */
export function hasEnoughBalance(balance, packageAmount) {
  const required = parseFloat(PRICING[packageAmount]);
  const current = parseFloat(balance);
  const gasBuffer = 0.0001;
  return current >= (required + gasBuffer);
}
