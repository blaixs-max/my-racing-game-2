/**
 * REAL WALLET UTILITIES
 * BSC Testnet - Real Blockchain Integration
 */

import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import { parseEther } from 'viem';
import { PAYMENT_RECEIVER_ADDRESS, PRICING } from '../wagmi.config';

/**
 * Send BNB to payment receiver address
 * @param {object} config - wagmi config
 * @param {string} userAddress - User's wallet address
 * @param {number} packageAmount - Package amount (1, 5, or 10)
 * @returns {Promise<object>} Transaction receipt
 */
export async function sendBNBPayment(config, userAddress, packageAmount) {
  try {
    console.log('🔄 Sending BNB payment...', {
      from: userAddress,
      to: PAYMENT_RECEIVER_ADDRESS,
      amount: PRICING[packageAmount],
      credits: packageAmount,
    });

    // Get BNB amount for this package
    const bnbAmount = PRICING[packageAmount];
    if (!bnbAmount) {
      throw new Error(`Invalid package amount: ${packageAmount}`);
    }

    // Convert to Wei
    const valueInWei = parseEther(bnbAmount);

    // Send transaction
    const hash = await sendTransaction(config, {
      to: PAYMENT_RECEIVER_ADDRESS,
      value: valueInWei,
      chainId: 97, // BSC Testnet
    });

    console.log('📝 Transaction sent:', hash);

    // Wait for confirmation
    const receipt = await waitForTransactionReceipt(config, {
      hash,
      confirmations: 1, // Wait for 1 block confirmation
    });

    console.log('✅ Transaction confirmed:', receipt);

    return {
      success: true,
      hash: receipt.transactionHash,
      from: receipt.from,
      to: receipt.to,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      amount: bnbAmount,
      credits: packageAmount,
      network: 'BSC Testnet',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('❌ Payment failed:', error);

    // User rejected transaction
    if (error.message?.includes('User rejected') || error.code === 4001) {
      throw new Error('Transaction rejected by user');
    }

    // Insufficient funds
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient BNB balance. Please get test BNB from faucet.');
    }

    // Network error
    if (error.message?.includes('network')) {
      throw new Error('Network error. Please check your connection and try again.');
    }

    throw new Error(error.message || 'Payment failed');
  }
}

/**
 * Format wallet address for display
 * @param {string} address - Full wallet address
 * @returns {string} Formatted address (0x1234...5678)
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Validate transaction hash format
 * @param {string} hash - Transaction hash
 * @returns {boolean} Is valid
 */
export function isValidTxHash(hash) {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Get BSCScan link for transaction
 * @param {string} hash - Transaction hash
 * @returns {string} BSCScan URL
 */
export function getBSCScanLink(hash) {
  return `https://testnet.bscscan.com/tx/${hash}`;
}

/**
 * Check if user has enough BNB for package
 * @param {string} balance - User's BNB balance (in BNB)
 * @param {number} packageAmount - Package amount (1, 5, or 10)
 * @returns {boolean} Has enough balance
 */
export function hasEnoughBalance(balance, packageAmount) {
  const required = parseFloat(PRICING[packageAmount]);
  const current = parseFloat(balance);

  // Add small buffer for gas fees (~0.0001 BNB)
  const gasBuffer = 0.0001;

  return current >= (required + gasBuffer);
}
