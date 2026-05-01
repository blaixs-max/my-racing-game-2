import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletMultiButton } from '@solana/wallet-adapter-base-ui';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getTokenBalance,
  checkPaymentBalance,
  transferToken,
  getExplorerUrl,
  isMobileDevice
} from '../utils/solanaWallet';
import { getTokenPrice, formatPrice } from '../utils/jupiterPrice';
import { getOrCreateUser } from '../utils/supabaseClient';
import { TOKEN_CONFIG, PAYMENT_CONFIG, DEFAULT_RPC_ENDPOINT, formatTokenAmount } from '../solana.config';

// Solana Theme Colors
const SOLANA_COLORS = {
  purple: '#9945FF',
  purpleLight: '#B87AFF',
  purpleDark: '#7B2FE0',
  green: '#14F195',
  greenLight: '#5FFFC1',
  greenDark: '#0BC47D',
  bgPrimary: '#0B0B0F',
  bgSecondary: '#13111C',
  bgCard: '#1A1625',
  bgCardHover: '#231E30',
  textPrimary: '#E8E8E8',
  textSecondary: '#8B8B9A',
  textMuted: '#5A5A6A',
  borderPurple: 'rgba(153, 69, 255, 0.2)',
  borderGreen: 'rgba(20, 241, 149, 0.2)',
  glowPurple: 'rgba(153, 69, 255, 0.4)',
  glowGreen: 'rgba(20, 241, 149, 0.4)',
  warning: '#FB923C',
  error: '#EF4444',
};

// Agreement Text Content - uses active payment token symbol from TOKEN_CONFIG
const buildAgreementText = (tokenSymbol) => `Lumexia: Gameplay Participation Agreement & Risk Disclosure

IMPORTANT: Please read the following terms carefully before participating in the Lumexia Racing Module. By clicking "ACCEPT", you acknowledge that you have read, understood, and agreed to be bound by these terms.

1. Nature of the Game (Game of Skill)
You acknowledge that the Lumexia Racing Module is a Game of Skill, not a game of chance or gambling. Your ranking on the leaderboard and eligibility for rewards are determined solely by your gameplay performance, reflexes, and strategy. The "Score" you achieve is the defining metric for reward distribution.

2. Entry Fees and ${tokenSymbol} Token Usage
To participate, users utilize ${tokenSymbol} tokens (on Solana blockchain) to acquire game credits (Jetons). You understand that this transaction is final and non-refundable. The ${tokenSymbol} tokens collected form the "Reward Pool" for the 48-hour cycle.

3. Reward Distribution & Deductions
The Reward Pool is distributed every 48 hours to the top 100 players based on their final scores. You explicitly agree to the following allocation of funds:

Prize Pool: The majority of the pool is distributed to the winners via an automated algorithm.

Operational Fee: A fixed deduction of 7.5% is taken from the total pool prior to distribution. This fee is allocated for Marketing activities and Weekly Token Burns to support the Lumexia ecosystem.

4. No Guarantee of Winnings
Participation does not guarantee a reward. If you do not rank within the top 100 players by the end of the 48-hour cycle, you will not receive a share of the ${tokenSymbol} pool for that specific session. You acknowledge the risk of financial loss associated with gameplay.

5. Cryptocurrency Risks
You acknowledge that the value of ${tokenSymbol} token and SOL can fluctuate significantly. Lumexia is not responsible for any value loss due to market volatility, blockchain network errors, or wallet security breaches on the user's end.

6. Legal Compliance
You represent and warrant that you are of legal age and that participating in skill-based crypto gaming is legal in your local jurisdiction. It is your sole responsibility to comply with the laws of your country of residence.

7. Automated Execution
Reward distributions are executed by smart contracts/automated algorithms. These transactions are irreversible. By playing, you accept the calculated results as final.`;

const AGREEMENT_TEXT = buildAgreementText(TOKEN_CONFIG.symbol);

