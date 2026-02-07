/**
 * Solana Wallet Utilities
 * SPL Token Transfer and Balance Functions for COAL Token
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
  TOKEN_CONFIG,
  PAYMENT_CONFIG,
  DEFAULT_RPC_ENDPOINT,
  RPC_ENDPOINTS,
  toRawAmount,
  fromRawAmount
} from '../solana.config.js';
import { calculateCoalAmount } from './jupiterPrice.js';

// Connection instance with fallback
let connection = null;
let currentRpcIndex = 0;

// Cached token program ID (SPL Token vs Token-2022)
let cachedTokenProgramId = null;

/**
 * Detect the token program (SPL Token or Token-2022) from the mint account.
 * pump.fun tokens use Token-2022, so we auto-detect instead of hardcoding.
 * @param {Connection} conn - Solana connection
 * @returns {Promise<PublicKey>} Token program ID
 */
async function getTokenProgramId(conn) {
  if (cachedTokenProgramId) return cachedTokenProgramId;

  const mintPubkey = new PublicKey(TOKEN_CONFIG.mint);
  const accountInfo = await conn.getAccountInfo(mintPubkey);

  if (!accountInfo) {
    console.warn('[Solana] Mint account not found, defaulting to TOKEN_PROGRAM_ID');
    return TOKEN_PROGRAM_ID;
  }

  cachedTokenProgramId = accountInfo.owner;
  console.log('[Solana] Detected token program:', cachedTokenProgramId.toString());
  return cachedTokenProgramId;
}

/**
 * Get or create Solana connection with fallback RPC
 */
export function getConnection() {
  if (!connection) {
    connection = new Connection(RPC_ENDPOINTS[currentRpcIndex], {
      commitment: PAYMENT_CONFIG.commitment,
      confirmTransactionInitialTimeout: 60000
    });
  }
  return connection;
}

/**
 * Switch to next RPC endpoint on failure
 */
export function switchRpcEndpoint() {
  currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
  connection = new Connection(RPC_ENDPOINTS[currentRpcIndex], {
    commitment: PAYMENT_CONFIG.commitment,
    confirmTransactionInitialTimeout: 60000
  });
  console.log(`[Solana] Switched to RPC: ${RPC_ENDPOINTS[currentRpcIndex]}`);
  return connection;
}

/**
 * Get SOL balance of wallet
 * @param {PublicKey} publicKey - Wallet public key
 * @param {Connection} conn - Optional connection instance (uses default if not provided)
 * @returns {Promise<number>} SOL balance
 */
export async function getSolBalance(publicKey, conn = null) {
  try {
    const connection = conn || getConnection();
    console.log('[Solana] Fetching SOL balance for:', publicKey.toString());
    const balance = await connection.getBalance(publicKey);
    console.log('[Solana] SOL balance raw:', balance);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('[Solana] Error getting SOL balance:', error);
    return 0;
  }
}

/**
 * Get COAL token balance of wallet
 * @param {PublicKey} publicKey - Wallet public key
 * @param {Connection} conn - Optional connection instance (uses default if not provided)
 * @returns {Promise<number>} COAL token balance
 */
export async function getCoalBalance(publicKey, conn = null) {
  try {
    const connection = conn || getConnection();
    const mintPubkey = new PublicKey(TOKEN_CONFIG.mint);
    const tokenProgramId = await getTokenProgramId(connection);

    console.log('[Solana] Fetching COAL balance for:', publicKey.toString());
    console.log('[Solana] Using token program:', tokenProgramId.toString());

    // Get associated token account address with detected program
    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      publicKey,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log('[Solana] Token ATA:', ata.toString());

    try {
      const tokenAccount = await getAccount(connection, ata, undefined, tokenProgramId);
      const balance = fromRawAmount(Number(tokenAccount.amount));
      console.log('[Solana] COAL balance:', balance);
      return balance;
    } catch (e) {
      // Account doesn't exist, balance is 0
      if (e.name === 'TokenAccountNotFoundError') {
        console.log('[Solana] No token account found, balance is 0');
        return 0;
      }
      throw e;
    }
  } catch (error) {
    console.error('[Solana] Error getting COAL balance:', error);
    return 0;
  }
}

/**
 * Check if wallet has enough balance for payment
 * @param {PublicKey} publicKey - Wallet public key
 * @param {number} usdAmount - USD amount to pay
 * @returns {Promise<{hasEnough: boolean, coalBalance: number, requiredCoal: number, solBalance: number}>}
 */
export async function checkPaymentBalance(publicKey, usdAmount) {
  try {
    // Get current price and calculate required COAL
    const { coalAmount: requiredCoal } = await calculateCoalAmount(usdAmount);

    // Get balances
    const [coalBalance, solBalance] = await Promise.all([
      getCoalBalance(publicKey),
      getSolBalance(publicKey)
    ]);

    const hasEnoughCoal = coalBalance >= requiredCoal;
    const hasEnoughSol = solBalance >= PAYMENT_CONFIG.minSolBalance;

    console.log(`[Balance Check] COAL: ${coalBalance} (need ${requiredCoal}), SOL: ${solBalance}`);

    return {
      hasEnough: hasEnoughCoal && hasEnoughSol,
      hasEnoughCoal,
      hasEnoughSol,
      coalBalance,
      requiredCoal,
      solBalance,
      minSolRequired: PAYMENT_CONFIG.minSolBalance
    };
  } catch (error) {
    console.error('[Solana] Error checking balance:', error);
    throw error;
  }
}

