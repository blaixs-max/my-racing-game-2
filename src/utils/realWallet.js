/**
 * REAL WALLET UTILITIES
 * BSC Testnet - Real Blockchain Integration
 */

import { sendTransaction, waitForTransactionReceipt, getTransactionReceipt } from '@wagmi/core';
import { parseEther } from 'viem';
import { PAYMENT_RECEIVER_ADDRESS, PRICING } from '../wagmi.config';

/**
 * Helper: Sleep function for delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Send BNB to payment receiver address (Step 1: Send)
 * With retry logic for network issues
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

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Initiating BNB payment (attempt ${attempt}/${maxRetries})...`, {
        from: userAddress,
        to: PAYMENT_RECEIVER_ADDRESS,
        amount: bnbAmount,
        credits: packageAmount,
      });

      // Send transaction and get Hash immediately
      const hash = await sendTransaction(config, {
        to: PAYMENT_RECEIVER_ADDRESS,
        value: valueInWei,
        chainId: 97, // BSC Testnet
      });

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

      // Retry for network/connection errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`⏳ Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw new Error(lastError?.message || 'Payment initiation failed after multiple attempts');
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
 * Wrapper for backward compatibility or simple usage
 */
export async function sendBNBPayment(config, userAddress, packageAmount) {
  const hash = await initiateBNBPayment(config, userAddress, packageAmount);

  // Return a mock object that contains the hash,
  // but we know we will wait for it in the UI separately if we use the new flow.
  // For backward compatibility with existing code:
  const receipt = await waitForPaymentConfirmation(config, hash);
  return { ...receipt, amount: PRICING[packageAmount], credits: packageAmount };
}

/**
 * Format wallet address for display
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Validate transaction hash format
 */
export function isValidTxHash(hash) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
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
