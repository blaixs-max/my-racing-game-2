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

  // Phase Management
  const [currentPhase, setCurrentPhase] = useState(1);
  const [completedPhases, setCompletedPhases] = useState({
    1: false, // Agreement
    2: false, // Connect Wallet
    3: false, // Game Mode & Team
    4: false  // Purchase & Start
  });

  // Agreement State
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  // Debounced Network Check
  const [showWrongNetwork, setShowWrongNetwork] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Reset wrong network state on mount and wait for wallet to stabilize
  useEffect(() => {
    setShowWrongNetwork(false);
    setIsInitialMount(true);

    // Give wallet time to stabilize after component mounts (e.g., returning from game)
    const mountDelay = setTimeout(() => {
      setIsInitialMount(false);
    }, 2000); // 2s delay before allowing network checks

    return () => clearTimeout(mountDelay);
  }, []);

  useEffect(() => {
    // Don't check network during initial mount period
    if (isInitialMount) return;

    let timeoutId;
    if (isConnected && chainId && chainId !== bsc.id) {
      // Delay showing wrong network to allow mobile wallet to settle connection
      timeoutId = setTimeout(() => {
        setShowWrongNetwork(true);
        console.log('⚠️ Network check: Wrong network detected (after delay)');
        // Auto-request switch after delay
        try {
          switchChain({ chainId: bsc.id });
        } catch (e) {
          console.error("Auto-switch failed:", e);
        }
      }, 1500); // 1.5s delay
    } else {
      setShowWrongNetwork(false);
    }
    return () => clearTimeout(timeoutId);
  }, [isConnected, chainId, switchChain, isInitialMount]);


  // State Management - with localStorage persistence for iOS Safari
  const [state, setState] = useState(() => {
    // Try to restore pending transaction from localStorage (iOS Safari recovery)
    try {
      const savedState = localStorage.getItem('lumexia-pending-tx');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        console.log('📦 Restored pending transaction from localStorage:', parsed);
        return {
          selectedPackage: parsed.selectedPackage || null,
          credits: 0,
          isProcessing: parsed.isProcessing || false,
          statusMessage: parsed.statusMessage || 'Connect your wallet to get started',
          lastTransaction: parsed.lastTransaction || null,
          pendingTxHash: parsed.pendingTxHash || null,
          // Team System
          selectedTeam: null,
          canChangeTeam: true,
          teamSelectionDate: null,
        };
      }
    } catch (e) {
      console.warn('Failed to restore state from localStorage:', e);
    }

    return {
      selectedPackage: null, // 1, 5, or 10
      credits: 0,
      isProcessing: false,
      statusMessage: 'Connect your wallet to get started',
      lastTransaction: null,
      pendingTxHash: null, // Track pending hash for mobile backgrounding
      // Team System
      selectedTeam: null, // 'blue' | 'red' | null
      canChangeTeam: true,
      teamSelectionDate: null,
      // Game Mode System
      gameMode: 'classic', // 'classic' | 'doubleOrNothing'
    };
  });

  // Save pending transaction state to localStorage for iOS Safari recovery
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
      console.log('💾 Saved pending transaction to localStorage');
    } else {
      // Clear when no longer pending
      localStorage.removeItem('lumexia-pending-tx');
    }
  }, [state.pendingTxHash, state.isProcessing, state.selectedPackage, state.statusMessage, state.lastTransaction]);

  // Re-check connection and pending transactions when app comes to foreground
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 App returned to foreground (visibilitychange)');
        await handleAppForeground();
      }
    };

    const handleFocus = async () => {
      console.log('📱 App gained focus (focus event)');
      await handleAppForeground();
    };

    const handlePageShow = async (event) => {
      console.log('📱 Page shown (pageshow event), persisted:', event.persisted);
      await handleAppForeground();
    };

    const handleAppForeground = async () => {
      // Check if wallet connection was established while in background
      if (isConnected && address) {
        console.log('✅ Wallet connected:', address);
        await loadUserData(address);
      }

      // Resume Pending Transaction Check
      if (state.pendingTxHash && state.isProcessing) {
        console.log('⏳ Resuming check for pending TX:', state.pendingTxHash);
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

  // Log connection status changes for debugging
  useEffect(() => {
    console.log('🔌 Connection status changed:', connectionStatus);
    if (connectionStatus === 'connecting') {
      connectionAttemptRef.current += 1;
      console.log('📱 Connection attempt #', connectionAttemptRef.current);
    } else if (connectionStatus === 'connected') {
      console.log('✅ Successfully connected after', connectionAttemptRef.current, 'attempts');
      connectionAttemptRef.current = 0;
    }
  }, [connectionStatus]);

  // Check for pending transaction on mount (iOS Safari recovery)
  useEffect(() => {
    if (isConnected && address && state.pendingTxHash && state.isProcessing) {
      console.log('🔄 Found pending transaction on mount, resuming check...');
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
      // Mark phase 2 as complete when wallet connects
      setCompletedPhases(prev => ({ ...prev, 2: true }));
    } else {
      setState(prev => ({
        ...prev,
        credits: 0,
        selectedPackage: null,
        selectedTeam: null,
        canChangeTeam: true,
        statusMessage: 'Connect your wallet to get started'
      }));
      // Reset phase 2 if wallet disconnects
      setCompletedPhases(prev => ({ ...prev, 2: false }));
    }
    return () => { isMounted.current = false; };
  }, [isConnected, address]);

  // Update phase 3 completion when team and mode are selected
  useEffect(() => {
    if (state.selectedTeam && state.gameMode) {
      setCompletedPhases(prev => ({ ...prev, 3: true }));
    }
  }, [state.selectedTeam, state.gameMode]);

  // Load user credits and team from database
  const loadUserData = async (walletAddress) => {
    try {
      setState(prev => ({ ...prev, isProcessing: true }));

      // Load user credits
      const user = await getOrCreateUser(walletAddress);

      // Load team selection
      const teamData = await getUserTeamSelection(walletAddress);

      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          credits: user.credits || 0,
          selectedTeam: teamData.team,
          canChangeTeam: teamData.canChange,
          teamSelectionDate: teamData.selectionDate,
          isProcessing: false,
          statusMessage: `Connected! You have ${user.credits || 0} credits`
        }));
      }

      console.log('✅ User loaded:', user);
      console.log('✅ Team data:', teamData);
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

      // Wait for confirmation
      await waitForPaymentConfirmation(config, hash);

      // Verify payment via Supabase Edge Function
      const verifyResult = await verifyPaymentOnChain(hash, address, packageAmount);

      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'Payment verification failed');
      }

      console.log('✅ Payment verified:', verifyResult);

      // Clear localStorage on success
      localStorage.removeItem('lumexia-pending-tx');

      // Update credits in state
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

    if (state.isProcessing) {
      console.log("⚠️ Already checking transaction, ignoring duplicate call");
      return;
    }

    console.log("Checking pending transaction...", hash);
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

    // Check BNB balance
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

    if (state.isProcessing) {
      console.log('⚠️ Already processing, ignoring click');
      return;
    }

    const packageAmount = state.selectedPackage;

    if (!packageAmount) {
      console.log('⚠️ No package selected');
      return;
    }

    const isMobile = isMobileDevice();

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        statusMessage: isMobile
          ? '⏳ Opening wallet... Confirm BNB transfer'
          : '⏳ Opening wallet... Please confirm BNB transfer'
      }));

      console.log('📱 Preparing BNB payment...', { isMobile, bnbPrice });

      // Initiate BNB Transfer
      const hash = await initiateBNBPayment(config, address, packageAmount);

      console.log('✅ BNB Payment initiated:', hash);

      setState(prev => ({
        ...prev,
        pendingTxHash: hash,
        lastTransaction: hash,
        statusMessage: isMobile
          ? '⏳ Transaction sent! Check your wallet...'
          : '⏳ BNB transfer sent! Waiting for confirmation...'
      }));

      // Process Confirmation
      await processTransactionResult(hash, address, packageAmount);

    } catch (error) {
      console.error('❌ Payment initiation failed:', error);

      let errorMessage = 'Payment failed';
      let showOpenWalletHint = false;

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message?.includes('Insufficient BNB')) {
        errorMessage = error.message;
      } else if (error.message?.includes('multiple attempts')) {
        errorMessage = 'Network connection failed. Please check your internet and try again.';
      } else if (error.message?.includes('disconnected') || error.message?.includes('reconnect')) {
        errorMessage = 'Wallet disconnected. Please reconnect and try again.';
      } else if (error.message?.includes('connector')) {
        errorMessage = isMobile
          ? 'Wallet connection lost. Refresh and try again.'
          : 'Wallet connection lost. Please refresh and try again.';
      } else {
        errorMessage = error.message || 'Unknown error occurred';
        if (isMobile) {
          showOpenWalletHint = true;
        }
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        pendingTxHash: null,
        statusMessage: `❌ ${errorMessage}`
      }));

      localStorage.removeItem('lumexia-pending-tx');

      if (isMobile && showOpenWalletHint) {
        alert(
          `❌ Payment Failed\n\n${errorMessage}\n\n` +
          `💡 Tip: Open your wallet app manually and check for pending transactions.`
        );
      } else {
        alert(`❌ Payment Failed\n\n${errorMessage}`);
      }
    }
  };

  // Verify payment via Supabase Edge Function
  const verifyPaymentOnChain = async (transactionHash, userAddress, packageAmount, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Frontend verification attempt ${attempt}/${maxRetries}`);

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
              transactionHash,
              userAddress,
              packageAmount,
            }),
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Verification failed');
        }

        const result = await response.json();
        console.log(`✅ Verification successful on attempt ${attempt}`);
        return result;
      } catch (error) {
        console.error(`❌ Verification attempt ${attempt} failed:`, error.message);

        const isRetryable = error.name === 'AbortError' ||
                           error.message.includes('Load failed') ||
                           error.message.includes('network') ||
                           error.message.includes('fetch');

        if (isRetryable && attempt < maxRetries) {
          console.log(`⏳ Waiting 3 seconds before retry...`);
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

    if (!state.canChangeTeam) {
      alert('⚠️ You have already selected a team today!\n\nYou can change your team tomorrow at 00:00.');
      return;
    }

    try {
      setState(prev => ({ ...prev, isProcessing: true }));

      const result = await updateTeamSelection(address, team);

      if (!result.success) {
        throw new Error(result.error || 'Failed to update team');
      }

      const teamData = await getUserTeamSelection(address);

      setState(prev => ({
        ...prev,
        selectedTeam: teamData.team,
        canChangeTeam: teamData.canChange,
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
    setCompletedPhases(prev => ({ ...prev, 1: true }));
    setCurrentPhase(2);
  };

  // Phase Navigation
  const handlePhaseClick = (phase) => {
    // Can only go to a phase if previous phases are complete
    if (phase === 1) {
      setCurrentPhase(1);
    } else if (phase === 2 && completedPhases[1]) {
      setCurrentPhase(2);
    } else if (phase === 3 && completedPhases[1] && completedPhases[2]) {
      setCurrentPhase(3);
    } else if (phase === 4 && completedPhases[1] && completedPhases[2] && completedPhases[3]) {
      setCurrentPhase(4);
    } else {
      // Show warning about completing previous phases
      const missingPhases = [];
      if (!completedPhases[1]) missingPhases.push('Agreement');
      if (!completedPhases[2] && phase > 2) missingPhases.push('Connect Wallet');
      if (!completedPhases[3] && phase > 3) missingPhases.push('Game Mode & Team');

      if (missingPhases.length > 0) {
        alert(`Please complete the following first:\n- ${missingPhases.join('\n- ')}`);
      }
    }
  };

  // Next Phase Handler
  const handleNextPhase = () => {
    if (currentPhase === 1) {
      if (!agreementAccepted) {
        alert('Please accept the Terms & Conditions first');
        return;
      }
      setCurrentPhase(2);
    } else if (currentPhase === 2) {
      if (!isConnected) {
        alert('Please connect your wallet first');
        return;
      }
      setCurrentPhase(3);
    } else if (currentPhase === 3) {
      if (!state.selectedTeam) {
        alert('Please select a team first');
        return;
      }
      setCurrentPhase(4);
    }
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

  // Timeline Component
  const Timeline = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 10px',
      marginBottom: '20px',
      width: '100%',
      maxWidth: '600px'
    }}>
      {[1, 2, 3, 4].map((phase, index) => (
        <div key={phase} style={{ display: 'flex', alignItems: 'center', flex: index < 3 ? 1 : 'none' }}>
          {/* Phase Circle */}
          <div
            onClick={() => handlePhaseClick(phase)}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              background: completedPhases[phase]
                ? 'linear-gradient(135deg, #10B981, #059669)'
                : currentPhase === phase
                  ? 'linear-gradient(135deg, #FFD700, #B8860B)'
                  : '#1F1F2E',
              border: completedPhases[phase]
                ? '3px solid #10B981'
                : currentPhase === phase
                  ? '3px solid #FFD700'
                  : '3px solid #3D3D5C',
              boxShadow: currentPhase === phase
                ? '0 0 20px rgba(255, 215, 0, 0.5)'
                : completedPhases[phase]
                  ? '0 0 15px rgba(16, 185, 129, 0.4)'
                  : 'none',
              position: 'relative'
            }}
          >
            {completedPhases[phase] ? (
              <span style={{ color: '#fff', fontSize: '20px' }}>✓</span>
            ) : (
              <span style={{
                color: currentPhase === phase ? '#000' : '#888',
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                {phase}
              </span>
            )}
          </div>

          {/* Phase Label */}
          <div style={{
            position: 'absolute',
            marginTop: '70px',
            fontSize: '10px',
            color: currentPhase === phase ? '#FFD700' : '#888',
            textAlign: 'center',
            width: '50px',
            fontWeight: currentPhase === phase ? 'bold' : 'normal'
          }}>
            Phase
          </div>

          {/* Connecting Line */}
          {index < 3 && (
            <div style={{
              flex: 1,
              height: '3px',
              background: completedPhases[phase]
                ? 'linear-gradient(90deg, #10B981, #10B981)'
                : '#3D3D5C',
              margin: '0 5px',
              transition: 'background 0.3s ease'
            }} />
          )}
        </div>
      ))}
    </div>
  );

  // Credits Display Component
  const CreditsDisplay = () => (
    <div style={{
      position: 'absolute',
      top: '15px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'linear-gradient(180deg, #1A1A2E 0%, #16162A 100%)',
      border: '2px solid rgba(255, 215, 0, 0.3)',
      borderRadius: '12px',
      padding: '10px 25px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      zIndex: 10
    }}>
      <span style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>Your Credits</span>
      <span style={{ color: '#FFD700', fontSize: '28px', fontWeight: 'bold' }}>{state.credits}</span>
      <span style={{ color: '#4ADE80', fontSize: '11px' }}>
        {bnbBalanceData?.formatted ? `${parseFloat(bnbBalanceData.formatted).toFixed(4)} BNB` : '0.0075 BNB'}
      </span>
    </div>
  );

  // Wallet Display Component
  const WalletDisplay = () => {
    if (!isConnected) return null;

    return (
      <div style={{
        position: 'absolute',
        top: '15px',
        right: '15px',
        background: 'linear-gradient(180deg, #1A1A2E 0%, #16162A 100%)',
        border: '2px solid rgba(255, 215, 0, 0.3)',
        borderRadius: '12px',
        padding: '8px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 10
      }}>
        <span style={{ color: '#FFD700', fontSize: '13px', fontWeight: '500' }}>
          {bnbBalanceData?.formatted ? `${parseFloat(bnbBalanceData.formatted).toFixed(3)} BNB` : '0 BNB'}
        </span>
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFD700, #B8860B)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{ fontSize: '12px' }}>⚡</span>
        </div>
        <span style={{ color: '#888', fontSize: '12px' }}>
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
      </div>
    );
  };

  // Phase 1: Agreement Content
  const Phase1Content = () => (
    <div style={{
      width: '100%',
      maxWidth: '700px',
      background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
      borderRadius: '16px',
      border: '2px solid rgba(100, 100, 120, 0.3)',
      padding: '25px',
      marginTop: '30px'
    }}>
      {/* Scrollable Agreement Text */}
      <div style={{
        height: '300px',
        overflowY: 'auto',
        background: '#0D0D14',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid rgba(100, 100, 120, 0.2)',
        scrollbarWidth: 'thin',
        scrollbarColor: '#3D3D5C #0D0D14'
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
  );

  // Phase 2: Connect Wallet Content
  const Phase2Content = () => (
    <div style={{
      width: '100%',
      maxWidth: '500px',
      background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
      borderRadius: '16px',
      border: '2px solid rgba(100, 100, 120, 0.3)',
      padding: '30px',
      marginTop: '30px',
      textAlign: 'center'
    }}>
      {/* Connect Wallet Button */}
      <div style={{ marginBottom: '25px' }}>
        <ConnectButton
          label="Connect Wallet"
          accountStatus={{
            smallScreen: 'avatar',
            largeScreen: 'full',
          }}
          chainStatus="icon"
          showBalance={{
            smallScreen: false,
            largeScreen: true,
          }}
        />
      </div>

      {/* Connection Status */}
      {connectionStatus === 'connecting' && (
        <div style={{
          padding: '15px',
          background: 'rgba(255, 193, 7, 0.1)',
          border: '1px solid rgba(255, 193, 7, 0.3)',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <p style={{ color: '#FFC107', fontSize: '13px', margin: 0 }}>
            ⏳ Connecting wallet...
          </p>
        </div>
      )}

      {/* Wrong Network Warning */}
      {showWrongNetwork && (
        <div style={{
          padding: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <p style={{ color: '#EF4444', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>
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
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Switch to BSC
          </button>
        </div>
      )}

      {/* Info Box */}
      <div style={{
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '25px'
      }}>
        <p style={{ color: '#C4C4C4', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>
          Connect your MetaMask or Trust Wallet to continue. Make sure you are connected to the BNB Smart Chain (BSC) network.
        </p>
      </div>

      {/* Next Button */}
      {isConnected && !showWrongNetwork && (
        <button
          onClick={handleNextPhase}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '15px',
            background: 'linear-gradient(135deg, #FFD700, #B8860B)',
            border: 'none',
            borderRadius: '10px',
            color: '#000',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          Next
          <span style={{ fontSize: '20px' }}>→</span>
        </button>
      )}
    </div>
  );

  // Phase 3: Game Mode & Team Selection
  const Phase3Content = () => (
    <div style={{
      width: '100%',
      maxWidth: '550px',
      background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
      borderRadius: '16px',
      border: '2px solid rgba(100, 100, 120, 0.3)',
      padding: '25px',
      marginTop: '30px'
    }}>
      {/* Game Mode Selection */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{
          color: '#fff',
          fontSize: '16px',
          marginBottom: '15px',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}>
          🎮 Select Game Mode
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          {/* Classic Race */}
          <div
            onClick={() => setState(prev => ({ ...prev, gameMode: 'classic' }))}
            style={{
              padding: '20px 15px',
              background: state.gameMode === 'classic'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.2))'
                : 'rgba(45, 45, 70, 0.5)',
              border: state.gameMode === 'classic'
                ? '2px solid #10B981'
                : '2px solid rgba(100, 100, 120, 0.3)',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🏎️</div>
            <p style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>CLASSIC RACE</p>
            <p style={{ color: '#888', fontSize: '11px', marginBottom: '8px' }}>Normal scoring</p>
            <p style={{ color: '#10B981', fontSize: '12px', fontWeight: '600' }}>1 Credit</p>
            {state.gameMode === 'classic' && (
              <p style={{ color: '#10B981', fontSize: '11px', marginTop: '5px' }}>✓ Selected</p>
            )}
          </div>

          {/* Double or Nothing */}
          <div
            onClick={() => setState(prev => ({ ...prev, gameMode: 'doubleOrNothing' }))}
            style={{
              padding: '20px 15px',
              background: state.gameMode === 'doubleOrNothing'
                ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.3), rgba(202, 138, 4, 0.2))'
                : 'rgba(45, 45, 70, 0.5)',
              border: state.gameMode === 'doubleOrNothing'
                ? '2px solid #EAB308'
                : '2px solid rgba(100, 100, 120, 0.3)',
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>🎰</div>
            <p style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>DOUBLE OR NOTHING</p>
            <p style={{ color: '#888', fontSize: '11px', marginBottom: '8px' }}>2X score or 0!</p>
            <p style={{ color: '#EAB308', fontSize: '12px', fontWeight: '600' }}>2 Credits</p>
            {state.gameMode === 'doubleOrNothing' && (
              <p style={{ color: '#EAB308', fontSize: '11px', marginTop: '5px' }}>✓ Selected</p>
            )}
          </div>
        </div>

        {/* Game Mode Info */}
        <div style={{
          marginTop: '15px',
          padding: '12px',
          background: state.gameMode === 'classic' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(234, 179, 8, 0.1)',
          border: `1px solid ${state.gameMode === 'classic' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <p style={{
            color: state.gameMode === 'classic' ? '#10B981' : '#EAB308',
            fontSize: '12px',
            margin: 0
          }}>
            {state.gameMode === 'classic'
              ? '🏎️ Classic Mode: Your score is saved as normal.'
              : '🎰 Double or Nothing: Reach Level 5 for 2X score, or score becomes 0!'
            }
          </p>
        </div>
      </div>

      {/* Team Selection */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{
          color: '#fff',
          fontSize: '16px',
          marginBottom: '15px',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}>
          ⚔️ Select Your Team (Daily)
        </h3>

        {state.selectedTeam && !state.canChangeTeam ? (
          <div style={{
            padding: '20px',
            background: state.selectedTeam === 'blue'
              ? 'rgba(59, 130, 246, 0.2)'
              : 'rgba(239, 68, 68, 0.2)',
            border: `2px solid ${state.selectedTeam === 'blue' ? '#3B82F6' : '#EF4444'}`,
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>
              {state.selectedTeam === 'blue' ? '🔵' : '🔴'}
            </div>
            <p style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
              {state.selectedTeam.toUpperCase()} TEAM
            </p>
            <p style={{ color: '#888', fontSize: '11px' }}>✅ Selected for today</p>
            <p style={{ color: '#666', fontSize: '10px', marginTop: '10px' }}>
              You can change your team tomorrow at 00:00
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            {/* Blue Team */}
            <div
              onClick={() => handleSelectTeam('blue')}
              style={{
                padding: '20px',
                background: state.selectedTeam === 'blue'
                  ? 'rgba(59, 130, 246, 0.3)'
                  : 'rgba(45, 45, 70, 0.5)',
                border: state.selectedTeam === 'blue'
                  ? '2px solid #3B82F6'
                  : '2px solid rgba(100, 100, 120, 0.3)',
                borderRadius: '12px',
                cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                opacity: state.isProcessing ? 0.5 : 1,
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔵</div>
              <p style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>BLUE TEAM</p>
              {state.selectedTeam === 'blue' && (
                <p style={{ color: '#3B82F6', fontSize: '11px', marginTop: '5px' }}>✓ Selected</p>
              )}
            </div>

            {/* Red Team */}
            <div
              onClick={() => handleSelectTeam('red')}
              style={{
                padding: '20px',
                background: state.selectedTeam === 'red'
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(45, 45, 70, 0.5)',
                border: state.selectedTeam === 'red'
                  ? '2px solid #EF4444'
                  : '2px solid rgba(100, 100, 120, 0.3)',
                borderRadius: '12px',
                cursor: state.isProcessing ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                opacity: state.isProcessing ? 0.5 : 1,
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔴</div>
              <p style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>RED TEAM</p>
              {state.selectedTeam === 'red' && (
                <p style={{ color: '#EF4444', fontSize: '11px', marginTop: '5px' }}>✓ Selected</p>
              )}
            </div>
          </div>
        )}

        {/* Team Info */}
        <div style={{
          marginTop: '15px',
          padding: '12px',
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#EAB308', fontSize: '12px', margin: 0 }}>
            🏆 Win bonus: Team with highest daily score gets +3 credits!
          </p>
        </div>
      </div>

      {/* Next Button */}
      <button
        onClick={handleNextPhase}
        disabled={!state.selectedTeam || state.isProcessing}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          width: '100%',
          padding: '15px',
          background: state.selectedTeam && !state.isProcessing
            ? 'linear-gradient(135deg, #FFD700, #B8860B)'
            : '#3D3D5C',
          border: 'none',
          borderRadius: '10px',
          color: state.selectedTeam && !state.isProcessing ? '#000' : '#666',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: state.selectedTeam && !state.isProcessing ? 'pointer' : 'not-allowed',
          transition: 'all 0.3s ease'
        }}
      >
        Next
        <span style={{ fontSize: '20px' }}>→</span>
      </button>
    </div>
  );

  // Phase 4: Purchase & Start Game
  const Phase4Content = () => (
    <div style={{
      width: '100%',
      maxWidth: '500px',
      background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
      borderRadius: '16px',
      border: '2px solid rgba(100, 100, 120, 0.3)',
      padding: '25px',
      marginTop: '30px'
    }}>
      {/* Credit Package Selection */}
      <h3 style={{
        color: '#fff',
        fontSize: '18px',
        marginBottom: '20px',
        textAlign: 'center'
      }}>
        Select Credit Package
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[1, 5, 10].map((amount) => (
          <div
            key={amount}
            onClick={() => !state.isProcessing && handleSelectTicket(amount)}
            style={{
              padding: '20px 10px',
              background: state.selectedPackage === amount
                ? 'linear-gradient(135deg, #FFD700, #B8860B)'
                : 'rgba(45, 45, 70, 0.5)',
              border: state.selectedPackage === amount
                ? '2px solid #FFD700'
                : '2px solid rgba(100, 100, 120, 0.3)',
              borderRadius: '12px',
              cursor: state.isProcessing ? 'not-allowed' : 'pointer',
              textAlign: 'center',
              opacity: state.isProcessing ? 0.5 : 1,
              transition: 'all 0.3s ease',
              transform: state.selectedPackage === amount ? 'scale(1.05)' : 'scale(1)'
            }}
          >
            <p style={{
              color: state.selectedPackage === amount ? '#000' : '#fff',
              fontSize: '28px',
              fontWeight: 'bold',
              marginBottom: '5px'
            }}>
              {amount}
            </p>
            <p style={{
              color: state.selectedPackage === amount ? '#000' : '#888',
              fontSize: '11px',
              marginBottom: '8px'
            }}>
              credit{amount > 1 ? 's' : ''}
            </p>
            <p style={{
              color: state.selectedPackage === amount ? '#000' : '#10B981',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              {PRICING_BNB[amount]} BNB
            </p>
          </div>
        ))}
      </div>

      {/* Or Purchase More */}
      {state.credits > 0 && (
        <p style={{
          color: '#888',
          fontSize: '13px',
          textAlign: 'center',
          marginBottom: '15px'
        }}>
          Or purchase more credits:
        </p>
      )}

      {/* Purchase Button */}
      {state.selectedPackage && (
        <button
          onClick={handlePurchaseAndStart}
          disabled={state.isProcessing}
          style={{
            width: '100%',
            padding: '14px',
            background: state.isProcessing ? '#3D3D5C' : 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
            border: 'none',
            borderRadius: '10px',
            color: state.isProcessing ? '#666' : '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: state.isProcessing ? 'not-allowed' : 'pointer',
            marginBottom: '15px',
            transition: 'all 0.3s ease'
          }}
        >
          {state.isProcessing ? '⏳ Processing...' : 'Select a Package to Purchase'}
        </button>
      )}

      {/* Pending Transaction */}
      {state.pendingTxHash && (
        <div style={{
          padding: '15px',
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          borderRadius: '8px',
          marginBottom: '15px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#EAB308', fontSize: '12px', marginBottom: '10px' }}>
            {state.isProcessing ? '⏳ Waiting for confirmation...' : '⚠️ Pending transaction'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {isMobileDevice() && (
              <button
                onClick={() => openWalletOnMobile()}
                style={{
                  padding: '8px 15px',
                  background: '#3B82F6',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
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
                fontSize: '12px',
                cursor: state.isProcessing ? 'not-allowed' : 'pointer'
              }}
            >
              Check Status
            </button>
          </div>
        </div>
      )}

      {/* Credits Info */}
      <div style={{
        padding: '15px',
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '8px',
        marginBottom: '15px',
        textAlign: 'center'
      }}>
        <p style={{ color: '#10B981', fontSize: '14px', margin: 0 }}>
          Connected! You have <strong>{state.credits}</strong> credits
        </p>
      </div>

      {/* START GAME Button */}
      <button
        onClick={handleStartGameWithCredits}
        disabled={state.credits < 1 || state.isProcessing || !state.selectedTeam}
        style={{
          width: '100%',
          padding: '18px',
          background: state.credits >= 1 && !state.isProcessing && state.selectedTeam
            ? 'linear-gradient(135deg, #10B981, #059669)'
            : '#3D3D5C',
          border: 'none',
          borderRadius: '12px',
          color: state.credits >= 1 && !state.isProcessing && state.selectedTeam ? '#fff' : '#666',
          fontSize: '18px',
          fontWeight: 'bold',
          cursor: state.credits >= 1 && !state.isProcessing && state.selectedTeam ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          transition: 'all 0.3s ease',
          boxShadow: state.credits >= 1 && !state.isProcessing && state.selectedTeam
            ? '0 0 30px rgba(16, 185, 129, 0.4)'
            : 'none'
        }}
      >
        <span style={{ fontSize: '20px' }}>▶</span>
        START GAME
      </button>

      {/* Status Message */}
      <p style={{
        color: '#888',
        fontSize: '12px',
        textAlign: 'center',
        marginTop: '15px'
      }}>
        {state.statusMessage}
      </p>
    </div>
  );

  // Render
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0D0D12',
        overflowY: 'auto',
        zIndex: 9999,
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch'
      }}
    >
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
          <p style={{
            color: '#fff',
            fontSize: '16px',
            fontWeight: 'bold',
            margin: 0,
            letterSpacing: '2px'
          }}>
            LUMEXIA
          </p>
          <p style={{ color: '#888', fontSize: '10px', margin: 0 }}>$LMX</p>
        </div>
      </div>

      {/* Credits Display - only show after phase 1 */}
      {completedPhases[1] && <CreditsDisplay />}

      {/* Wallet Display */}
      <WalletDisplay />

      {/* Main Content */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: '100vh',
        padding: '100px 20px 40px',
        boxSizing: 'border-box'
      }}>
        {/* Timeline */}
        <Timeline />

        {/* Phase Content */}
        {currentPhase === 1 && <Phase1Content />}
        {currentPhase === 2 && <Phase2Content />}
        {currentPhase === 3 && <Phase3Content />}
        {currentPhase === 4 && <Phase4Content />}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #0D0D14;
        }
        ::-webkit-scrollbar-thumb {
          background: #3D3D5C;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #5D5D8C;
        }
      `}</style>
    </div>
  );
};

export default RealLauncherUI;
