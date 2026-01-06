import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  getCoalBalance,
  getSolBalance,
  checkPaymentBalance,
  transferCoalToken,
  formatAddress,
  getExplorerUrl,
  isMobileDevice
} from '../utils/solanaWallet';
import { getCoalPrice, calculateCoalAmount, formatPrice } from '../utils/jupiterPrice';
import { getOrCreateUser } from '../utils/supabaseClient';
import { TOKEN_CONFIG, PAYMENT_CONFIG, formatTokenAmount } from '../solana.config';

// Agreement Text Content - Updated for COAL Token
const AGREEMENT_TEXT = `Lumexia: Gameplay Participation Agreement & Risk Disclosure

IMPORTANT: Please read the following terms carefully before participating in the Lumexia Racing Module. By clicking "ACCEPT", you acknowledge that you have read, understood, and agreed to be bound by these terms.

1. Nature of the Game (Game of Skill)
You acknowledge that the Lumexia Racing Module is a Game of Skill, not a game of chance or gambling. Your ranking on the leaderboard and eligibility for rewards are determined solely by your gameplay performance, reflexes, and strategy. The "Score" you achieve is the defining metric for reward distribution.

2. Entry Fees and COAL Token Usage
To participate, users utilize COAL tokens (on Solana blockchain) to acquire game credits (Jetons). You understand that this transaction is final and non-refundable. The COAL tokens collected form the "Reward Pool" for the daily cycle.

3. Reward Distribution & Deductions
The Reward Pool is distributed daily to the top 100 players based on their final scores. You explicitly agree to the following allocation of funds:

Prize Pool: The majority of the pool is distributed to the winners via an automated algorithm.

Operational Fee: A fixed deduction of 7.5% is taken from the total pool prior to distribution. This fee is allocated for Marketing activities and Weekly Token Burns to support the Lumexia ecosystem.

4. No Guarantee of Winnings
Participation does not guarantee a reward. If you do not rank within the top 100 players by the end of the daily cycle, you will not receive a share of the COAL pool for that specific session. You acknowledge the risk of financial loss associated with gameplay.

5. Cryptocurrency Risks
You acknowledge that the value of COAL token and SOL can fluctuate significantly. Lumexia is not responsible for any value loss due to market volatility, blockchain network errors, or wallet security breaches on the user's end.

6. Legal Compliance
You represent and warrant that you are of legal age and that participating in skill-based crypto gaming is legal in your local jurisdiction. It is your sole responsibility to comply with the laws of your country of residence.

7. Automated Execution
Reward distributions are executed by smart contracts/automated algorithms. These transactions are irreversible. By playing, you accept the calculated results as final.`;