/**
 * Transfer COAL tokens to receiver wallet
 * @param {object} wallet - Wallet adapter instance
 * @param {number} usdAmount - USD amount to pay
 * @returns {Promise<{signature: string, coalAmount: number, price: number}>}
 */
export async function transferCoalToken(wallet, usdAmount) {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  const conn = getConnection();
  const senderPubkey = wallet.publicKey;
  const receiverPubkey = new PublicKey(PAYMENT_CONFIG.receiverWallet);
  const mintPubkey = new PublicKey(TOKEN_CONFIG.mint);

  // Detect token program (SPL Token vs Token-2022)
  const tokenProgramId = await getTokenProgramId(conn);

  // Calculate COAL amount needed
  const { coalAmount, price } = await calculateCoalAmount(usdAmount);
  const rawAmount = toRawAmount(coalAmount);

  console.log(`[Transfer] Sending ${coalAmount} COAL ($${usdAmount}) to ${PAYMENT_CONFIG.receiverWallet}`);
  console.log(`[Transfer] Using token program: ${tokenProgramId.toString()}`);

  // Get sender's ATA with detected program
  const senderAta = await getAssociatedTokenAddress(
    mintPubkey,
    senderPubkey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Get receiver's ATA with detected program
  const receiverAta = await getAssociatedTokenAddress(
    mintPubkey,
    receiverPubkey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Create transaction
  const transaction = new Transaction();

  // Check if receiver ATA exists, create if not
  try {
    await getAccount(conn, receiverAta, undefined, tokenProgramId);
  } catch (e) {
    if (e.name === 'TokenAccountNotFoundError') {
      console.log('[Transfer] Creating receiver ATA...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPubkey, // payer
          receiverAta, // ata
          receiverPubkey, // owner
          mintPubkey, // mint
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
  }

  // Add transfer instruction with detected program
  transaction.add(
    createTransferInstruction(
      senderAta, // source
      receiverAta, // destination
      senderPubkey, // owner
      rawAmount, // amount
      [], // multiSigners
      tokenProgramId
    )
  );

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = senderPubkey;

  // Sign and send transaction
  console.log('[Transfer] Requesting wallet signature...');

  try {
    const signature = await wallet.sendTransaction(transaction, conn, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    console.log('[Transfer] Transaction sent:', signature);

    // Wait for confirmation
    const confirmation = await conn.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[Transfer] Transaction confirmed!');

    return {
      signature,
      coalAmount,
      price
    };
  } catch (error) {
    console.error('[Transfer] Transaction error:', error);

    // Handle specific errors
    if (error.message?.includes('User rejected')) {
      throw new Error('Transaction cancelled by user');
    }

    throw error;
  }
}

/**
 * Get transaction details from signature
 * @param {string} signature - Transaction signature
 * @returns {Promise<object>} Transaction details
 */
export async function getTransactionDetails(signature) {
  try {
    const conn = getConnection();
    const tx = await conn.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    return tx;
  } catch (error) {
    console.error('[Solana] Error getting transaction:', error);
    throw error;
  }
}

/**
 * Watch for transaction confirmation
 * @param {string} signature - Transaction signature
 * @param {function} onConfirmed - Callback when confirmed
 * @param {function} onError - Callback on error
 * @param {number} timeout - Timeout in ms
 */
export async function watchTransaction(signature, onConfirmed, onError, timeout = 60000) {
  const conn = getConnection();
  const startTime = Date.now();

  const checkConfirmation = async () => {
    try {
      const status = await conn.getSignatureStatus(signature);

      if (status.value?.confirmationStatus === 'confirmed' ||
          status.value?.confirmationStatus === 'finalized') {
        if (status.value.err) {
          onError(new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`));
        } else {
          onConfirmed(signature);
        }
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        onError(new Error('Transaction confirmation timeout'));
        return;
      }

      // Continue polling
      setTimeout(checkConfirmation, 2000);
    } catch (error) {
      onError(error);
    }
  };

  checkConfirmation();
}

/**
 * Format wallet address for display
 * @param {string} address - Full wallet address
 * @returns {string} Shortened address
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Validate Solana address
 * @param {string} address - Address to validate
 * @returns {boolean} Is valid
 */
export function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Solana Explorer URL for transaction
 * @param {string} signature - Transaction signature
 * @returns {string} Explorer URL
 */
export function getExplorerUrl(signature) {
  return `https://solscan.io/tx/${signature}`;
}

/**
 * Detect mobile device
 * @returns {boolean}
 */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Open wallet app on mobile (for deep linking)
 * @param {string} walletName - Name of wallet
 */
export function openWalletApp(walletName) {
  if (!isMobileDevice()) return;

  const deepLinks = {
    phantom: 'https://phantom.app/ul/browse/',
    solflare: 'https://solflare.com/ul/',
    backpack: 'backpack://'
  };

  const link = deepLinks[walletName.toLowerCase()];
  if (link) {
    window.location.href = link + encodeURIComponent(window.location.href);
  }
}

export default {
  getConnection,
  switchRpcEndpoint,
  getSolBalance,
  getCoalBalance,
  checkPaymentBalance,
  transferCoalToken,
  getTransactionDetails,
  watchTransaction,
  formatAddress,
  isValidSolanaAddress,
  getExplorerUrl,
  isMobileDevice,
  openWalletApp
};
