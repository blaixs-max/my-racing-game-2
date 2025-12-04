/**
 * REAL WALLET UTILITIES
 * BSC Testnet - Real Blockchain Integration
 */

import { sendTransaction, waitForTransactionReceipt, getTransactionReceipt } from '@wagmi/core';
import { parseEther } from 'viem';
import { PAYMENT_RECEIVER_ADDRESS, PRICING } from '../wagmi.config';

/**
 * Send BNB to payment receiver address (Step 1: Send)
 * @param {object} config - wagmi config
 * @param {string} userAddress - User's wallet address
 * @param {number} packageAmount - Package amount (1, 5, or 10)
 * @returns {Promise<string>} Transaction Hash
 */
export async function initiateBNBPayment(config, userAddress, packageAmount) {
  try {
    console.log('🔄 Initiating BNB payment...', {
      from: userAddress,
      to: PAYMENT_RECEIVER_ADDRESS,
      amount: PRICING[packageAmount],
      credits: packageAmount,
    });

    const bnbAmount = PRICING[packageAmount];
    if (!bnbAmount) {
      throw new Error(`Invalid package amount: ${packageAmount}`);
    }

    const valueInWei = parseEther(bnbAmount);

    // Send transaction and get Hash immediately
    const hash = await sendTransaction(config, {
      to: PAYMENT_RECEIVER_ADDRESS,
      value: valueInWei,
      chainId: 97, // BSC Testnet
    });

    console.log('📝 Transaction initiated. Hash:', hash);
    return hash;

  } catch (error) {
    console.error('❌ Payment initiation failed:', error);
    if (error.message?.includes('User rejected') || error.code === 4001) {
      throw new Error('Transaction rejected by user');
    }
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient BNB balance. Please get test BNB from faucet.');
    }
    throw new Error(error.message || 'Payment initiation failed');
  }
}

/**
 * Wait for transaction confirmation (Step 2: Confirm)
 * Robust method that survives app backgrounding by allowing manual re-check
 * @param {object} config - wagmi config
 * @param {string} hash - Transaction Hash
 * @returns {Promise<object>} Transaction Receipt
 */
export async function waitForPaymentConfirmation(config, hash) {
  console.log('⏳ Waiting for confirmation of:', hash);

  try {
    // Attempt standard wait first
    const receipt = await waitForTransactionReceipt(config, {
      hash,
      confirmations: 1,
      timeout: 60000, // 60s timeout for standard wait
    });

    console.log('✅ Transaction confirmed (Standard wait):', receipt);
    return formatReceipt(receipt);

  } catch (error) {
    console.warn('⚠️ Standard wait timed out or failed, trying manual check...', error);

    // Fallback: Manually check receipt immediately
    try {
      const receipt = await getTransactionReceipt(config, { hash });
      if (receipt && receipt.status === 'success') {
        console.log('✅ Transaction confirmed (Manual check):', receipt);
        return formatReceipt(receipt);
      }
    } catch (innerError) {
      console.warn('Manual check also failed:', innerError);
    }

    // If logic reaches here, we assume it's still pending or failed unknown
    throw new Error('Transaction confirmation timed out. Please check your wallet history.');
  }
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
