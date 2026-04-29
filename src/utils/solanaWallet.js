/**
 * Solana Wallet Utilities
 * SPL Token Transfer and Balance Functions for the payment token
 * (token defined in solana.config.js -> TOKEN_CONFIG)
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
import { calculateTokenAmount } from './jupiterPrice.js';

// Connection instance with fallback
let connection = null;
let currentRpcIndex = 0;

// Cached token program ID (SPL Token vs Token-2022)
let cachedTokenProgramId = null;

/**
 * Detect the token program (SPL Token or Token-2022) from the mint account.
 * Retries on transient RPC failures. Throws if mint cannot be resolved —
 * silently falling back to the wrong program would silently zero balances.
 * @param {Connection} conn - Solana connection
 * @returns {Promise<PublicKey>} Token program ID
 */
async function getTokenProgramId(conn) {
  if (cachedTokenProgramId) return cachedTokenProgramId;

  const mintPubkey = new PublicKey(TOKEN_CONFIG.mint);
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const accountInfo = await conn.getAccountInfo(mintPubkey);
      if (accountInfo) {
        cachedTokenProgramId = accountInfo.owner;
        console.log('[Solana] Detected token program:', cachedTokenProgramId.toString());
        return cachedTokenProgramId;
      }
      lastError = new Error('Mint account not found on RPC');
      console.warn(`[Solana] getAccountInfo returned null (attempt ${attempt}/3)`);
    } catch (e) {
      lastError = e;
      console.warn(`[Solana] getAccountInfo attempt ${attempt}/3 failed:`, e.message);
    }
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  throw new Error(
    `Cannot detect token program for mint ${TOKEN_CONFIG.mint}: ${lastError?.message || 'unknown error'}`
  );
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
 * Get payment token balance of wallet
 * @param {PublicKey} publicKey - Wallet public key
 * @param {Connection} conn - Optional connection instance (uses default if not provided)
 * @returns {Promise<number>} Token balance
 */
export async function getTokenBalance(publicKey, conn = null) {
  const connection = conn || getConnection();
  const mintPubkey = new PublicKey(TOKEN_CONFIG.mint);
  const tokenProgramId = await getTokenProgramId(connection);

  console.log(`[Solana] Fetching ${TOKEN_CONFIG.symbol} balance for:`, publicKey.toString());
  console.log('[Solana] Using token program:', tokenProgramId.toString());

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
    console.log(`[Solana] ${TOKEN_CONFIG.symbol} balance:`, balance);
    return balance;
  } catch (e) {
    if (e.name === 'TokenAccountNotFoundError') {
      console.log('[Solana] No token account found, balance is 0');
      return 0;
    }
    // Surface real errors (RPC failures, deserialization, etc.) instead of
    // silently returning 0 — caller decides how to display.
    console.error(`[Solana] Error reading ${TOKEN_CONFIG.symbol} token account:`, e);
    throw e;
  }
}

/**
 * Check if wallet has enough balance for payment
 * @param {PublicKey} publicKey - Wallet public key
 * @param {number} usdAmount - USD amount to pay
 * @returns {Promise<{hasEnough: boolean, tokenBalance: number, requiredTokens: number, solBalance: number}>}
 */
export async function checkPaymentBalance(publicKey, usdAmount) {
  try {
    const { tokenAmount: requiredTokens } = await calculateTokenAmount(usdAmount);

    const [tokenBalance, solBalance] = await Promise.all([
      getTokenBalance(publicKey),
      getSolBalance(publicKey)
    ]);

    const hasEnoughTokens = tokenBalance >= requiredTokens;
    const hasEnoughSol = solBalance >= PAYMENT_CONFIG.minSolBalance;

    console.log(`[Balance Check] ${TOKEN_CONFIG.symbol}: ${tokenBalance} (need ${requiredTokens}), SOL: ${solBalance}`);

    return {
      hasEnough: hasEnoughTokens && hasEnoughSol,
      hasEnoughTokens,
      hasEnoughSol,
      tokenBalance,
      requiredTokens,
      solBalance,
      minSolRequired: PAYMENT_CONFIG.minSolBalance
    };
  } catch (error) {
    console.error('[Solana] Error checking balance:', error);
    throw error;
  }
}

/**
 * Transfer payment tokens to receiver wallet
 * @param {object} wallet - Wallet adapter instance
 * @param {number} usdAmount - USD amount to pay
 * @returns {Promise<{signature: string, tokenAmount: number, price: number}>}
 */
export async function transferToken(wallet, usdAmount) {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  const conn = getConnection();
  const senderPubkey = wallet.publicKey;
  const receiverPubkey = new PublicKey(PAYMENT_CONFIG.receiverWallet);
  const mintPubkey = new PublicKey(TOKEN_CONFIG.mint);

  const tokenProgramId = await getTokenProgramId(conn);

  const { tokenAmount, price } = await calculateTokenAmount(usdAmount);
  const rawAmount = toRawAmount(tokenAmount);

  console.log(`[Transfer] Sending ${tokenAmount} ${TOKEN_CONFIG.symbol} ($${usdAmount}) to ${PAYMENT_CONFIG.receiverWallet}`);
  console.log(`[Transfer] Using token program: ${tokenProgramId.toString()}`);

  const senderAta = await getAssociatedTokenAddress(
    mintPubkey,
    senderPubkey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const receiverAta = await getAssociatedTokenAddress(
    mintPubkey,
    receiverPubkey,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const transaction = new Transaction();

  try {
    await getAccount(conn, receiverAta, undefined, tokenProgramId);
  } catch (e) {
    if (e.name === 'TokenAccountNotFoundError') {
      console.log('[Transfer] Creating receiver ATA...');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          senderPubkey,
          receiverAta,
          receiverPubkey,
          mintPubkey,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
  }

  transaction.add(
    createTransferInstruction(
      senderAta,
      receiverAta,
      senderPubkey,
      rawAmount,
      [],
      tokenProgramId
    )
  );

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = senderPubkey;

  console.log('[Transfer] Requesting wallet signature...');

  try {
    const signature = await wallet.sendTransaction(transaction, conn, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    console.log('[Transfer] Transaction sent:', signature);

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
      tokenAmount,
      price
    };
  } catch (error) {
    console.error('[Transfer] Transaction error:', error);

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

      if (Date.now() - startTime > timeout) {
        onError(new Error('Transaction confirmation timeout'));
        return;
      }

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
  getTokenBalance,
  checkPaymentBalance,
  transferToken,
  getTransactionDetails,
  watchTransaction,
  formatAddress,
  isValidSolanaAddress,
  getExplorerUrl,
  isMobileDevice,
  openWalletApp
};
