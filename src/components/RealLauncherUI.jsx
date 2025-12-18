import { useState, useEffect, useRef } from 'react';
import { useAccount, useBalance, useConfig, useSwitchChain, useChainId } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  initiateBNBPayment,
  waitForPaymentConfirmation,
  getBSCScanLink,
  getBNBPrice,
  hasEnoughBalance,
  isMobileDevice,
  openWalletOnMobile
} from '../utils/realWallet';
import { getOrCreateUser, getUserTeamSelection, updateTeamSelection } from '../utils/supabaseClient';
import { PRICING_BNB } from '../wagmi.config';

// Agreement Text Content
const AGREEMENT_TEXT = `Lumexia: Gameplay Participation Agreement & Risk Disclosure

IMPORTANT: Please read the following terms carefully before participating in the Lumexia Racing Module. By clicking "ACCEPT", you acknowledge that you have read, understood, and agreed to be bound by these terms.

1. Nature of the Game (Game of Skill)
You acknowledge that the Lumexia Racing Module is a Game of Skill, not a game of chance or gambling. Your ranking on the leaderboard and eligibility for rewards are determined solely by your gameplay performance, reflexes, and strategy. The "Score" you achieve is the defining metric for reward distribution.

2. Entry Fees and BNB Usage
To participate, users utilize BNB to acquire game credits (Jetons). You understand that this transaction is final and non-refundable. The BNB collected form the "Reward Pool" for the daily cycle.

3. Reward Distribution & Deductions
The Reward Pool is distributed daily to the top 100 players based on their final scores. You explicitly agree to the following allocation of funds:

Prize Pool: The majority of the pool is distributed to the winners via an automated algorithm.

Operational Fee: A fixed deduction of 7.5% is taken from the total pool prior to distribution. This fee is allocated for Marketing activities and Weekly Token Burns to support the Lumexia ecosystem.

4. No Guarantee of Winnings
Participation does not guarantee a reward. If you do not rank within the top 100 players by the end of the daily cycle, you will not receive a share of the BNB pool for that specific session. You acknowledge the risk of financial loss associated with gameplay.

5. Cryptocurrency Risks
You acknowledge that the value of BNB and the LMX token can fluctuate significantly. Lumexia is not responsible for any value loss due to market volatility, blockchain network errors, or wallet security breaches on the user's end.

6. Legal Compliance
You represent and warrant that you are of legal age and that participating in skill-based crypto gaming is legal in your local jurisdiction. It is your sole responsibility to comply with the laws of your country of residence.

7. Automated Execution
Reward distributions are executed by smart contracts/automated algorithms. These transactions are irreversible. By playing, you accept the calculated results as final.`;

