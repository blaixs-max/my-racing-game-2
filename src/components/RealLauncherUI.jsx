import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletMultiButton } from '@solana/wallet-adapter-base-ui';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getCoalBalance,
  checkPaymentBalance,
  transferCoalToken,
  formatAddress,
  getExplorerUrl,
  isMobileDevice
} from '../utils/solanaWallet';
import { getCoalPrice, calculateCoalAmount, formatPrice } from '../utils/jupiterPrice';
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

// Agreement Text Content - Updated for OILTOWN Token
const AGREEMENT_TEXT = `Lumexia: Gameplay Participation Agreement & Risk Disclosure

IMPORTANT: Please read the following terms carefully before participating in the Lumexia Racing Module. By clicking "ACCEPT", you acknowledge that you have read, understood, and agreed to be bound by these terms.

1. Nature of the Game (Game of Skill)
You acknowledge that the Lumexia Racing Module is a Game of Skill, not a game of chance or gambling. Your ranking on the leaderboard and eligibility for rewards are determined solely by your gameplay performance, reflexes, and strategy. The "Score" you achieve is the defining metric for reward distribution.

2. Entry Fees and OILTOWN Token Usage
To participate, users utilize OILTOWN tokens (on Solana blockchain) to acquire game credits (Jetons). You understand that this transaction is final and non-refundable. The OILTOWN tokens collected form the "Reward Pool" for the daily cycle.

3. Reward Distribution & Deductions
The Reward Pool is distributed daily to the top 100 players based on their final scores. You explicitly agree to the following allocation of funds:

Prize Pool: The majority of the pool is distributed to the winners via an automated algorithm.

Operational Fee: A fixed deduction of 7.5% is taken from the total pool prior to distribution. This fee is allocated for Marketing activities and Weekly Token Burns to support the Lumexia ecosystem.

4. No Guarantee of Winnings
Participation does not guarantee a reward. If you do not rank within the top 100 players by the end of the daily cycle, you will not receive a share of the OILTOWN pool for that specific session. You acknowledge the risk of financial loss associated with gameplay.

5. Cryptocurrency Risks
You acknowledge that the value of OILTOWN token and SOL can fluctuate significantly. Lumexia is not responsible for any value loss due to market volatility, blockchain network errors, or wallet security breaches on the user's end.

6. Legal Compliance
You represent and warrant that you are of legal age and that participating in skill-based crypto gaming is legal in your local jurisdiction. It is your sole responsibility to comply with the laws of your country of residence.

7. Automated Execution
Reward distributions are executed by smart contracts/automated algorithms. These transactions are irreversible. By playing, you accept the calculated results as final.`;

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
  const [coalBalance, setCoalBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [coalPrice, setCoalPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);

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

  // Fetch OILTOWN price periodically
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        setPriceLoading(true);
        const price = await getCoalPrice();
        setCoalPrice(price);
      } catch (error) {
        console.error('Failed to fetch OILTOWN price:', error);
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
        setCoalBalance(0);
        setSolBalance(0);
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
        setSolBalance(0);
      }

      try {
        console.log('[UI] Fetching OILTOWN balance...');
        const coalBal = await getCoalBalance(publicKey, connection);
        console.log('[UI] OILTOWN balance:', coalBal);
        setCoalBalance(coalBal);
      } catch (error) {
        console.error('[UI] OILTOWN balance error:', error);
        setCoalBalance(0);
      }
    };

    fetchBalances();
    const interval = connected ? setInterval(fetchBalances, 15000) : null;
    return () => interval && clearInterval(interval);
  }, [connected, publicKey, connection]);

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
          const coalBal = await getCoalBalance(publicKey, connection);
          setCoalBalance(coalBal);
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

  // Calculate required OILTOWN for package
  const getRequiredCoal = (usdAmount) => {
    if (!coalPrice || coalPrice <= 0) return null;
    return usdAmount / coalPrice;
  };

  // Ticket Selection Handler
  const handleSelectTicket = (amount) => {
    if (!connected) {
      alert('Please connect your wallet first');
      return;
    }

    const requiredCoal = getRequiredCoal(amount);
    const coalDisplay = requiredCoal ? formatTokenAmount(requiredCoal) : '...';

    setState(prev => ({
      ...prev,
      selectedPackage: amount,
      statusMessage: `Selected: ${amount} credits (~${coalDisplay} OILTOWN)`
    }));
  };

  // Helper to process transaction result
  const processTransactionResult = async (signature, walletAddress, packageAmount) => {
    try {
      setState(prev => ({
        ...prev,
        statusMessage: '⏳ Verifying OILTOWN payment on Solana...',
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

      const requiredCoal = getRequiredCoal(packageAmount);
      alert(
        `✅ Payment Successful!\n\n` +
        `OILTOWN Paid: ~${formatTokenAmount(requiredCoal || 0)} OIL\n` +
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

          const coalBal = await getCoalBalance(publicKey, connection);
          setCoalBalance(coalBal);
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

      if (!balanceCheck.hasEnoughCoal) {
        alert(
          `❌ Insufficient OILTOWN!\n\n` +
          `Required: ~${formatTokenAmount(balanceCheck.requiredCoal)} OIL ($${packageAmount})\n` +
          `Your balance: ${formatTokenAmount(balanceCheck.coalBalance)} OIL\n\n` +
          `Please add more OILTOWN tokens to your wallet.`
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
          ? '⏳ Opening wallet... Confirm OILTOWN transfer'
          : '⏳ Opening wallet... Please confirm OILTOWN transfer'
      }));

      // Transfer OILTOWN tokens
      const { signature, coalAmount, price } = await transferCoalToken(
        walletAdapter,
        packageAmount
      );

      setState(prev => ({
        ...prev,
        pendingTxHash: signature,
        lastTransaction: signature,
        statusMessage: isMobile
          ? '⏳ Transaction sent! Confirming...'
          : '⏳ OILTOWN transfer sent! Waiting for confirmation...'
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
      background: `linear-gradient(180deg, ${SOLANA_COLORS.bgPrimary} 0%, ${SOLANA_COLORS.bgSecondary} 100%)`,
      overflowY: 'auto',
      zIndex: 9999
    }}>
      {/* Ambient glow effects */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '-15%',
        width: '40%',
        height: '40%',
        background: `radial-gradient(circle, ${SOLANA_COLORS.glowPurple} 0%, transparent 70%)`,
        filter: 'blur(100px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '-15%',
        width: '40%',
        height: '40%',
        background: `radial-gradient(circle, ${SOLANA_COLORS.glowGreen} 0%, transparent 70%)`,
        filter: 'blur(100px)',
        pointerEvents: 'none'
      }} />

      {/* Main Content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        position: 'relative',
        zIndex: 1
      }}>

        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '32px'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            background: `linear-gradient(135deg, ${SOLANA_COLORS.purple} 0%, ${SOLANA_COLORS.green} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 8px 30px ${SOLANA_COLORS.glowPurple}`
          }}>
            <span style={{ fontSize: '32px' }}>⚡</span>
          </div>
          <div>
            <h1 style={{
              color: SOLANA_COLORS.textPrimary,
              fontSize: '36px',
              fontWeight: '800',
              margin: 0,
              letterSpacing: '4px'
            }}>
              LUMEXIA
            </h1>
            <p style={{
              color: SOLANA_COLORS.green,
              fontSize: '13px',
              margin: 0,
              fontWeight: '500'
            }}>
              $OILTOWN on Solana
            </p>
          </div>
        </div>

        {/* Glassmorphism Card */}
        <div style={{
          width: '100%',
          maxWidth: '440px',
          background: `linear-gradient(180deg, ${SOLANA_COLORS.bgCard} 0%, ${SOLANA_COLORS.bgSecondary} 100%)`,
          borderRadius: '24px',
          border: `1px solid ${SOLANA_COLORS.borderPurple}`,
          padding: '28px',
          boxShadow: `0 25px 80px rgba(0, 0, 0, 0.5), 0 0 40px ${SOLANA_COLORS.glowPurple}`,
          backdropFilter: 'blur(20px)'
        }}>

          {/* Wallet Connect Button */}
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleConnectClick}
              disabled={connecting}
              style={{
                background: connected
                  ? `linear-gradient(135deg, ${SOLANA_COLORS.green}, ${SOLANA_COLORS.greenDark})`
                  : `linear-gradient(135deg, ${SOLANA_COLORS.purple} 0%, ${SOLANA_COLORS.green} 100%)`,
                borderRadius: '14px',
                height: '52px',
                fontSize: '15px',
                fontWeight: '700',
                color: '#fff',
                border: 'none',
                padding: '0 28px',
                cursor: connecting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                minWidth: '200px',
                boxShadow: connected
                  ? `0 4px 20px ${SOLANA_COLORS.glowGreen}`
                  : `0 4px 20px ${SOLANA_COLORS.glowPurple}`,
                transition: 'all 0.3s ease',
                letterSpacing: '0.5px'
              }}
            >
              {connecting ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                  Connecting...
                </>
              ) : connected ? (
                <>
                  <span style={{ fontSize: '16px' }}>✓</span>
                  {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                </>
              ) : (
                <>
                  <span style={{ fontSize: '20px' }}>👛</span>
                  Connect Wallet
                </>
              )}
            </button>
          </div>

          {connecting && (
            <div style={{
              marginBottom: '16px',
              padding: '14px',
              background: `rgba(251, 146, 60, 0.1)`,
              border: `1px solid rgba(251, 146, 60, 0.3)`,
              borderRadius: '12px'
            }}>
              <p style={{ color: SOLANA_COLORS.warning, fontSize: '13px', margin: 0, textAlign: 'center' }}>
                ⏳ Connecting to wallet...
              </p>
            </div>
          )}

          {!connected && !connecting && (
            <div style={{
              marginBottom: '16px',
              padding: '14px',
              background: `${SOLANA_COLORS.borderPurple}`,
              border: `1px solid ${SOLANA_COLORS.borderPurple}`,
              borderRadius: '12px'
            }}>
              <p style={{ color: SOLANA_COLORS.purpleLight, fontSize: '12px', margin: 0, textAlign: 'center' }}>
                💡 Connect with Phantom, Solflare, Backpack or other Solana wallets
              </p>
            </div>
          )}

          {/* Game Mode Selection */}
          {connected && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <span style={{ fontSize: '18px' }}>🎮</span>
                <h3 style={{
                  color: SOLANA_COLORS.textPrimary,
                  fontSize: '15px',
                  fontWeight: '600',
                  margin: 0,
                  letterSpacing: '1px'
                }}>
                  SELECT GAME MODE
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Classic Race */}
                <div
                  onClick={() => !state.isProcessing && setState(prev => ({ ...prev, gameMode: 'classic' }))}
                  style={{
                    padding: '18px 12px',
                    background: state.gameMode === 'classic'
                      ? `linear-gradient(135deg, rgba(20, 241, 149, 0.15), rgba(20, 241, 149, 0.05))`
                      : SOLANA_COLORS.bgCardHover,
                    border: state.gameMode === 'classic'
                      ? `2px solid ${SOLANA_COLORS.green}`
                      : `1px solid ${SOLANA_COLORS.borderPurple}`,
                    borderRadius: '14px',
                    cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: state.isProcessing ? 0.5 : 1,
                    transition: 'all 0.3s ease',
                    boxShadow: state.gameMode === 'classic' ? `0 0 20px ${SOLANA_COLORS.glowGreen}` : 'none'
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '10px' }}>🏎️</div>
                  <p style={{
                    color: SOLANA_COLORS.textPrimary,
                    fontSize: '13px',
                    fontWeight: '700',
                    marginBottom: '6px',
                    letterSpacing: '0.5px'
                  }}>CLASSIC RACE</p>
                  <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '11px', marginBottom: '8px' }}>Normal scoring</p>
                  <p style={{
                    color: SOLANA_COLORS.green,
                    fontSize: '12px',
                    fontWeight: '700'
                  }}>1 Credit</p>
                  {state.gameMode === 'classic' && (
                    <p style={{ color: SOLANA_COLORS.green, fontSize: '11px', marginTop: '6px', fontWeight: '600' }}>✓ Selected</p>
                  )}
                </div>

                {/* Double or Nothing */}
                <div
                  onClick={() => !state.isProcessing && setState(prev => ({ ...prev, gameMode: 'doubleOrNothing' }))}
                  style={{
                    padding: '18px 12px',
                    background: state.gameMode === 'doubleOrNothing'
                      ? `linear-gradient(135deg, rgba(251, 146, 60, 0.15), rgba(251, 146, 60, 0.05))`
                      : SOLANA_COLORS.bgCardHover,
                    border: state.gameMode === 'doubleOrNothing'
                      ? `2px solid ${SOLANA_COLORS.warning}`
                      : `1px solid ${SOLANA_COLORS.borderPurple}`,
                    borderRadius: '14px',
                    cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: state.isProcessing ? 0.5 : 1,
                    transition: 'all 0.3s ease',
                    boxShadow: state.gameMode === 'doubleOrNothing' ? `0 0 20px rgba(251, 146, 60, 0.3)` : 'none'
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '10px' }}>🎰</div>
                  <p style={{
                    color: SOLANA_COLORS.textPrimary,
                    fontSize: '13px',
                    fontWeight: '700',
                    marginBottom: '6px',
                    letterSpacing: '0.5px'
                  }}>DOUBLE OR NOTHING</p>
                  <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '11px', marginBottom: '8px' }}>2X score or 0!</p>
                  <p style={{
                    color: SOLANA_COLORS.warning,
                    fontSize: '12px',
                    fontWeight: '700'
                  }}>2 Credits</p>
                  {state.gameMode === 'doubleOrNothing' && (
                    <p style={{ color: SOLANA_COLORS.warning, fontSize: '11px', marginTop: '6px', fontWeight: '600' }}>✓ Selected</p>
                  )}
                </div>
              </div>

              {/* Game Mode Info */}
              <div style={{
                marginTop: '12px',
                padding: '12px 14px',
                background: state.gameMode === 'classic'
                  ? `rgba(20, 241, 149, 0.08)`
                  : `rgba(251, 146, 60, 0.08)`,
                border: `1px solid ${state.gameMode === 'classic' ? SOLANA_COLORS.borderGreen : 'rgba(251, 146, 60, 0.2)'}`,
                borderRadius: '10px',
                textAlign: 'center'
              }}>
                <p style={{
                  color: state.gameMode === 'classic' ? SOLANA_COLORS.green : SOLANA_COLORS.warning,
                  fontSize: '12px',
                  margin: 0,
                  fontWeight: '500'
                }}>
                  {state.gameMode === 'classic'
                    ? '🏎️ Classic Mode: Your score is saved as normal.'
                    : '🎰 Double or Nothing: Reach Level 5 for 2X score, or score becomes 0!'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Balance Display */}
          {connected && (
            <div style={{
              marginBottom: '24px',
              padding: '20px',
              background: `linear-gradient(135deg, ${SOLANA_COLORS.borderPurple}, ${SOLANA_COLORS.borderGreen})`,
              border: `1px solid ${SOLANA_COLORS.borderPurple}`,
              borderRadius: '16px',
              backdropFilter: 'blur(10px)'
            }}>
              {/* Section Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <span style={{ fontSize: '18px' }}>💰</span>
                <h3 style={{
                  color: SOLANA_COLORS.textPrimary,
                  fontSize: '14px',
                  fontWeight: '600',
                  margin: 0,
                  letterSpacing: '1px'
                }}>
                  YOUR BALANCE
                </h3>
              </div>

              {/* Credits */}
              <div style={{
                textAlign: 'center',
                marginBottom: '16px',
                padding: '16px',
                background: SOLANA_COLORS.bgPrimary,
                borderRadius: '12px',
                border: `1px solid ${SOLANA_COLORS.borderPurple}`
              }}>
                <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '12px', marginBottom: '8px' }}>Game Credits</p>
                <p style={{
                  background: `linear-gradient(90deg, ${SOLANA_COLORS.purple}, ${SOLANA_COLORS.green})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontSize: '36px',
                  fontWeight: '800',
                  margin: '0'
                }}>{state.credits}</p>
              </div>

              {/* Token Balances */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{
                  padding: '14px',
                  background: SOLANA_COLORS.bgPrimary,
                  borderRadius: '12px',
                  textAlign: 'center',
                  border: `1px solid ${SOLANA_COLORS.borderGreen}`
                }}>
                  <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '11px', marginBottom: '6px' }}>OILTOWN Balance</p>
                  <p style={{ color: SOLANA_COLORS.green, fontSize: '16px', fontWeight: '700', margin: 0 }}>
                    {formatTokenAmount(coalBalance)}
                  </p>
                </div>
                <div style={{
                  padding: '14px',
                  background: SOLANA_COLORS.bgPrimary,
                  borderRadius: '12px',
                  textAlign: 'center',
                  border: `1px solid ${SOLANA_COLORS.borderPurple}`
                }}>
                  <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '11px', marginBottom: '6px' }}>SOL Balance</p>
                  <p style={{ color: SOLANA_COLORS.purple, fontSize: '16px', fontWeight: '700', margin: 0 }}>
                    {solBalance.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* OILTOWN Price */}
              {coalPrice && (
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <p style={{ color: SOLANA_COLORS.textMuted, fontSize: '11px', margin: 0 }}>
                    OILTOWN Price: {formatPrice(coalPrice)} {priceLoading && '(updating...)'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Credit Packages */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '18px' }}>🎟️</span>
              <h3 style={{
                color: SOLANA_COLORS.textPrimary,
                fontSize: '14px',
                fontWeight: '600',
                margin: 0,
                letterSpacing: '1px'
              }}>
                BUY CREDITS
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[1, 5, 10].map((amount) => {
                const requiredCoal = getRequiredCoal(amount);
                const isSelected = state.selectedPackage === amount;
                return (
                  <div
                    key={amount}
                    onClick={() => !state.isProcessing && connected && handleSelectTicket(amount)}
                    style={{
                      padding: '18px 12px',
                      background: isSelected
                        ? `linear-gradient(135deg, ${SOLANA_COLORS.purple}, ${SOLANA_COLORS.purpleDark})`
                        : SOLANA_COLORS.bgCardHover,
                      border: isSelected
                        ? `2px solid ${SOLANA_COLORS.purple}`
                        : `1px solid ${SOLANA_COLORS.borderPurple}`,
                      borderRadius: '14px',
                      cursor: (!connected || state.isProcessing) ? 'not-allowed' : 'pointer',
                      textAlign: 'center',
                      opacity: (!connected || state.isProcessing) ? 0.5 : 1,
                      transition: 'all 0.3s ease',
                      transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                      boxShadow: isSelected ? `0 0 25px ${SOLANA_COLORS.glowPurple}` : 'none'
                    }}
                  >
                    <p style={{
                      color: isSelected ? '#fff' : SOLANA_COLORS.textPrimary,
                      fontSize: '28px',
                      fontWeight: '800',
                      marginBottom: '4px'
                    }}>
                      {amount}
                    </p>
                    <p style={{
                      color: isSelected ? 'rgba(255,255,255,0.8)' : SOLANA_COLORS.textSecondary,
                      fontSize: '11px',
                      marginBottom: '8px'
                    }}>
                      credit{amount > 1 ? 's' : ''}
                    </p>
                    <p style={{
                      color: isSelected ? SOLANA_COLORS.green : SOLANA_COLORS.green,
                      fontSize: '13px',
                      fontWeight: '700'
                    }}>
                      ${amount}
                    </p>
                    <p style={{
                      color: isSelected ? 'rgba(255,255,255,0.6)' : SOLANA_COLORS.textMuted,
                      fontSize: '10px',
                      marginTop: '6px'
                    }}>
                      ~{requiredCoal ? formatTokenAmount(requiredCoal) : '...'} OIL
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Transaction */}
          {state.pendingTxHash && (
            <div style={{
              marginBottom: '20px',
              padding: '18px',
              background: `rgba(251, 146, 60, 0.1)`,
              border: `1px solid rgba(251, 146, 60, 0.3)`,
              borderRadius: '14px',
              textAlign: 'center'
            }}>
              <p style={{ color: SOLANA_COLORS.warning, fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
                {state.isProcessing ? '⏳ Waiting for confirmation...' : '⚠️ Pending transaction'}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => window.open(getExplorerUrl(state.pendingTxHash), '_blank')}
                  style={{
                    padding: '10px 18px',
                    background: `linear-gradient(135deg, ${SOLANA_COLORS.purple}, ${SOLANA_COLORS.purpleDark})`,
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
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
                    background: state.isProcessing ? SOLANA_COLORS.bgCardHover : SOLANA_COLORS.warning,
                    border: 'none',
                    borderRadius: '10px',
                    color: state.isProcessing ? SOLANA_COLORS.textMuted : '#000',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                >
                  Check Status
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {connected && state.credits > 0 ? (
            <>
              <button
                onClick={handleStartGameWithCredits}
                disabled={state.isProcessing}
                style={{
                  width: '100%',
                  padding: '18px',
                  borderRadius: '14px',
                  border: 'none',
                  fontSize: '18px',
                  fontWeight: '700',
                  marginBottom: '14px',
                  cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                  background: state.isProcessing
                    ? SOLANA_COLORS.bgCardHover
                    : `linear-gradient(135deg, ${SOLANA_COLORS.green}, ${SOLANA_COLORS.greenDark})`,
                  color: state.isProcessing ? SOLANA_COLORS.textMuted : '#fff',
                  boxShadow: state.isProcessing ? 'none' : `0 0 30px ${SOLANA_COLORS.glowGreen}`,
                  transition: 'all 0.3s ease',
                  letterSpacing: '1px'
                }}
              >
                {state.isProcessing ? '⏳ Processing...' : '▶ START GAME'}
              </button>

              <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '12px', textAlign: 'center', marginBottom: '12px' }}>
                Or purchase more credits:
              </p>

              <button
                onClick={handlePurchaseAndStart}
                disabled={!state.selectedPackage || state.isProcessing}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: (!state.selectedPackage || state.isProcessing) ? 'not-allowed' : 'pointer',
                  background: (!state.selectedPackage || state.isProcessing)
                    ? SOLANA_COLORS.bgCardHover
                    : `linear-gradient(135deg, ${SOLANA_COLORS.purple}, ${SOLANA_COLORS.green})`,
                  color: (!state.selectedPackage || state.isProcessing) ? SOLANA_COLORS.textMuted : '#fff',
                  transition: 'all 0.3s ease',
                  boxShadow: (!state.selectedPackage || state.isProcessing) ? 'none' : `0 4px 20px ${SOLANA_COLORS.glowPurple}`,
                  letterSpacing: '0.5px'
                }}
              >
                {!state.selectedPackage ? 'Select a Package' : 'Purchase Credits with OILTOWN'}
              </button>
            </>
          ) : (
            <button
              onClick={handlePurchaseAndStart}
              disabled={!connected || !state.selectedPackage || state.isProcessing}
              style={{
                width: '100%',
                padding: '18px',
                borderRadius: '14px',
                border: 'none',
                fontSize: '16px',
                fontWeight: '700',
                cursor: (!connected || !state.selectedPackage || state.isProcessing) ? 'not-allowed' : 'pointer',
                background: (!connected || !state.selectedPackage || state.isProcessing)
                  ? SOLANA_COLORS.bgCardHover
                  : `linear-gradient(135deg, ${SOLANA_COLORS.purple} 0%, ${SOLANA_COLORS.green} 100%)`,
                color: (!connected || !state.selectedPackage || state.isProcessing) ? SOLANA_COLORS.textMuted : '#fff',
                transition: 'all 0.3s ease',
                boxShadow: (!connected || !state.selectedPackage || state.isProcessing) ? 'none' : `0 4px 25px ${SOLANA_COLORS.glowPurple}`,
                letterSpacing: '1px'
              }}
            >
              {state.isProcessing ? '⏳ Processing...'
                : !connected ? 'Connect Wallet First'
                : !state.selectedPackage ? 'Select a Package'
                : 'Purchase & Start Game'}
            </button>
          )}

          {/* Status Message */}
          <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '12px', textAlign: 'center', marginTop: '18px' }}>
            {state.statusMessage}
          </p>

          {/* How to start info */}
          <div style={{
            marginTop: '24px',
            padding: '18px',
            background: SOLANA_COLORS.bgCardHover,
            borderRadius: '14px',
            border: `1px solid ${SOLANA_COLORS.borderPurple}`
          }}>
            <p style={{ color: SOLANA_COLORS.textSecondary, fontSize: '12px', textAlign: 'center', marginBottom: '12px', fontWeight: '500' }}>
              ℹ️ How to start game:
            </p>
            <ol style={{ color: SOLANA_COLORS.textSecondary, fontSize: '12px', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>Connect your Solana wallet (Phantom/Solflare)</li>
              <li>Select game mode</li>
              <li>Purchase credits with OILTOWN tokens</li>
              <li>Start racing!</li>
            </ol>
            <p style={{ color: SOLANA_COLORS.green, fontSize: '12px', textAlign: 'center', marginTop: '14px', fontWeight: '500' }}>
              💰 Payments are made with OILTOWN tokens (Solana)
            </p>
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
            Connected to Solana Mainnet
          </span>
        </div>
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
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default RealLauncherUI;