const RealLauncherUI = ({ onStartGame }) => {
  const { publicKey, connected, connecting, wallets, select } = useWallet();
  const walletAdapter = useWallet();

  // Create a stable connection instance
  const connection = useMemo(() => {
    console.log('[UI] Creating connection to:', DEFAULT_RPC_ENDPOINT);
    return new Connection(DEFAULT_RPC_ENDPOINT, 'confirmed');
  }, []);

  // Wallet selection modal state
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletModalConfig, setWalletModalConfig] = useState(null);

  // useWalletMultiButton for reliable wallet connection
  const { buttonState, onConnect, onDisconnect, onSelectWallet } = useWalletMultiButton({
    onSelectWallet: (config) => {
      console.log('onSelectWallet called with config:', config);
      setWalletModalConfig(config);
      setWalletModalOpen(true);
    },
  });

  // Handle wallet selection from modal
  const handleWalletSelect = useCallback((walletName) => {
    console.log('Selecting wallet:', walletName);
    if (walletModalConfig?.onSelectWallet) {
      walletModalConfig.onSelectWallet(walletName);
    } else {
      select(walletName);
    }
    setWalletModalOpen(false);
    setWalletModalConfig(null);
  }, [walletModalConfig, select]);

  // Handle wallet connect button click
  const handleConnectClick = useCallback(() => {
    console.log('Connect button clicked, state:', buttonState);

    switch (buttonState) {
      case 'connected':
        onDisconnect?.();
        break;
      case 'has-wallet':
        onConnect?.();
        break;
      case 'no-wallet':
        onSelectWallet?.();
        break;
      default:
        onSelectWallet?.();
    }
  }, [buttonState, onConnect, onDisconnect, onSelectWallet]);

  // Track mounting to prevent strict mode double-firing issues
  const isMounted = useRef(false);

  // Agreement State - Show agreement on every visit
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  // State Management
  const [state, setState] = useState(() => {
    try {
      const savedState = localStorage.getItem('lumexia-pending-tx');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        return {
          selectedPackage: parsed.selectedPackage || null,
          credits: 0,
          isProcessing: parsed.isProcessing || false,
          statusMessage: parsed.statusMessage || 'Connect your wallet to get started',
          lastTransaction: parsed.lastTransaction || null,
          pendingTxHash: parsed.pendingTxHash || null,
          gameMode: 'classic',
        };
      }
    } catch (e) {
      console.warn('Failed to restore state from localStorage:', e);
    }

    return {
      selectedPackage: null,
      credits: 0,
      isProcessing: false,
      statusMessage: 'Connect your wallet to get started',
      lastTransaction: null,
      pendingTxHash: null,
      gameMode: 'classic',
    };
  });

  // Token balances
  const [tokenBalance, setTokenBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [tokenPrice, setTokenPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [tokenBalanceError, setTokenBalanceError] = useState(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  // Save pending transaction state to localStorage
  useEffect(() => {
    if (state.pendingTxHash && state.isProcessing) {
      const toSave = {
        pendingTxHash: state.pendingTxHash,
        selectedPackage: state.selectedPackage,
        isProcessing: state.isProcessing,
        statusMessage: state.statusMessage,
        lastTransaction: state.lastTransaction,
      };
      localStorage.setItem('lumexia-pending-tx', JSON.stringify(toSave));
    } else {
      localStorage.removeItem('lumexia-pending-tx');
    }
  }, [state.pendingTxHash, state.isProcessing, state.selectedPackage, state.statusMessage, state.lastTransaction]);

  // Fetch token price periodically
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        setPriceLoading(true);
        const price = await getTokenPrice();
        setTokenPrice(price);
      } catch (error) {
        console.error(`Failed to fetch ${TOKEN_CONFIG.symbol} price:`, error);
      } finally {
        setPriceLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch balances when wallet connects
  useEffect(() => {
    const fetchBalances = async () => {
      console.log('[UI] fetchBalances called - connected:', connected, 'publicKey:', publicKey?.toString());

      if (!connected || !publicKey) {
        console.log('[UI] Skipping - wallet not connected');
        setTokenBalance(0);
        setSolBalance(0);
        setTokenBalanceError(null);
        return;
      }

      try {
        console.log('[UI] Fetching SOL balance...');
        const solBalanceRaw = await connection.getBalance(publicKey);
        const solBal = solBalanceRaw / LAMPORTS_PER_SOL;
        console.log('[UI] SOL balance:', solBal);
        setSolBalance(solBal);
      } catch (error) {
        console.error('[UI] SOL balance error:', error);
        // Keep last known SOL balance instead of resetting to 0.
      }

      try {
        console.log(`[UI] Fetching ${TOKEN_CONFIG.symbol} balance...`);
        const tokenBal = await getTokenBalance(publicKey, connection);
        console.log(`[UI] ${TOKEN_CONFIG.symbol} balance:`, tokenBal);
        setTokenBalance(tokenBal);
        setTokenBalanceError(null);
      } catch (error) {
        console.error(`[UI] ${TOKEN_CONFIG.symbol} balance error:`, error);
        // Keep last value visible; surface error for retry UI.
        setTokenBalanceError(error?.message || 'Balance fetch failed');
      }
    };

    fetchBalances();
    const interval = connected ? setInterval(fetchBalances, 15000) : null;
    return () => interval && clearInterval(interval);
  }, [connected, publicKey, connection, balanceRefreshKey]);

  // Re-check connection and pending transactions when app comes to foreground
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await handleAppForeground();
      }
    };

    const handleFocus = async () => {
      await handleAppForeground();
    };

    const handlePageShow = async () => {
      await handleAppForeground();
    };

    const handleAppForeground = async () => {
      if (connected && publicKey) {
        await loadUserData(publicKey.toString());
        // Refresh balances
        try {
          const solBalanceRaw = await connection.getBalance(publicKey);
          setSolBalance(solBalanceRaw / LAMPORTS_PER_SOL);
          const tokenBal = await getTokenBalance(publicKey, connection);
          setTokenBalance(tokenBal);
        } catch (error) {
          console.error('[UI] Error refreshing balances on foreground:', error);
        }
      }
      if (state.pendingTxHash && state.isProcessing) {
        await checkPendingTransaction(state.pendingTxHash);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingTxHash, state.isProcessing, connected, publicKey]);

  // Check for pending transaction on mount
  useEffect(() => {
    if (connected && publicKey && state.pendingTxHash && state.isProcessing) {
      const timer = setTimeout(() => {
        checkPendingTransaction(state.pendingTxHash);
      }, 2000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  // Load user credits when wallet connects
  useEffect(() => {
    isMounted.current = true;
    if (connected && publicKey) {
      loadUserData(publicKey.toString());
    } else {
      setState(prev => ({
        ...prev,
        credits: 0,
        selectedPackage: null,
        statusMessage: 'Connect your wallet to get started'
      }));
    }
    return () => { isMounted.current = false; };
  }, [connected, publicKey]);

  // Load user credits from database
  const loadUserData = async (walletAddress) => {
    try {
      setState(prev => ({ ...prev, isProcessing: true }));

      const user = await getOrCreateUser(walletAddress);

      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          credits: user.credits || 0,
          isProcessing: false,
          statusMessage: `Connected! You have ${user.credits || 0} credits`
        }));
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          statusMessage: 'Failed to load data. Please refresh.'
        }));
      }
    }
  };

  // Calculate required token amount for package
  const getRequiredTokens = (usdAmount) => {
    if (!tokenPrice || tokenPrice <= 0) return null;
    return usdAmount / tokenPrice;
  };

  // Ticket Selection Handler
  const handleSelectTicket = (amount) => {
    if (!connected) {
      alert('Please connect your wallet first');
      return;
    }

    const requiredTokens = getRequiredTokens(amount);
    const tokenDisplay = requiredTokens ? formatTokenAmount(requiredTokens) : '...';

    setState(prev => ({
      ...prev,
      selectedPackage: amount,
      statusMessage: `Selected: ${amount} credits (~${tokenDisplay} ${TOKEN_CONFIG.symbol})`
    }));
  };

  // Helper to process transaction result
  const processTransactionResult = async (signature, walletAddress, packageAmount) => {
    try {
      setState(prev => ({
        ...prev,
        statusMessage: `⏳ Verifying ${TOKEN_CONFIG.symbol} payment on Solana...`,
        lastTransaction: signature,
        pendingTxHash: signature,
      }));

      // Verify payment via backend
      const verifyResult = await verifyPaymentOnChain(signature, walletAddress, packageAmount);

      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'Payment verification failed');
      }

      localStorage.removeItem('lumexia-pending-tx');

      setState(prev => ({
        ...prev,
        credits: verifyResult.credits,
        isProcessing: false,
        selectedPackage: null,
        pendingTxHash: null,
        statusMessage: `✅ Payment successful! +${packageAmount} credits`
      }));

      const requiredTokens = getRequiredTokens(packageAmount);
      alert(
        `✅ Payment Successful!\n\n` +
        `${TOKEN_CONFIG.symbol} Paid: ~${formatTokenAmount(requiredTokens || 0)} ${TOKEN_CONFIG.symbol}\n` +
        `Credits added: ${packageAmount}\n` +
        `New balance: ${verifyResult.credits} credits\n\n` +
        `View transaction:\n${getExplorerUrl(signature)}\n\n` +
        `Click "START GAME" to begin racing!`
      );

      // Refresh balances after payment
      if (publicKey) {
        try {
          const solBalanceRaw = await connection.getBalance(publicKey);
          setSolBalance(solBalanceRaw / LAMPORTS_PER_SOL);

          const tokenBal = await getTokenBalance(publicKey, connection);
          setTokenBalance(tokenBal);
        } catch (error) {
          console.error('[UI] Error refreshing balances after payment:', error);
        }
      }

    } catch (error) {
      console.error('❌ Processing failed:', error);

      const isTimeoutError = error.message?.includes('timed out') ||
                             error.message?.includes('still be processing');

      setState(prev => ({
        ...prev,
        isProcessing: false,
        pendingTxHash: isTimeoutError ? prev.pendingTxHash : null,
        statusMessage: `❌ ${error.message}`
      }));

      if (!isTimeoutError) {
        localStorage.removeItem('lumexia-pending-tx');
      }

      alert(
        `❌ Payment Processing Failed\n\n${error.message}\n\n` +
        (isTimeoutError
          ? 'Your transaction may still be processing. Use the "Check Status" button to verify.'
          : 'Please try again.')
      );
    }
  };

  // Check specific pending transaction
  const checkPendingTransaction = async (signature) => {
    if (!signature || !state.selectedPackage) return;
    if (state.isProcessing) return;
    await processTransactionResult(signature, publicKey?.toString(), state.selectedPackage);
  };

  // Purchase Handler
  const handlePurchaseAndStart = async () => {
    if (!state.selectedPackage) {
      alert('Please select a ticket first');
      return;
    }

    if (!connected || !publicKey) {
      alert('Please connect wallet first');
      return;
    }

    const packageAmount = state.selectedPackage;

    // Check balance
    try {
      const balanceCheck = await checkPaymentBalance(publicKey, packageAmount);

      if (!balanceCheck.hasEnoughTokens) {
        alert(
          `❌ Insufficient ${TOKEN_CONFIG.symbol}!\n\n` +
          `Required: ~${formatTokenAmount(balanceCheck.requiredTokens)} ${TOKEN_CONFIG.symbol} ($${packageAmount})\n` +
          `Your balance: ${formatTokenAmount(balanceCheck.tokenBalance)} ${TOKEN_CONFIG.symbol}\n\n` +
          `Please add more ${TOKEN_CONFIG.symbol} tokens to your wallet.`
        );
        return;
      }

      if (!balanceCheck.hasEnoughSol) {
        alert(
          `❌ Insufficient SOL for transaction fees!\n\n` +
          `Required: ${balanceCheck.minSolRequired} SOL\n` +
          `Your balance: ${balanceCheck.solBalance.toFixed(4)} SOL\n\n` +
          `Please add some SOL for transaction fees.`
        );
        return;
      }
    } catch (error) {
      console.error('Balance check failed:', error);
      alert(`❌ Failed to check balance: ${error.message}`);
      return;
    }

    if (state.isProcessing) return;

    const isMobile = isMobileDevice();

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        statusMessage: isMobile
          ? `⏳ Opening wallet... Confirm ${TOKEN_CONFIG.symbol} transfer`
          : `⏳ Opening wallet... Please confirm ${TOKEN_CONFIG.symbol} transfer`
      }));

      // Transfer payment tokens
      const { signature } = await transferToken(
        walletAdapter,
        packageAmount
      );

      setState(prev => ({
        ...prev,
        pendingTxHash: signature,
        lastTransaction: signature,
        statusMessage: isMobile
          ? '⏳ Transaction sent! Confirming...'
          : `⏳ ${TOKEN_CONFIG.symbol} transfer sent! Waiting for confirmation...`
      }));

      await processTransactionResult(signature, publicKey.toString(), packageAmount);

    } catch (error) {
      console.error('❌ Payment initiation failed:', error);

      let errorMessage = 'Payment failed';

      if (error.message?.includes('rejected') || error.message?.includes('cancelled') || error.message?.includes('User rejected')) {
        errorMessage = 'Transaction cancelled by user';
      } else if (error.message?.includes('Insufficient')) {
        errorMessage = error.message;
      } else {
        errorMessage = error.message || 'Unknown error occurred';
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        pendingTxHash: null,
        statusMessage: `❌ ${errorMessage}`
      }));

      localStorage.removeItem('lumexia-pending-tx');
      alert(`❌ Payment Failed\n\n${errorMessage}`);
    }
  };

  // Verify payment via Supabase Edge Function
  const verifyPaymentOnChain = async (transactionSignature, userAddress, packageAmount, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              transactionSignature,
              userAddress,
              packageAmount,
              blockchain: 'solana'
            }),
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Verification failed');
        }

        return await response.json();
      } catch (error) {
        const isRetryable = error.name === 'AbortError' ||
                           error.message.includes('Load failed') ||
                           error.message.includes('network');

        if (isRetryable && attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        return { success: false, error: error.message };
      }
    }

    return { success: false, error: 'Verification failed after multiple attempts' };
  };

  // Accept Agreement Handler
  const handleAcceptAgreement = () => {
    if (!agreementChecked) {
      alert('Please check the checkbox to accept the Terms & Conditions');
      return;
    }
    setAgreementAccepted(true);
  };

  // Start game with existing credits
  const handleStartGameWithCredits = () => {
    if (!connected || !publicKey) {
      alert('Please connect wallet first');
      return;
    }

    const requiredCredits = state.gameMode === 'doubleOrNothing' ? 2 : 1;

    if (state.credits < requiredCredits) {
      if (state.gameMode === 'doubleOrNothing') {
        alert('⚠️ Double or Nothing requires 2 credits!\n\nYou need at least 2 credits to play this mode.');
      } else {
        alert('You need at least 1 credit to start the game. Please purchase credits first.');
      }
      return;
    }

    onStartGame({
      walletAddress: publicKey.toString(),
      credits: state.credits,
      gameMode: state.gameMode
    });
  };

  // ==================== AGREEMENT SCREEN ====================
  if (!agreementAccepted) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: `linear-gradient(180deg, ${SOLANA_COLORS.bgPrimary} 0%, ${SOLANA_COLORS.bgSecondary} 100%)`,
        overflowY: 'auto',
        zIndex: 9999
      }}>
        {/* Ambient glow effects */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          left: '-10%',
          width: '50%',
          height: '50%',
          background: `radial-gradient(circle, ${SOLANA_COLORS.glowPurple} 0%, transparent 70%)`,
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-20%',
          right: '-10%',
          width: '50%',
          height: '50%',
          background: `radial-gradient(circle, ${SOLANA_COLORS.glowGreen} 0%, transparent 70%)`,
          filter: 'blur(80px)',
          pointerEvents: 'none'
        }} />

        {/* Logo */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 10
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: `linear-gradient(135deg, ${SOLANA_COLORS.purple} 0%, ${SOLANA_COLORS.green} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 20px ${SOLANA_COLORS.glowPurple}`
          }}>
            <span style={{ fontSize: '24px' }}>⚡</span>
          </div>
          <div>
            <p style={{
              color: SOLANA_COLORS.textPrimary,
              fontSize: '18px',
              fontWeight: '700',
              margin: 0,
              letterSpacing: '3px'
            }}>
              LUMEXIA
            </p>
            <p style={{
              color: SOLANA_COLORS.green,
              fontSize: '11px',
              margin: 0,
              fontWeight: '500'
            }}>
              Powered by Solana
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '90px 20px 40px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '720px',
            background: `linear-gradient(180deg, ${SOLANA_COLORS.bgCard} 0%, ${SOLANA_COLORS.bgSecondary} 100%)`,
            borderRadius: '24px',
            border: `1px solid ${SOLANA_COLORS.borderPurple}`,
            padding: '32px',
            boxShadow: `0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px ${SOLANA_COLORS.glowPurple}`,
            backdropFilter: 'blur(20px)'
          }}>
            {/* Title */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: '24px'
            }}>
              <span style={{ fontSize: '24px' }}>🛡️</span>
              <h2 style={{
                background: `linear-gradient(90deg, ${SOLANA_COLORS.purple}, ${SOLANA_COLORS.green})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontSize: '20px',
                fontWeight: '700',
                margin: 0,
                letterSpacing: '1px'
              }}>
                GAMEPLAY AGREEMENT
              </h2>
            </div>

            {/* Scrollable Agreement Text */}
            <div style={{
              height: '340px',
              overflowY: 'auto',
              background: SOLANA_COLORS.bgPrimary,
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              border: `1px solid ${SOLANA_COLORS.borderPurple}`
            }}>
              <pre style={{
                color: SOLANA_COLORS.textSecondary,
                fontSize: '13px',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Inter, -apple-system, sans-serif',
                margin: 0
              }}>
                {AGREEMENT_TEXT}
              </pre>
            </div>

            {/* Checkbox and Accept Button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '20px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                color: SOLANA_COLORS.textSecondary,
                fontSize: '14px'
              }}>
                <div
                  onClick={() => setAgreementChecked(!agreementChecked)}
                  style={{
                    width: '26px',
                    height: '26px',
                    border: `2px solid ${agreementChecked ? SOLANA_COLORS.green : SOLANA_COLORS.purple}`,
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: agreementChecked
                      ? `linear-gradient(135deg, ${SOLANA_COLORS.green}, ${SOLANA_COLORS.greenDark})`
                      : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: agreementChecked ? `0 0 15px ${SOLANA_COLORS.glowGreen}` : 'none'
                  }}
                >
                  {agreementChecked && <span style={{ color: '#000', fontSize: '16px', fontWeight: 'bold' }}>✓</span>}
                </div>
                <span>I have read and accept the Terms & Conditions</span>
              </label>

              <button
                onClick={handleAcceptAgreement}
                disabled={!agreementChecked}
                style={{
                  padding: '14px 36px',
                  background: agreementChecked
                    ? `linear-gradient(135deg, ${SOLANA_COLORS.purple} 0%, ${SOLANA_COLORS.green} 100%)`
                    : SOLANA_COLORS.bgCardHover,
                  border: 'none',
                  borderRadius: '12px',
                  color: agreementChecked ? '#fff' : SOLANA_COLORS.textMuted,
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: agreementChecked ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  boxShadow: agreementChecked ? `0 4px 25px ${SOLANA_COLORS.glowPurple}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                CONTINUE
                <span style={{ fontSize: '16px' }}>→</span>
              </button>
            </div>
          </div>

          {/* Network indicator */}
          <div style={{
            marginTop: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: SOLANA_COLORS.green,
              boxShadow: `0 0 10px ${SOLANA_COLORS.green}`,
              animation: 'pulse 2s infinite'
            }} />
            <span style={{ color: SOLANA_COLORS.textMuted, fontSize: '12px' }}>
              Solana Mainnet
            </span>
          </div>
        </div>

        {/* Custom Scrollbar Styles */}
        <style>{`
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: ${SOLANA_COLORS.bgPrimary}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, ${SOLANA_COLORS.purple}, ${SOLANA_COLORS.green});
            border-radius: 3px;
          }
          ::-webkit-scrollbar-thumb:hover { opacity: 0.8; }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // ==================== MAIN LAUNCHER UI ====================
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#080612',
      overflowY: 'auto',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Ambient glow - top */}
      <div style={{
        position: 'fixed',
        top: '-5%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        height: '50%',
        background: 'radial-gradient(circle, rgba(100,50,220,0.2) 0%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '28px 16px 80px',
        position: 'relative',
        zIndex: 1,
        maxWidth: '480px',
        margin: '0 auto',
        width: '100%',
      }}>
        {/* Card wrapper with border */}
        <div style={{
          background: `linear-gradient(180deg, ${SOLANA_COLORS.bgCard} 0%, ${SOLANA_COLORS.bgSecondary} 100%)`,
          borderRadius: '24px',
          border: `1px solid ${SOLANA_COLORS.borderPurple}`,
          padding: '24px',
          boxShadow: `0 25px 80px rgba(0, 0, 0, 0.5), 0 0 40px ${SOLANA_COLORS.glowPurple}`,
          backdropFilter: 'blur(20px)',
        }}>
        {/* Connect Wallet Button */}
        <button
          onClick={handleConnectClick}
          disabled={connecting}
          style={{
            width: '100%',
            padding: '18px 20px',
            marginBottom: '14px',
            background: connected
              ? 'rgba(20,241,149,0.06)'
              : 'rgba(12,8,30,0.9)',
            border: connected
              ? '1px solid rgba(20,241,149,0.5)'
              : '1px solid rgba(110,65,255,0.7)',
            borderRadius: '16px',
            color: '#fff',
            fontSize: '16px',
            fontWeight: '700',
            cursor: connecting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            boxShadow: connected
              ? '0 0 20px rgba(20,241,149,0.15)'
              : '0 0 28px rgba(110,65,255,0.35), 0 4px 20px rgba(0,0,0,0.5)',
            transition: 'all 0.3s ease',
            letterSpacing: '0.5px',
          }}
        >
          {connecting ? (
            <>
              <span style={{ animation: 'spin 1s linear infinite', fontSize: '18px' }}>⏳</span>
              Connecting...
            </>
          ) : connected ? (
            <>
              <span style={{ fontSize: '20px' }}>✓</span>
              {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
            </>
          ) : (
            <>
              <span style={{ fontSize: '22px' }}>👛</span>
              Connect Wallet
            </>
          )}
        </button>

        {/* Wallet hint */}
        {!connected && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '28px',
            padding: '0 4px',
          }}>
            <span style={{ fontSize: '15px', lineHeight: '1.4', marginTop: '1px' }}>💡</span>
            <p style={{ color: '#8B8B9A', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
              Connect with Phantom, Solflare, Backpack or other Solana wallets.
            </p>
          </div>
        )}

        {/* Connected status badge */}
        {connected && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            padding: '0 4px',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: SOLANA_COLORS.green,
              boxShadow: `0 0 8px ${SOLANA_COLORS.green}`,
              animation: 'pulse 2s infinite',
            }} />
            <span style={{ color: SOLANA_COLORS.green, fontSize: '13px', fontWeight: '500' }}>
              Connected • {state.credits} credit{state.credits !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Game Mode Selection (connected only) */}
        {connected && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <span style={{ fontSize: '16px' }}>🎮</span>
              <h3 style={{
                color: SOLANA_COLORS.textPrimary,
                fontSize: '13px',
                fontWeight: '700',
                margin: 0,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}>
                SELECT GAME MODE
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                onClick={() => !state.isProcessing && setState(prev => ({ ...prev, gameMode: 'classic' }))}
                style={{
                  padding: '16px 10px',
                  background: state.gameMode === 'classic'
                    ? 'linear-gradient(135deg, rgba(20,241,149,0.12), rgba(20,241,149,0.04))'
                    : 'rgba(15,10,35,0.9)',
                  border: state.gameMode === 'classic'
                    ? '1px solid rgba(20,241,149,0.5)'
                    : '1px solid rgba(100,60,200,0.25)',
                  borderRadius: '14px',
                  cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  opacity: state.isProcessing ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  boxShadow: state.gameMode === 'classic' ? '0 0 15px rgba(20,241,149,0.2)' : 'none',
                }}
              >
                <div style={{ fontSize: '26px', marginBottom: '8px' }}>🏎️</div>
                <p style={{ color: SOLANA_COLORS.textPrimary, fontSize: '12px', fontWeight: '700', marginBottom: '4px', letterSpacing: '0.5px' }}>CLASSIC RACE</p>
                <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '10px', marginBottom: '6px' }}>Normal scoring</p>
                <p style={{ color: SOLANA_COLORS.green, fontSize: '11px', fontWeight: '700' }}>1 Credit</p>
                {state.gameMode === 'classic' && (
                  <p style={{ color: SOLANA_COLORS.green, fontSize: '10px', marginTop: '4px', fontWeight: '600' }}>✓ Selected</p>
                )}
              </div>
              <div
                onClick={() => !state.isProcessing && setState(prev => ({ ...prev, gameMode: 'doubleOrNothing' }))}
                style={{
                  padding: '16px 10px',
                  background: state.gameMode === 'doubleOrNothing'
                    ? 'linear-gradient(135deg, rgba(251,146,60,0.12), rgba(251,146,60,0.04))'
                    : 'rgba(15,10,35,0.9)',
                  border: state.gameMode === 'doubleOrNothing'
                    ? '1px solid rgba(251,146,60,0.5)'
                    : '1px solid rgba(100,60,200,0.25)',
                  borderRadius: '14px',
                  cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  opacity: state.isProcessing ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  boxShadow: state.gameMode === 'doubleOrNothing' ? '0 0 15px rgba(251,146,60,0.2)' : 'none',
                }}
              >
                <div style={{ fontSize: '26px', marginBottom: '8px' }}>🎰</div>
                <p style={{ color: SOLANA_COLORS.textPrimary, fontSize: '12px', fontWeight: '700', marginBottom: '4px', letterSpacing: '0.5px' }}>DOUBLE OR NOTHING</p>
                <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '10px', marginBottom: '6px' }}>2X or 0!</p>
                <p style={{ color: SOLANA_COLORS.warning, fontSize: '11px', fontWeight: '700' }}>2 Credits</p>
                {state.gameMode === 'doubleOrNothing' && (
                  <p style={{ color: SOLANA_COLORS.warning, fontSize: '10px', marginTop: '4px', fontWeight: '600' }}>✓ Selected</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Balance Display (connected only) */}
        {connected && (
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: 'rgba(12,8,28,0.8)',
            border: '1px solid rgba(100,60,200,0.2)',
            borderRadius: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <span style={{ fontSize: '16px' }}>💰</span>
              <h3 style={{
                color: SOLANA_COLORS.textPrimary,
                fontSize: '13px',
                fontWeight: '700',
                margin: 0,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}>
                YOUR BALANCE
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div style={{
                padding: '12px 8px',
                background: 'rgba(153,69,255,0.08)',
                border: '1px solid rgba(153,69,255,0.2)',
                borderRadius: '12px',
                textAlign: 'center',
              }}>
                <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '10px', marginBottom: '6px' }}>Credits</p>
                <p style={{
                  background: 'linear-gradient(90deg, #9945FF, #14F195)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontSize: '22px',
                  fontWeight: '800',
                  margin: 0,
                }}>{state.credits}</p>
              </div>
              <div style={{
                padding: '12px 8px',
                background: 'rgba(20,241,149,0.06)',
                border: tokenBalanceError
                  ? `1px solid ${SOLANA_COLORS.warning}`
                  : '1px solid rgba(20,241,149,0.15)',
                borderRadius: '12px',
                textAlign: 'center',
              }}>
                <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '10px', marginBottom: '6px' }}>{TOKEN_CONFIG.symbol}</p>
                <p style={{ color: SOLANA_COLORS.green, fontSize: '13px', fontWeight: '700', margin: 0 }}>
                  {formatTokenAmount(tokenBalance)}
                </p>
                {tokenBalanceError && (
                  <button
                    type="button"
                    onClick={() => setBalanceRefreshKey((k) => k + 1)}
                    title={tokenBalanceError}
                    style={{
                      marginTop: '6px',
                      background: 'transparent',
                      border: `1px solid ${SOLANA_COLORS.warning}`,
                      borderRadius: '8px',
                      color: SOLANA_COLORS.warning,
                      fontSize: '10px',
                      padding: '3px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    ↻ retry
                  </button>
                )}
              </div>
              <div style={{
                padding: '12px 8px',
                background: 'rgba(153,69,255,0.06)',
                border: '1px solid rgba(153,69,255,0.15)',
                borderRadius: '12px',
                textAlign: 'center',
              }}>
                <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '10px', marginBottom: '6px' }}>SOL</p>
                <p style={{ color: SOLANA_COLORS.purple, fontSize: '13px', fontWeight: '700', margin: 0 }}>
                  {solBalance.toFixed(3)}
                </p>
              </div>
            </div>
            {tokenPrice && (
              <p style={{ color: SOLANA_COLORS.textMuted, fontSize: '11px', textAlign: 'center', marginTop: '10px', marginBottom: 0 }}>
                {TOKEN_CONFIG.symbol}: {formatPrice(tokenPrice)} {priceLoading && '(updating...)'}
              </p>
            )}
          </div>
        )}

        {/* BUY CREDITS Section */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '14px',
          }}>
            <span style={{ fontSize: '16px' }}>💎</span>
            <h3 style={{
              color: SOLANA_COLORS.textPrimary,
              fontSize: '13px',
              fontWeight: '700',
              margin: 0,
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}>
              BUY CREDITS
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[1, 5, 10].map((amount) => {
              const requiredTokens = getRequiredTokens(amount);
              const isSelected = state.selectedPackage === amount;
              return (
                <div
                  key={amount}
                  onClick={() => !state.isProcessing && connected && handleSelectTicket(amount)}
                  style={{
                    padding: '18px 10px',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(110,65,255,0.22), rgba(90,45,210,0.14))'
                      : 'rgba(12,8,28,0.9)',
                    border: isSelected
                      ? '1px solid rgba(110,65,255,0.8)'
                      : '1px solid rgba(100,60,200,0.3)',
                    borderRadius: '16px',
                    cursor: (!connected || state.isProcessing) ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: (!connected || state.isProcessing) ? 0.5 : 1,
                    transition: 'all 0.3s ease',
                    boxShadow: isSelected
                      ? '0 0 20px rgba(110,65,255,0.3)'
                      : '0 4px 15px rgba(0,0,0,0.3)',
                  }}
                >
                  <p style={{
                    color: '#fff',
                    fontSize: '28px',
                    fontWeight: '800',
                    margin: '0 0 2px',
                    lineHeight: 1,
                  }}>
                    {amount}
                  </p>
                  <p style={{
                    color: '#9090A8',
                    fontSize: '10px',
                    fontWeight: '600',
                    margin: '0 0 10px',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}>
                    credit{amount > 1 ? 's' : ''}
                  </p>
                  <p style={{
                    color: '#14F195',
                    fontSize: '15px',
                    fontWeight: '700',
                    margin: '0 0 5px',
                  }}>
                    ${amount}
                  </p>
                  <p style={{
                    color: '#6A6A80',
                    fontSize: '10px',
                    margin: 0,
                    lineHeight: 1.3,
                  }}>
                    ~{requiredTokens ? formatTokenAmount(requiredTokens) : '...'} {TOKEN_CONFIG.symbol}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending Transaction */}
        {state.pendingTxHash && (
          <div style={{
            marginBottom: '16px',
            padding: '16px',
            background: 'rgba(251,146,60,0.08)',
            border: '1px solid rgba(251,146,60,0.3)',
            borderRadius: '14px',
            textAlign: 'center',
          }}>
            <p style={{ color: SOLANA_COLORS.warning, fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
              {state.isProcessing ? '⏳ Waiting for confirmation...' : '⚠️ Pending transaction'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.open(getExplorerUrl(state.pendingTxHash), '_blank')}
                style={{
                  padding: '10px 18px',
                  background: 'linear-gradient(135deg, #9945FF, #7B2FE0)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                View on Solscan
              </button>
              <button
                onClick={() => {
                  setState(prev => ({ ...prev, isProcessing: true }));
                  checkPendingTransaction(state.pendingTxHash);
                }}
                disabled={state.isProcessing}
                style={{
                  padding: '10px 18px',
                  background: state.isProcessing ? 'rgba(30,25,55,0.8)' : SOLANA_COLORS.warning,
                  border: 'none',
                  borderRadius: '10px',
                  color: state.isProcessing ? SOLANA_COLORS.textMuted : '#000',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                }}
              >
                Check Status
              </button>
            </div>
          </div>
        )}

        {/* START GAME Button */}
        {connected && state.credits > 0 && (
          <button
            onClick={handleStartGameWithCredits}
            disabled={state.isProcessing}
            style={{
              width: '100%',
              padding: '18px',
              marginBottom: '12px',
              borderRadius: '14px',
              border: 'none',
              fontSize: '17px',
              fontWeight: '700',
              cursor: state.isProcessing ? 'not-allowed' : 'pointer',
              background: state.isProcessing
                ? 'rgba(15,12,35,0.8)'
                : 'linear-gradient(135deg, #14F195, #0BC47D)',
              color: state.isProcessing ? SOLANA_COLORS.textMuted : '#000',
              boxShadow: state.isProcessing ? 'none' : '0 0 30px rgba(20,241,149,0.35)',
              transition: 'all 0.3s ease',
              letterSpacing: '1px',
            }}
          >
            {state.isProcessing ? '⏳ Processing...' : '▶ START GAME'}
          </button>
        )}

        {/* Main Action Button */}
        <button
          onClick={connected ? handlePurchaseAndStart : handleConnectClick}
          disabled={!connected || !state.selectedPackage || state.isProcessing}
          style={{
            width: '100%',
            padding: '18px',
            marginBottom: '16px',
            borderRadius: '14px',
            border: '1px solid transparent',
            fontSize: '15px',
            fontWeight: '700',
            cursor: (!connected || !state.selectedPackage || state.isProcessing) ? 'not-allowed' : 'pointer',
            background: (!connected || !state.selectedPackage || state.isProcessing)
              ? 'rgba(25,20,48,0.9)'
              : 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
            color: (!connected || !state.selectedPackage || state.isProcessing) ? '#5A5A6A' : '#fff',
            transition: 'all 0.3s ease',
            boxShadow: (!connected || !state.selectedPackage || state.isProcessing)
              ? 'none'
              : '0 4px 25px rgba(153,69,255,0.4)',
            letterSpacing: '0.5px',
          }}
        >
          {state.isProcessing ? '⏳ Processing...'
            : !connected ? 'Connect Wallet First'
            : !state.selectedPackage ? 'Select a Package'
            : `Purchase Credits with ${TOKEN_CONFIG.symbol}`}
        </button>

        {/* Status message */}
        <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '12px', textAlign: 'center', marginBottom: '20px' }}>
          {state.statusMessage}
        </p>

        {/* How to start game */}
        <div style={{
          padding: '18px',
          background: 'rgba(10,7,24,0.7)',
          border: '1px solid rgba(100,60,200,0.2)',
          borderRadius: '16px',
        }}>
          <p style={{
            color: SOLANA_COLORS.textPrimary,
            fontSize: '13px',
            fontWeight: '600',
            margin: '0 0 14px',
          }}>
            How to start game:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: '◎', text: 'Connect your Solana wallet (Phantom/Solflare)', color: '#9945FF' },
              { icon: '🎮', text: 'Select game mode', color: '#14F195' },
              { icon: '🛒', text: `Purchase credits with ${TOKEN_CONFIG.symbol} tokens`, color: '#14F195' },
              { icon: '🏎️', text: 'Start racing!', color: '#14F195' },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '16px',
                  color: step.color,
                  minWidth: '22px',
                  textAlign: 'center',
                }}>
                  {step.icon}
                </span>
                <span style={{ color: '#8B8B9A', fontSize: '13px', lineHeight: '1.4' }}>
                  {step.text}
                </span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(100,60,200,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{ fontSize: '14px' }}>🔒</span>
            <span style={{ color: '#5A5A6A', fontSize: '12px' }}>
              Payments are made with {TOKEN_CONFIG.symbol} tokens (Solana)
            </span>
          </div>
        </div>
        </div> {/* end card wrapper */}
      </div>

      {/* Bottom Navigation Bar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: 'rgba(6,4,16,0.97)',
        borderTop: '1px solid rgba(100,60,200,0.15)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {[
          { symbol: '◂', active: false },
          { symbol: '✏', active: false },
          { symbol: '☜', active: false },
          { symbol: '⊕', active: true },
          { symbol: '⊞', active: false },
        ].map((item, i) => (
          <button
            key={i}
            style={{
              background: 'none',
              border: 'none',
              color: item.active ? '#9945FF' : '#3A3A5A',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '10px 16px',
              transition: 'color 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.symbol}
          </button>
        ))}
      </div>

      {/* Wallet Selection Modal */}
      {walletModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px'
          }}
          onClick={() => setWalletModalOpen(false)}
        >
          <div
            style={{
              background: `linear-gradient(180deg, ${SOLANA_COLORS.bgCard} 0%, ${SOLANA_COLORS.bgSecondary} 100%)`,
              borderRadius: '20px',
              border: `1px solid ${SOLANA_COLORS.borderPurple}`,
              padding: '28px',
              maxWidth: '420px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: `0 25px 80px rgba(0, 0, 0, 0.5), 0 0 40px ${SOLANA_COLORS.glowPurple}`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <h3 style={{
                color: SOLANA_COLORS.textPrimary,
                fontSize: '20px',
                fontWeight: '700',
                margin: 0,
                letterSpacing: '1px'
              }}>
                SELECT WALLET
              </h3>
              <button
                onClick={() => setWalletModalOpen(false)}
                style={{
                  background: SOLANA_COLORS.bgCardHover,
                  border: `1px solid ${SOLANA_COLORS.borderPurple}`,
                  color: SOLANA_COLORS.textSecondary,
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  lineHeight: 1,
                  transition: 'all 0.2s ease'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(walletModalConfig?.wallets || wallets || []).map((wallet) => (
                <button
                  key={wallet.adapter.name}
                  onClick={() => handleWalletSelect(wallet.adapter.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '16px 18px',
                    background: SOLANA_COLORS.bgCardHover,
                    border: `1px solid ${SOLANA_COLORS.borderPurple}`,
                    borderRadius: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    width: '100%'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = `rgba(153, 69, 255, 0.15)`;
                    e.currentTarget.style.borderColor = SOLANA_COLORS.purple;
                    e.currentTarget.style.boxShadow = `0 0 20px ${SOLANA_COLORS.glowPurple}`;
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = SOLANA_COLORS.bgCardHover;
                    e.currentTarget.style.borderColor = SOLANA_COLORS.borderPurple;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {wallet.adapter.icon && (
                    <img
                      src={wallet.adapter.icon}
                      alt={wallet.adapter.name}
                      style={{ width: '36px', height: '36px', borderRadius: '10px' }}
                    />
                  )}
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <p style={{ color: SOLANA_COLORS.textPrimary, fontSize: '15px', fontWeight: '600', margin: 0 }}>
                      {wallet.adapter.name}
                    </p>
                    {wallet.readyState === 'Installed' && (
                      <p style={{ color: SOLANA_COLORS.green, fontSize: '11px', margin: '4px 0 0 0', fontWeight: '500' }}>
                        ✓ Detected
                      </p>
                    )}
                  </div>
                  <span style={{ color: SOLANA_COLORS.purple, fontSize: '20px' }}>→</span>
                </button>
              ))}
            </div>

            <p style={{
              color: SOLANA_COLORS.textMuted,
              fontSize: '12px',
              textAlign: 'center',
              marginTop: '20px'
            }}>
              New to Solana?{' '}
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: SOLANA_COLORS.purple, fontWeight: '500' }}
              >
                Get Phantom Wallet
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Custom Scrollbar + Animations */}
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #9945FF, #14F195);
          border-radius: 4px;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

};

export default RealLauncherUI;