const RealLauncherUI = ({ onStartGame }) => {
  const { address, isConnected, status: connectionStatus } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const config = useConfig();

  // Track mounting to prevent strict mode double-firing issues
  const isMounted = useRef(false);

  // Track connection attempts for mobile debugging
  const connectionAttemptRef = useRef(0);

  // Agreement State - Show agreement on every visit
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  // Debounced Network Check
  const [showWrongNetwork, setShowWrongNetwork] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Reset wrong network state on mount and wait for wallet to stabilize
  useEffect(() => {
    setShowWrongNetwork(false);
    setIsInitialMount(true);

    const mountDelay = setTimeout(() => {
      setIsInitialMount(false);
    }, 2000);

    return () => clearTimeout(mountDelay);
  }, []);

  useEffect(() => {
    if (isInitialMount) return;

    let timeoutId;
    if (isConnected && chainId && chainId !== bsc.id) {
      timeoutId = setTimeout(() => {
        setShowWrongNetwork(true);
        console.log('⚠️ Network check: Wrong network detected (after delay)');
        try {
          switchChain({ chainId: bsc.id });
        } catch (e) {
          console.error("Auto-switch failed:", e);
        }
      }, 1500);
    } else {
      setShowWrongNetwork(false);
    }
    return () => clearTimeout(timeoutId);
  }, [isConnected, chainId, switchChain, isInitialMount]);

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
          selectedTeam: null,
          canChangeTeam: true,
          teamSelectionDate: null,
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
      selectedTeam: null,
      canChangeTeam: true,
      teamSelectionDate: null,
      gameMode: 'classic',
    };
  });

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
      if (isConnected && address) {
        await loadUserData(address);
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
  }, [state.pendingTxHash, state.isProcessing, isConnected, address]);

  // BNB balance
  const { data: bnbBalanceData } = useBalance({
    address: address,
    chainId: bsc.id,
  });

  // Log connection status changes
  useEffect(() => {
    console.log('🔌 Connection status changed:', connectionStatus);
    if (connectionStatus === 'connecting') {
      connectionAttemptRef.current += 1;
    } else if (connectionStatus === 'connected') {
      connectionAttemptRef.current = 0;
    }
  }, [connectionStatus]);

  // Check for pending transaction on mount
  useEffect(() => {
    if (isConnected && address && state.pendingTxHash && state.isProcessing) {
      const timer = setTimeout(() => {
        checkPendingTransaction(state.pendingTxHash);
      }, 2000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Load user credits and team when wallet connects
  useEffect(() => {
    isMounted.current = true;
    if (isConnected && address) {
      loadUserData(address);
    } else {
      setState(prev => ({
        ...prev,
        credits: 0,
        selectedPackage: null,
        selectedTeam: null,
        canChangeTeam: true,
        statusMessage: 'Connect your wallet to get started'
      }));
    }
    return () => { isMounted.current = false; };
  }, [isConnected, address]);

  // Load user credits and team from database
  const loadUserData = async (walletAddress) => {
    try {
      setState(prev => ({ ...prev, isProcessing: true }));

      const user = await getOrCreateUser(walletAddress);
      const teamData = await getUserTeamSelection(walletAddress);
      const canChange = teamData.team ? false : teamData.canChange;

      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          credits: user.credits || 0,
          selectedTeam: teamData.team,
          canChangeTeam: canChange,
          teamSelectionDate: teamData.selectionDate,
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

  // Ticket Selection Handler
  const handleSelectTicket = (amount) => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    const bnbPrice = PRICING_BNB[amount];
    setState(prev => ({
      ...prev,
      selectedPackage: amount,
      statusMessage: `Selected: ${amount} credits for ${bnbPrice} BNB`
    }));
  };

  // Helper to process transaction result
  const processTransactionResult = async (hash, address, packageAmount) => {
    try {
      setState(prev => ({
        ...prev,
        statusMessage: '⏳ Verifying BNB payment on blockchain...',
        lastTransaction: hash,
        pendingTxHash: hash,
      }));

      await waitForPaymentConfirmation(config, hash);
      const verifyResult = await verifyPaymentOnChain(hash, address, packageAmount);

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

      const bnbPrice = PRICING_BNB[packageAmount];
      alert(
        `✅ Payment Successful!\n\n` +
        `BNB Paid: ${bnbPrice} BNB\n` +
        `Credits added: ${packageAmount}\n` +
        `New balance: ${verifyResult.credits} credits\n\n` +
        `View transaction:\n${getBSCScanLink(hash)}\n\n` +
        `Click "START GAME" to begin racing!`
      );

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
  const checkPendingTransaction = async (hash) => {
    if (!hash || !state.selectedPackage) return;
    if (state.isProcessing) return;
    await processTransactionResult(hash, address, state.selectedPackage);
  };

  // Purchase Handler
  const handlePurchaseAndStart = async () => {
    if (!state.selectedPackage) {
      alert('Please select a ticket first');
      return;
    }

    if (!isConnected || !address) {
      alert('Please connect wallet first');
      return;
    }

    const bnbBalance = bnbBalanceData?.formatted || '0';
    const bnbPrice = PRICING_BNB[state.selectedPackage];

    if (!hasEnoughBalance(bnbBalance, state.selectedPackage)) {
      alert(
        `❌ Insufficient BNB!\n\n` +
        `Required: ${bnbPrice} BNB + gas\n` +
        `Your balance: ${bnbBalance} BNB\n\n` +
        `Please add more BNB to your wallet.`
      );
      return;
    }

    if (state.isProcessing) return;

    const packageAmount = state.selectedPackage;
    const isMobile = isMobileDevice();

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        statusMessage: isMobile
          ? '⏳ Opening wallet... Confirm BNB transfer'
          : '⏳ Opening wallet... Please confirm BNB transfer'
      }));

      const hash = await initiateBNBPayment(config, address, packageAmount);

      setState(prev => ({
        ...prev,
        pendingTxHash: hash,
        lastTransaction: hash,
        statusMessage: isMobile
          ? '⏳ Transaction sent! Check your wallet...'
          : '⏳ BNB transfer sent! Waiting for confirmation...'
      }));

      await processTransactionResult(hash, address, packageAmount);

    } catch (error) {
      console.error('❌ Payment initiation failed:', error);

      let errorMessage = 'Payment failed';

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message?.includes('Insufficient BNB')) {
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
  const verifyPaymentOnChain = async (transactionHash, userAddress, packageAmount, maxRetries = 3) => {
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
            body: JSON.stringify({ transactionHash, userAddress, packageAmount }),
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

  // Team Selection Handler
  const handleSelectTeam = async (team) => {
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    if (!state.canChangeTeam || state.selectedTeam) {
      alert('⚠️ You have already selected a team today!\n\nYou can change your team tomorrow at 00:00.');
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        canChangeTeam: false,
        selectedTeam: team
      }));

      const result = await updateTeamSelection(address, team);

      if (!result.success) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          canChangeTeam: true,
          selectedTeam: null,
          statusMessage: `❌ ${result.error || 'Failed to update team'}`
        }));
        throw new Error(result.error || 'Failed to update team');
      }

      const teamData = await getUserTeamSelection(address);

      setState(prev => ({
        ...prev,
        selectedTeam: teamData.team,
        canChangeTeam: false,
        teamSelectionDate: teamData.selectionDate,
        isProcessing: false,
        statusMessage: `✅ ${team.toUpperCase()} Team selected!`
      }));

      alert(`✅ Successfully joined ${team.toUpperCase()} Team!\n\nYour scores will count towards ${team} team's daily total.`);

    } catch (error) {
      console.error('Team selection error:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        canChangeTeam: true,
        selectedTeam: null,
        statusMessage: `❌ ${error.message}`
      }));
      alert(`❌ Failed to select team\n\n${error.message}`);
    }
  };

  // Accept Agreement Handler
  const handleAcceptAgreement = () => {
    if (!agreementChecked) {
      alert('Please check the checkbox to accept the Terms & Conditions');
      return;
    }
    setAgreementAccepted(true);
    // No localStorage - Agreement shows on every visit
  };

  // Start game with existing credits
  const handleStartGameWithCredits = () => {
    if (!isConnected || !address) {
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

    if (!state.selectedTeam) {
      alert('⚠️ Team Selection Required!\n\nPlease select Blue Team or Red Team before starting the game.');
      return;
    }

    onStartGame({
      walletAddress: address,
      credits: state.credits,
      selectedTeam: state.selectedTeam,
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
            <p style={{ color: '#888', fontSize: '10px', margin: 0 }}>$LMX</p>
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
            <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>$LMX</p>
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
          <div style={{ marginBottom: '20px' }}>
            <ConnectButton
              label="Connect Wallet"
              accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
              chainStatus="icon"
              showBalance={{ smallScreen: false, largeScreen: true }}
            />

            {connectionStatus === 'connecting' && (
              <div style={{
                marginTop: '12px',
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

            {!isConnected && connectionStatus !== 'connecting' && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px'
              }}>
                <p style={{ color: '#93C5FD', fontSize: '11px', margin: 0, textAlign: 'center' }}>
                  💡 On mobile, open your MetaMask app and click "Connect".
                </p>
              </div>
            )}
          </div>

          {/* Wrong Network Warning */}
          {showWrongNetwork ? (
            <div style={{
              padding: '20px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <p style={{ color: '#EF4444', fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
                ⚠️ Wrong Network!
              </p>
              <p style={{ color: '#C4C4C4', fontSize: '12px', marginBottom: '15px' }}>
                Please switch to BNB Smart Chain to continue.
              </p>
              <button
                onClick={() => switchChain({ chainId: bsc.id })}
                style={{
                  padding: '10px 20px',
                  background: '#EF4444',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Switch to BSC
              </button>
            </div>
          ) : (
            <>
              {/* Game Mode Selection */}
              {isConnected && (
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

              {/* Team Selection */}
              {isConnected && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', textAlign: 'center' }}>
                    ⚔️ Select Your Team (Daily)
                  </h3>

                  {state.selectedTeam && !state.canChangeTeam ? (
                    <div style={{
                      padding: '15px',
                      background: state.selectedTeam === 'blue'
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(239, 68, 68, 0.2)',
                      border: `2px solid ${state.selectedTeam === 'blue' ? '#3B82F6' : '#EF4444'}`,
                      borderRadius: '10px',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>
                        {state.selectedTeam === 'blue' ? '🔵' : '🔴'}
                      </div>
                      <p style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
                        {state.selectedTeam.toUpperCase()} TEAM
                      </p>
                      <p style={{ color: '#888', fontSize: '10px' }}>✅ Selected for today</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      {/* Blue Team */}
                      <div
                        onClick={() => handleSelectTeam('blue')}
                        style={{
                          padding: '15px',
                          background: state.selectedTeam === 'blue'
                            ? 'rgba(59, 130, 246, 0.3)'
                            : 'rgba(45, 45, 70, 0.5)',
                          border: state.selectedTeam === 'blue'
                            ? '2px solid #3B82F6'
                            : '2px solid rgba(100, 100, 120, 0.3)',
                          borderRadius: '10px',
                          cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                          textAlign: 'center',
                          opacity: state.isProcessing ? 0.5 : 1,
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔵</div>
                        <p style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>BLUE TEAM</p>
                      </div>

                      {/* Red Team */}
                      <div
                        onClick={() => handleSelectTeam('red')}
                        style={{
                          padding: '15px',
                          background: state.selectedTeam === 'red'
                            ? 'rgba(239, 68, 68, 0.3)'
                            : 'rgba(45, 45, 70, 0.5)',
                          border: state.selectedTeam === 'red'
                            ? '2px solid #EF4444'
                            : '2px solid rgba(100, 100, 120, 0.3)',
                          borderRadius: '10px',
                          cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                          textAlign: 'center',
                          opacity: state.isProcessing ? 0.5 : 1,
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔴</div>
                        <p style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>RED TEAM</p>
                      </div>
                    </div>
                  )}

                  {/* Team Info */}
                  <div style={{
                    marginTop: '10px',
                    padding: '10px',
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <p style={{ color: '#EAB308', fontSize: '11px', margin: 0 }}>
                      🏆 Win bonus: Team with highest daily score gets +3 credits!
                    </p>
                  </div>
                </div>
              )}

              {/* Credit Display */}
              {isConnected && (
                <div style={{
                  marginBottom: '20px',
                  padding: '15px',
                  background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(184, 134, 11, 0.05))',
                  border: '1px solid rgba(255, 215, 0, 0.3)',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <p style={{ color: '#888', fontSize: '12px', marginBottom: '5px' }}>Your Credits</p>
                  <p style={{ color: '#FFD700', fontSize: '32px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{state.credits}</p>
                  <p style={{ color: '#4ADE80', fontSize: '12px', margin: 0 }}>
                    {bnbBalanceData?.formatted ? `${parseFloat(bnbBalanceData.formatted).toFixed(4)} BNB` : '0 BNB'}
                  </p>
                </div>
              )}

              {/* Ticket Packages */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '12px', textAlign: 'center' }}>
                  Select Credit Package
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[1, 5, 10].map((amount) => (
                    <div
                      key={amount}
                      onClick={() => !state.isProcessing && isConnected && handleSelectTicket(amount)}
                      style={{
                        padding: '15px 10px',
                        background: state.selectedPackage === amount
                          ? 'linear-gradient(135deg, #FFD700, #B8860B)'
                          : 'rgba(45, 45, 70, 0.5)',
                        border: state.selectedPackage === amount
                          ? '2px solid #FFD700'
                          : '2px solid rgba(100, 100, 120, 0.3)',
                        borderRadius: '10px',
                        cursor: (!isConnected || state.isProcessing) ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                        opacity: (!isConnected || state.isProcessing) ? 0.5 : 1,
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
                        color: state.selectedPackage === amount ? '#000' : '#10B981',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {PRICING_BNB[amount]} BNB
                      </p>
                    </div>
                  ))}
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
                    {isMobileDevice() && (
                      <button
                        onClick={() => openWalletOnMobile()}
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
                        Open Wallet
                      </button>
                    )}
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
              {isConnected && state.credits > 0 ? (
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
                    {!state.selectedPackage ? 'Select a Package' : 'Purchase Credits'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handlePurchaseAndStart}
                  disabled={!isConnected || !state.selectedPackage || state.isProcessing}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '12px',
                    border: 'none',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: (!isConnected || !state.selectedPackage || state.isProcessing) ? 'not-allowed' : 'pointer',
                    background: (!isConnected || !state.selectedPackage || state.isProcessing)
                      ? '#3D3D5C'
                      : 'linear-gradient(135deg, #FFD700, #B8860B)',
                    color: (!isConnected || !state.selectedPackage || state.isProcessing) ? '#666' : '#000',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {state.isProcessing ? '⏳ Processing...'
                    : !isConnected ? 'Connect Wallet First'
                    : !state.selectedPackage ? 'Select a Package'
                    : 'Purchase & Start Game'}
                </button>
              )}
            </>
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
              <li>Connect your wallet (MetaMask/Trust Wallet)</li>
              <li>Select game mode & team</li>
              <li>Purchase credits with BNB</li>
              <li>Start racing!</li>
            </ol>
            <p style={{ color: '#FFD700', fontSize: '11px', textAlign: 'center', marginTop: '10px' }}>
              💰 Payments are made with BNB (BSC)
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