const RealLauncherUI = ({ onStartGame }) => {
  const { publicKey, connected, connecting, wallet } = useWallet();
  const { connection } = useConnection();
  const walletAdapter = useWallet();

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

  // Fetch COAL price periodically
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        setPriceLoading(true);
        const price = await getCoalPrice();
        setCoalPrice(price);
      } catch (error) {
        console.error('Failed to fetch COAL price:', error);
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
      if (connected && publicKey) {
        try {
          const [coal, sol] = await Promise.all([
            getCoalBalance(publicKey),
            getSolBalance(publicKey)
          ]);
          setCoalBalance(coal);
          setSolBalance(sol);
        } catch (error) {
          console.error('Failed to fetch balances:', error);
        }
      } else {
        setCoalBalance(0);
        setSolBalance(0);
      }
    };

    fetchBalances();
    // Refresh balances every 10 seconds when connected
    const interval = connected ? setInterval(fetchBalances, 10000) : null;

    return () => interval && clearInterval(interval);
  }, [connected, publicKey]);

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
        const [coal, sol] = await Promise.all([
          getCoalBalance(publicKey),
          getSolBalance(publicKey)
        ]);
        setCoalBalance(coal);
        setSolBalance(sol);
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

  // Calculate required COAL for package
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
      statusMessage: `Selected: ${amount} credits (~${coalDisplay} COAL)`
    }));
  };

  // Helper to process transaction result
  const processTransactionResult = async (signature, walletAddress, packageAmount) => {
    try {
      setState(prev => ({
        ...prev,
        statusMessage: '⏳ Verifying COAL payment on Solana...',
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
        `COAL Paid: ~${formatTokenAmount(requiredCoal || 0)} COAL\n` +
        `Credits added: ${packageAmount}\n` +
        `New balance: ${verifyResult.credits} credits\n\n` +
        `View transaction:\n${getExplorerUrl(signature)}\n\n` +
        `Click "START GAME" to begin racing!`
      );

      // Refresh balances
      if (publicKey) {
        const [coal, sol] = await Promise.all([
          getCoalBalance(publicKey),
          getSolBalance(publicKey)
        ]);
        setCoalBalance(coal);
        setSolBalance(sol);
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
          `❌ Insufficient COAL!\n\n` +
          `Required: ~${formatTokenAmount(balanceCheck.requiredCoal)} COAL ($${packageAmount})\n` +
          `Your balance: ${formatTokenAmount(balanceCheck.coalBalance)} COAL\n\n` +
          `Please add more COAL tokens to your wallet.`
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
          ? '⏳ Opening wallet... Confirm COAL transfer'
          : '⏳ Opening wallet... Please confirm COAL transfer'
      }));

      // Transfer COAL tokens
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
          : '⏳ COAL transfer sent! Waiting for confirmation...'
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
        background: '#0D0D12',
        overflowY: 'auto',
        zIndex: 9999
      }}>
        {/* Logo */}
        <div style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 10
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #1E1E3F, #2D2D5A)',
            border: '2px solid rgba(255, 215, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '24px', color: '#FFD700' }}>⚡</span>
          </div>
          <div>
            <p style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', margin: 0, letterSpacing: '2px' }}>
              LUMEXIA
            </p>
            <p style={{ color: '#888', fontSize: '10px', margin: 0 }}>$COAL</p>
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '80px 20px 40px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '700px',
            background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
            borderRadius: '16px',
            border: '2px solid rgba(100, 100, 120, 0.3)',
            padding: '25px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}>
            {/* Title */}
            <h2 style={{
              color: '#FFD700',
              fontSize: '18px',
              fontWeight: 'bold',
              marginBottom: '20px',
              textAlign: 'center',
              letterSpacing: '1px'
            }}>
              Gameplay Participation Agreement & Risk Disclosure
            </h2>

            {/* Scrollable Agreement Text */}
            <div style={{
              height: '350px',
              overflowY: 'auto',
              background: '#0D0D14',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
              border: '1px solid rgba(100, 100, 120, 0.2)'
            }}>
              <pre style={{
                color: '#C4C4C4',
                fontSize: '13px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Inter, sans-serif',
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
              gap: '15px'
            }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                color: '#C4C4C4',
                fontSize: '14px'
              }}>
                <div
                  onClick={() => setAgreementChecked(!agreementChecked)}
                  style={{
                    width: '24px',
                    height: '24px',
                    border: '2px solid #FFD700',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: agreementChecked ? '#FFD700' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {agreementChecked && <span style={{ color: '#000', fontSize: '16px' }}>✓</span>}
                </div>
                I have read and accept the Terms & Conditions.
              </label>

              <button
                onClick={handleAcceptAgreement}
                disabled={!agreementChecked}
                style={{
                  padding: '12px 30px',
                  background: agreementChecked
                    ? 'linear-gradient(135deg, #FFD700, #B8860B)'
                    : '#3D3D5C',
                  border: 'none',
                  borderRadius: '8px',
                  color: agreementChecked ? '#000' : '#666',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: agreementChecked ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>

        {/* Custom Scrollbar Styles */}
        <style>{`
          ::-webkit-scrollbar { width: 8px; }
          ::-webkit-scrollbar-track { background: #0D0D14; }
          ::-webkit-scrollbar-thumb { background: #3D3D5C; border-radius: 4px; }
          ::-webkit-scrollbar-thumb:hover { background: #5D5D8C; }
        `}</style>
      </div>
    );
  }

  // ==================== MAIN LAUNCHER UI ====================
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0D0D12',
      overflowY: 'auto',
      zIndex: 9999
    }}>
      {/* Main Content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px'
      }}>

        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '30px'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #1E1E3F, #2D2D5A)',
            border: '2px solid rgba(255, 215, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '32px', color: '#FFD700' }}>⚡</span>
          </div>
          <div>
            <h1 style={{
              color: '#fff',
              fontSize: '32px',
              fontWeight: 'bold',
              margin: 0,
              letterSpacing: '3px'
            }}>
              LUMEXIA
            </h1>
            <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>$COAL on Solana</p>
          </div>
        </div>

        {/* Glassmorphism Card */}
        <div style={{
          width: '100%',
          maxWidth: '420px',
          background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
          borderRadius: '20px',
          border: '2px solid rgba(100, 100, 120, 0.3)',
          padding: '25px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}>

          {/* Wallet Connect Button */}
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
            <WalletMultiButton style={{
              background: 'linear-gradient(135deg, #9945FF, #14F195)',
              borderRadius: '12px',
              height: '48px',
              fontSize: '14px',
              fontWeight: 'bold'
            }} />
          </div>

          {connecting && (
            <div style={{
              marginBottom: '15px',
              padding: '12px',
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: '8px'
            }}>
              <p style={{ color: '#FFC107', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                ⏳ Connecting wallet...
              </p>
            </div>
          )}

          {!connected && !connecting && (
            <div style={{
              marginBottom: '15px',
              padding: '12px',
              background: 'rgba(153, 69, 255, 0.1)',
              border: '1px solid rgba(153, 69, 255, 0.2)',
              borderRadius: '8px'
            }}>
              <p style={{ color: '#C4B5FD', fontSize: '11px', margin: 0, textAlign: 'center' }}>
                💡 Connect with Phantom, Solflare, Backpack or other Solana wallets
              </p>
            </div>
          )}

          {/* Game Mode Selection */}
          {connected && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', textAlign: 'center' }}>
                🎮 Select Game Mode
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Classic Race */}
                <div
                  onClick={() => !state.isProcessing && setState(prev => ({ ...prev, gameMode: 'classic' }))}
                  style={{
                    padding: '15px 10px',
                    background: state.gameMode === 'classic'
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.2))'
                      : 'rgba(45, 45, 70, 0.5)',
                    border: state.gameMode === 'classic'
                      ? '2px solid #10B981'
                      : '2px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '10px',
                    cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: state.isProcessing ? 0.5 : 1,
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏎️</div>
                  <p style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>CLASSIC RACE</p>
                  <p style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>Normal scoring</p>
                  <p style={{ color: '#10B981', fontSize: '11px', fontWeight: '600' }}>1 Credit</p>
                  {state.gameMode === 'classic' && (
                    <p style={{ color: '#10B981', fontSize: '10px', marginTop: '4px' }}>✓ Selected</p>
                  )}
                </div>

                {/* Double or Nothing */}
                <div
                  onClick={() => !state.isProcessing && setState(prev => ({ ...prev, gameMode: 'doubleOrNothing' }))}
                  style={{
                    padding: '15px 10px',
                    background: state.gameMode === 'doubleOrNothing'
                      ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.3), rgba(202, 138, 4, 0.2))'
                      : 'rgba(45, 45, 70, 0.5)',
                    border: state.gameMode === 'doubleOrNothing'
                      ? '2px solid #EAB308'
                      : '2px solid rgba(100, 100, 120, 0.3)',
                    borderRadius: '10px',
                    cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                    textAlign: 'center',
                    opacity: state.isProcessing ? 0.5 : 1,
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎰</div>
                  <p style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>DOUBLE OR NOTHING</p>
                  <p style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>2X score or 0!</p>
                  <p style={{ color: '#EAB308', fontSize: '11px', fontWeight: '600' }}>2 Credits</p>
                  {state.gameMode === 'doubleOrNothing' && (
                    <p style={{ color: '#EAB308', fontSize: '10px', marginTop: '4px' }}>✓ Selected</p>
                  )}
                </div>
              </div>

              {/* Game Mode Info */}
              <div style={{
                marginTop: '10px',
                padding: '10px',
                background: state.gameMode === 'classic' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                border: `1px solid ${state.gameMode === 'classic' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <p style={{ color: state.gameMode === 'classic' ? '#10B981' : '#EAB308', fontSize: '11px', margin: 0 }}>
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
              marginBottom: '20px',
              padding: '15px',
              background: 'linear-gradient(135deg, rgba(153, 69, 255, 0.1), rgba(20, 241, 149, 0.05))',
              border: '1px solid rgba(153, 69, 255, 0.3)',
              borderRadius: '12px'
            }}>
              {/* Credits */}
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <p style={{ color: '#888', fontSize: '12px', marginBottom: '5px' }}>Your Credits</p>
                <p style={{ color: '#FFD700', fontSize: '32px', fontWeight: 'bold', margin: '0' }}>{state.credits}</p>
              </div>

              {/* Token Balances */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{
                  padding: '10px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <p style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>COAL Balance</p>
                  <p style={{ color: '#14F195', fontSize: '14px', fontWeight: 'bold', margin: 0 }}>
                    {formatTokenAmount(coalBalance)}
                  </p>
                </div>
                <div style={{
                  padding: '10px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <p style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>SOL Balance</p>
                  <p style={{ color: '#9945FF', fontSize: '14px', fontWeight: 'bold', margin: 0 }}>
                    {solBalance.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* COAL Price */}
              {coalPrice && (
                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                  <p style={{ color: '#666', fontSize: '10px', margin: 0 }}>
                    COAL Price: {formatPrice(coalPrice)} {priceLoading && '(updating...)'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Credit Packages */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', textAlign: 'center' }}>
              Select Credit Package
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {[1, 5, 10].map((amount) => {
                const requiredCoal = getRequiredCoal(amount);
                return (
                  <div
                    key={amount}
                    onClick={() => !state.isProcessing && connected && handleSelectTicket(amount)}
                    style={{
                      padding: '15px 10px',
                      background: state.selectedPackage === amount
                        ? 'linear-gradient(135deg, #FFD700, #B8860B)'
                        : 'rgba(45, 45, 70, 0.5)',
                      border: state.selectedPackage === amount
                        ? '2px solid #FFD700'
                        : '2px solid rgba(100, 100, 120, 0.3)',
                      borderRadius: '10px',
                      cursor: (!connected || state.isProcessing) ? 'not-allowed' : 'pointer',
                      textAlign: 'center',
                      opacity: (!connected || state.isProcessing) ? 0.5 : 1,
                      transition: 'all 0.3s ease',
                      transform: state.selectedPackage === amount ? 'scale(1.05)' : 'scale(1)'
                    }}
                  >
                    <p style={{
                      color: state.selectedPackage === amount ? '#000' : '#fff',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      marginBottom: '4px'
                    }}>
                      {amount}
                    </p>
                    <p style={{
                      color: state.selectedPackage === amount ? '#000' : '#888',
                      fontSize: '10px',
                      marginBottom: '6px'
                    }}>
                      credit{amount > 1 ? 's' : ''}
                    </p>
                    <p style={{
                      color: state.selectedPackage === amount ? '#000' : '#14F195',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      ${amount}
                    </p>
                    <p style={{
                      color: state.selectedPackage === amount ? 'rgba(0,0,0,0.6)' : '#888',
                      fontSize: '9px',
                      marginTop: '4px'
                    }}>
                      ~{requiredCoal ? formatTokenAmount(requiredCoal) : '...'} COAL
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Transaction */}
          {state.pendingTxHash && (
            <div style={{
              marginBottom: '15px',
              padding: '15px',
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <p style={{ color: '#EAB308', fontSize: '12px', marginBottom: '10px' }}>
                {state.isProcessing ? '⏳ Waiting for confirmation...' : '⚠️ Pending transaction'}
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => window.open(getExplorerUrl(state.pendingTxHash), '_blank')}
                  style={{
                    padding: '8px 15px',
                    background: '#3B82F6',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: 'pointer'
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
                    padding: '8px 15px',
                    background: state.isProcessing ? '#3D3D5C' : '#EAB308',
                    border: 'none',
                    borderRadius: '6px',
                    color: state.isProcessing ? '#666' : '#000',
                    fontSize: '11px',
                    cursor: state.isProcessing ? 'not-allowed' : 'pointer'
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
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  marginBottom: '12px',
                  cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                  background: state.isProcessing
                    ? '#3D3D5C'
                    : 'linear-gradient(135deg, #10B981, #059669)',
                  color: state.isProcessing ? '#666' : '#fff',
                  boxShadow: state.isProcessing ? 'none' : '0 0 25px rgba(16, 185, 129, 0.4)',
                  transition: 'all 0.3s ease'
                }}
              >
                {state.isProcessing ? '⏳ Processing...' : '▶ START GAME'}
              </button>

              <p style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginBottom: '10px' }}>
                Or purchase more credits:
              </p>

              <button
                onClick={handlePurchaseAndStart}
                disabled={!state.selectedPackage || state.isProcessing}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: (!state.selectedPackage || state.isProcessing) ? 'not-allowed' : 'pointer',
                  background: (!state.selectedPackage || state.isProcessing)
                    ? '#3D3D5C'
                    : 'linear-gradient(135deg, #FFD700, #B8860B)',
                  color: (!state.selectedPackage || state.isProcessing) ? '#666' : '#000',
                  transition: 'all 0.3s ease'
                }}
              >
                {!state.selectedPackage ? 'Select a Package' : 'Purchase Credits with COAL'}
              </button>
            </>
          ) : (
            <button
              onClick={handlePurchaseAndStart}
              disabled={!connected || !state.selectedPackage || state.isProcessing}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: (!connected || !state.selectedPackage || state.isProcessing) ? 'not-allowed' : 'pointer',
                background: (!connected || !state.selectedPackage || state.isProcessing)
                  ? '#3D3D5C'
                  : 'linear-gradient(135deg, #FFD700, #B8860B)',
                color: (!connected || !state.selectedPackage || state.isProcessing) ? '#666' : '#000',
                transition: 'all 0.3s ease'
              }}
            >
              {state.isProcessing ? '⏳ Processing...'
                : !connected ? 'Connect Wallet First'
                : !state.selectedPackage ? 'Select a Package'
                : 'Purchase & Start Game'}
            </button>
          )}

          {/* Status Message */}
          <p style={{ color: '#888', fontSize: '11px', textAlign: 'center', marginTop: '15px' }}>
            {state.statusMessage}
          </p>

          {/* How to start info */}
          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: 'rgba(45, 45, 70, 0.3)',
            borderRadius: '10px',
            border: '1px solid rgba(100, 100, 120, 0.2)'
          }}>
            <p style={{ color: '#888', fontSize: '11px', textAlign: 'center', marginBottom: '8px' }}>
              ℹ️ How to start game:
            </p>
            <ol style={{ color: '#C4C4C4', fontSize: '11px', margin: 0, paddingLeft: '20px' }}>
              <li>Connect your Solana wallet (Phantom/Solflare)</li>
              <li>Select game mode</li>
              <li>Purchase credits with COAL tokens</li>
              <li>Start racing!</li>
            </ol>
            <p style={{ color: '#14F195', fontSize: '11px', textAlign: 'center', marginTop: '10px' }}>
              💰 Payments are made with COAL tokens (Solana)
            </p>
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0D0D14; }
        ::-webkit-scrollbar-thumb { background: #3D3D5C; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #5D5D8C; }
      `}</style>
    </div>
  );
};

export default RealLauncherUI;
