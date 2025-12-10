import { useState, useEffect, useRef } from 'react';
import { useAccount, useBalance, useConfig, useSwitchChain, useChainId } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  initiateBNBPayment,
  waitForPaymentConfirmation,
  hasEnoughBalance,
  getBSCScanLink,
  isMobileDevice,
  openWalletOnMobile
} from '../utils/realWallet';
import { getOrCreateUser, getUserTeamSelection, updateTeamSelection } from '../utils/supabaseClient';
import { PRICING } from '../wagmi.config';

const RealLauncherUI = ({ onStartGame }) => {
  const { address, isConnected, status: connectionStatus } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const config = useConfig();

  // Track mounting to prevent strict mode double-firing issues
  const isMounted = useRef(false);

  // Track connection attempts for mobile debugging
  const connectionAttemptRef = useRef(0);

  // Debounced Network Check
  const [showWrongNetwork, setShowWrongNetwork] = useState(false);

  useEffect(() => {
    let timeoutId;
    if (isConnected && chainId && chainId !== bscTestnet.id) {
      // Delay showing wrong network to allow mobile wallet to settle connection
      timeoutId = setTimeout(() => {
        setShowWrongNetwork(true);
        console.log('⚠️ Network check: Wrong network detected (after delay)');
        // Auto-request switch after delay
        try {
          switchChain({ chainId: bscTestnet.id });
        } catch (e) {
          console.error("Auto-switch failed:", e);
        }
      }, 1500); // 1.5s delay
    } else {
      setShowWrongNetwork(false);
    }
    return () => clearTimeout(timeoutId);
  }, [isConnected, chainId, switchChain]);


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
      pendingTxHash: null, // New: track pending hash for mobile backgrounding
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
  // Using multiple events for iOS Safari compatibility
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
      // iOS Safari specific: fired when page becomes visible (even from cache)
      console.log('📱 Page shown (pageshow event), persisted:', event.persisted);
      await handleAppForeground();
    };

    const handleAppForeground = async () => {
      // Check if wallet connection was established while in background
      if (isConnected && address) {
        console.log('✅ Wallet connected:', address);

        // Reload user data to ensure sync
        await loadUserData(address);
      }

      // Resume Pending Transaction Check
      if (state.pendingTxHash && state.isProcessing) {
        console.log('⏳ Resuming check for pending TX:', state.pendingTxHash);
        await checkPendingTransaction(state.pendingTxHash);
      }
    };

    // Use multiple events for maximum iOS Safari compatibility
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

  const { data: balanceData } = useBalance({
    address: address,
    chainId: bscTestnet.id,
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
      // Wait a bit for UI to settle, then check
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

    const bnbAmount = PRICING[amount];
    setState(prev => ({
      ...prev,
      selectedPackage: amount,
      statusMessage: `Selected: ${amount} credits for ${bnbAmount} BNB`
    }));
  };

  // Helper to process transaction result
  const processTransactionResult = async (hash, address, packageAmount) => {
    try {
      setState(prev => ({
        ...prev,
        statusMessage: '⏳ Verifying payment on blockchain...',
        lastTransaction: hash,
        pendingTxHash: hash // Mark as pending so we can resume if backgrounded
      }));

      // Wait for confirmation (Robust polling method)
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
        pendingTxHash: null, // Clear pending flag
        statusMessage: `✅ Payment successful! +${packageAmount} credits`
      }));

      // Show success message with transaction link
      alert(
        `✅ Payment Successful!\n\n` +
        `Credits added: ${packageAmount}\n` +
        `New balance: ${verifyResult.credits} credits\n\n` +
        `View transaction:\n${getBSCScanLink(hash)}\n\n` +
        `Click "START GAME" to begin racing!`
      );

    } catch (error) {
      console.error('❌ Processing failed:', error);

      // Determine if this is a timeout error (tx might still be pending)
      const isTimeoutError = error.message?.includes('timed out') ||
                             error.message?.includes('still be processing');

      setState(prev => ({
        ...prev,
        isProcessing: false, // Always stop spinner
        // Keep pendingTxHash only if it's a timeout (allows manual retry)
        pendingTxHash: isTimeoutError ? prev.pendingTxHash : null,
        statusMessage: `❌ ${error.message}`
      }));

      // Clear localStorage only if it's not a timeout
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

  // New: Check specific pending transaction (Resumed from background)
  const checkPendingTransaction = async (hash) => {
    if (!hash || !state.selectedPackage) return;

    // Prevent multiple simultaneous checks for the same transaction
    if (state.isProcessing) {
      console.log("⚠️ Already checking transaction, ignoring duplicate call");
      return;
    }

    console.log("Checking pending transaction...", hash);
    await processTransactionResult(hash, address, state.selectedPackage);
  };

  // Purchase & Start Game Handler (Optimized for iOS Safari)
  const handlePurchaseAndStart = async () => {
    if (!state.selectedPackage) {
      alert('Please select a ticket first');
      return;
    }

    if (!isConnected || !address) {
      alert('Please connect wallet first');
      return;
    }

    // Check balance
    const currentBalance = balanceData?.formatted || '0';
    if (!hasEnoughBalance(currentBalance, state.selectedPackage)) {
      const required = PRICING[state.selectedPackage];
      alert(
        `❌ Insufficient BNB!\n\n` +
        `Required: ${required} BNB + gas fees\n` +
        `Your balance: ${currentBalance} BNB\n\n` +
        `Get test BNB from: https://www.bnbchain.org/en/testnet-faucet`
      );
      return;
    }

    // Prevent double-click
    if (state.isProcessing) {
      console.log('⚠️ Already processing, ignoring click');
      return;
    }

    const isMobile = isMobileDevice();

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        statusMessage: isMobile
          ? '⏳ Opening wallet... Confirm in MetaMask'
          : '⏳ Opening wallet... Please confirm in your wallet app'
      }));

      console.log('📱 Preparing to open wallet...', { isMobile });
      console.log('📱 Package:', state.selectedPackage, 'Address:', address);

      // Step 1: Initiate Transaction (Send only)
      // IMPORTANT: This will open MetaMask app on mobile (with deep link)
      // Now with retry logic and mobile deep linking built-in
      const hash = await initiateBNBPayment(config, address, state.selectedPackage);

      console.log('✅ Payment initiated, hash:', hash);

      // CRITICAL: Save hash IMMEDIATELY to state (which triggers localStorage save)
      // This ensures we don't lose the hash when switching to MetaMask app
      setState(prev => ({
        ...prev,
        pendingTxHash: hash,
        lastTransaction: hash,
        statusMessage: isMobile
          ? '⏳ Transaction sent! Check your wallet...'
          : '⏳ Transaction sent! Waiting for blockchain confirmation...'
      }));

      console.log('📱 Hash saved, now processing confirmation...');

      // Step 2: Process Confirmation (Separate step)
      // This might be interrupted if user switches to MetaMask
      await processTransactionResult(hash, address, state.selectedPackage);

    } catch (error) {
      console.error('❌ Payment initiation failed:', error);

      let errorMessage = 'Payment failed';
      let showOpenWalletHint = false;

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message?.includes('insufficient')) {
        errorMessage = 'Insufficient BNB balance';
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
        // On mobile, if generic error, suggest opening wallet manually
        if (isMobile) {
          showOpenWalletHint = true;
        }
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        pendingTxHash: null, // Clear pending on error
        statusMessage: `❌ ${errorMessage}`
      }));

      // Clear localStorage on error
      localStorage.removeItem('lumexia-pending-tx');

      if (isMobile && showOpenWalletHint) {
        alert(
          `❌ Payment Failed\n\n${errorMessage}\n\n` +
          `💡 Tip: Open your MetaMask app manually and check for pending transactions.`
        );
      } else {
        alert(`❌ Payment Failed\n\n${errorMessage}`);
      }
    }
  };

  // Verify payment via Supabase Edge Function (with timeout and retry)
  const verifyPaymentOnChain = async (transactionHash, userAddress, packageAmount, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Frontend verification attempt ${attempt}/${maxRetries}`);

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
              packageAmount
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

        // If aborted (timeout) or network error, retry
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

      // Reload team data
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

  // Start game with existing credits (no purchase needed)
  const handleStartGameWithCredits = () => {
    if (!isConnected || !address) {
      alert('Please connect wallet first');
      return;
    }

    // Credit requirement based on game mode
    const requiredCredits = state.gameMode === 'doubleOrNothing' ? 2 : 1;

    if (state.credits < requiredCredits) {
      if (state.gameMode === 'doubleOrNothing') {
        alert('⚠️ Double or Nothing requires 2 credits!\n\nYou need at least 2 credits to play this mode. Please purchase more credits or switch to Classic Race mode.');
      } else {
        alert('You need at least 1 credit to start the game. Please purchase credits first.');
      }
      return;
    }

    // ⚠️ TEAM SELECTION IS MANDATORY
    if (!state.selectedTeam) {
      alert('⚠️ Team Selection Required!\n\nPlease select Blue Team or Red Team before starting the game.');
      return;
    }

    // Start game immediately with current credits
    onStartGame({
      walletAddress: address,
      credits: state.credits,
      selectedTeam: state.selectedTeam, // Pass team to game
      gameMode: state.gameMode // Pass game mode to game
    });
  };

  // Render
  return (
    <div
      className="fixed inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-black overflow-y-auto"
      style={{
        zIndex: 9999,
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-500"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 py-8">

        {/* Logo */}
        <div className="mb-6 sm:mb-8 flex items-center gap-2 sm:gap-3">
          <i className="fas fa-bolt text-yellow-400 text-3xl sm:text-5xl drop-shadow-lg animate-pulse"></i>
          <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-wider drop-shadow-2xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            LUMEXIA
          </h1>
        </div>

        {/* Glassmorphism Card */}
        <div className="w-full max-w-md backdrop-blur-lg bg-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl border border-white/20">

          {/* Wallet Connect Button */}
          <div className="mb-6">
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

            {/* Connection Status Indicator */}
            {connectionStatus === 'connecting' && (
              <div className="mt-3 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg animate-pulse">
                <p className="text-yellow-200 text-xs text-center font-semibold">
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Connecting wallet...
                </p>
                <p className="text-yellow-300 text-xs text-center mt-2">
                  Click "Connect" in your MetaMask app
                </p>
              </div>
            )}

            {/* Mobile Connection Helper */}
            {!isConnected && connectionStatus !== 'connecting' && (
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-200 text-xs text-center">
                  💡 On mobile, open your MetaMask app and click "Connect". <br />
                  Then return to this app.
                </p>
              </div>
            )}
          </div>

          {/* Wrong Network Warning */}
          {showWrongNetwork ? (
            <div className="mb-6 p-6 bg-red-900/50 rounded-xl border border-red-500 text-center animate-pulse">
              <i className="fas fa-exclamation-triangle text-3xl text-red-500 mb-3"></i>
              <h3 className="text-xl font-bold text-white mb-2">Wrong Network!</h3>
              <p className="text-gray-300 mb-4">Please switch to BSC Testnet to continue playing.</p>
              <button
                onClick={() => switchChain({ chainId: bscTestnet.id })}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors shadow-lg"
              >
                Switch Network (BSC Testnet)
              </button>
            </div>
          ) : (
            <>
              {/* Game Mode Selection */}
              {isConnected && (
                <div className="mb-6">
                  <h3 className="text-white text-lg font-semibold mb-3 text-center">
                    🎮 Select Game Mode
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Classic Race */}
                    <button
                      onClick={() => setState(prev => ({ ...prev, gameMode: 'classic' }))}
                      disabled={state.isProcessing}
                      className={`p-4 rounded-xl transition-all duration-300 border-2 ${
                        state.gameMode === 'classic'
                          ? 'bg-green-500/30 border-green-400 scale-105'
                          : 'bg-green-500/10 border-green-400/30 hover:bg-green-500/20 hover:border-green-400/50'
                      } ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">🏎️</div>
                        <p className="text-white font-bold text-sm">CLASSIC RACE</p>
                        <p className="text-gray-300 text-xs mt-1">Normal scoring</p>
                        <p className="text-green-400 text-xs mt-1 font-semibold">1 Credit</p>
                        {state.gameMode === 'classic' && (
                          <p className="text-green-300 text-xs mt-1">✓ Selected</p>
                        )}
                      </div>
                    </button>

                    {/* Double or Nothing */}
                    <button
                      onClick={() => setState(prev => ({ ...prev, gameMode: 'doubleOrNothing' }))}
                      disabled={state.isProcessing}
                      className={`p-4 rounded-xl transition-all duration-300 border-2 ${
                        state.gameMode === 'doubleOrNothing'
                          ? 'bg-yellow-500/30 border-yellow-400 scale-105'
                          : 'bg-yellow-500/10 border-yellow-400/30 hover:bg-yellow-500/20 hover:border-yellow-400/50'
                      } ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">🎰</div>
                        <p className="text-white font-bold text-sm">DOUBLE OR NOTHING</p>
                        <p className="text-gray-300 text-xs mt-1">2X score or 0!</p>
                        <p className="text-yellow-400 text-xs mt-1 font-semibold">2 Credits</p>
                        {state.gameMode === 'doubleOrNothing' && (
                          <p className="text-yellow-300 text-xs mt-1">✓ Selected</p>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* Game Mode Info */}
                  <div className={`mt-3 p-3 rounded-lg border ${
                    state.gameMode === 'classic'
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-yellow-500/10 border-yellow-500/30'
                  }`}>
                    {state.gameMode === 'classic' ? (
                      <p className="text-green-200 text-xs text-center">
                        🏎️ Classic Mode: Your score is saved as normal.
                      </p>
                    ) : (
                      <p className="text-yellow-200 text-xs text-center">
                        🎰 Double or Nothing: Reach Level 5 for 2X score, or score becomes 0!
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Team Selection - MANDATORY */}
              {isConnected && (
                <div className="mb-6">
                  <h3 className="text-white text-lg font-semibold mb-3 text-center">
                    ⚔️ Select Your Team (Daily)
                  </h3>

                  {state.selectedTeam && !state.canChangeTeam ? (
                    // Already selected today - Show current team
                    <div className={`p-4 rounded-xl border-2 text-center ${
                      state.selectedTeam === 'blue'
                        ? 'bg-blue-500/20 border-blue-400'
                        : 'bg-red-500/20 border-red-400'
                    }`}>
                      <div className="text-2xl mb-2">
                        {state.selectedTeam === 'blue' ? '🔵' : '🔴'}
                      </div>
                      <p className="text-white font-bold text-lg mb-1">
                        {state.selectedTeam.toUpperCase()} TEAM
                      </p>
                      <p className="text-gray-300 text-xs">
                        ✅ Selected for today
                      </p>
                      <p className="text-gray-400 text-xs mt-2">
                        You can change your team tomorrow at 00:00
                      </p>
                    </div>
                  ) : (
                    // Can select - Show both options
                    <div className="grid grid-cols-2 gap-3">
                      {/* Blue Team */}
                      <button
                        onClick={() => handleSelectTeam('blue')}
                        disabled={state.isProcessing}
                        className={`p-4 rounded-xl transition-all duration-300 border-2 ${
                          state.selectedTeam === 'blue'
                            ? 'bg-blue-500/30 border-blue-400 scale-105'
                            : 'bg-blue-500/10 border-blue-400/30 hover:bg-blue-500/20 hover:border-blue-400/50'
                        } ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="text-center">
                          <div className="text-4xl mb-2">🔵</div>
                          <p className="text-white font-bold text-sm">BLUE TEAM</p>
                          {state.selectedTeam === 'blue' && (
                            <p className="text-blue-300 text-xs mt-1">✓ Selected</p>
                          )}
                        </div>
                      </button>

                      {/* Red Team */}
                      <button
                        onClick={() => handleSelectTeam('red')}
                        disabled={state.isProcessing}
                        className={`p-4 rounded-xl transition-all duration-300 border-2 ${
                          state.selectedTeam === 'red'
                            ? 'bg-red-500/30 border-red-400 scale-105'
                            : 'bg-red-500/10 border-red-400/30 hover:bg-red-500/20 hover:border-red-400/50'
                        } ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="text-center">
                          <div className="text-4xl mb-2">🔴</div>
                          <p className="text-white font-bold text-sm">RED TEAM</p>
                          {state.selectedTeam === 'red' && (
                            <p className="text-red-300 text-xs mt-1">✓ Selected</p>
                          )}
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Team Info */}
                  <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-200 text-xs text-center">
                      🏆 Win bonus: Team with highest daily score gets +3 credits!
                    </p>
                  </div>
                </div>
              )}

              {/* Credit Display */}
              {isConnected && (
                <div className="mb-6 p-4 bg-gradient-to-r from-purple-500/30 to-indigo-500/30 rounded-xl border border-purple-400/30">
                  <div className="text-center">
                    <p className="text-gray-300 text-sm mb-1">Your Credits</p>
                    <p className="text-4xl font-bold text-white">{state.credits}</p>
                    <p className="text-gray-400 text-xs mt-1">
                      Balance: {balanceData?.formatted ? `${parseFloat(balanceData.formatted).toFixed(4)} BNB` : '0 BNB'}
                    </p>
                  </div>
                </div>
              )}

              {/* Ticket Packages */}
              <div className="mb-6">
                <h3 className="text-white text-lg font-semibold mb-4 text-center">Select Credit Package</h3>
                <div className="grid grid-cols-3 gap-3">
                  {[1, 5, 10].map((amount) => (
                    <TicketCard
                      key={amount}
                      amount={amount}
                      bnbPrice={PRICING[amount]}
                      selected={state.selectedPackage === amount}
                      onClick={() => handleSelectTicket(amount)}
                      disabled={!isConnected || state.isProcessing}
                    />
                  ))}
                </div>
              </div>

              {/* MANUAL CHECK BUTTON - Visible only when pending */}
              {state.pendingTxHash && (
                <div className="mb-6 p-4 bg-orange-500/20 border border-orange-500/50 rounded-xl text-center">
                  <div className="flex items-center justify-center mb-2">
                    {state.isProcessing ? (
                      <i className="fas fa-spinner fa-spin mr-2 text-orange-400"></i>
                    ) : (
                      <i className="fas fa-clock mr-2 text-orange-400"></i>
                    )}
                    <p className="text-orange-200 text-sm font-semibold">
                      {state.isProcessing ? 'Waiting for transaction confirmation...' : 'Pending transaction'}
                    </p>
                  </div>
                  <p className="text-xs text-gray-300 mb-3">
                    💡 If you confirmed payment in MetaMask, click the button below to check status.
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    TX Hash: {state.pendingTxHash.slice(0, 10)}...{state.pendingTxHash.slice(-8)}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {/* Open Wallet Button - Mobile Only */}
                    {isMobileDevice() && (
                      <button
                         onClick={() => {
                           openWalletOnMobile();
                         }}
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-lg transition-colors"
                      >
                        <i className="fas fa-wallet mr-2"></i>
                        Open Wallet
                      </button>
                    )}
                    <button
                       onClick={() => {
                         setState(prev => ({ ...prev, isProcessing: true }));
                         checkPendingTransaction(state.pendingTxHash);
                       }}
                       disabled={state.isProcessing}
                       className={`px-4 py-2 text-white text-sm font-bold rounded-lg shadow-lg transition-colors ${
                         state.isProcessing
                           ? 'bg-gray-600 cursor-not-allowed'
                           : 'bg-orange-600 hover:bg-orange-700'
                       }`}
                    >
                      <i className="fas fa-check-circle mr-2"></i>
                      Check Status
                    </button>
                    <button
                       onClick={() => {
                         if (confirm('Are you sure you want to cancel the transaction?\n\nNote: If the payment was already made on blockchain, credits may not be added to your account.')) {
                           setState(prev => ({
                             ...prev,
                             isProcessing: false,
                             pendingTxHash: null,
                             selectedPackage: null,
                             statusMessage: 'Transaction cancelled'
                           }));
                           localStorage.removeItem('lumexia-pending-tx');
                         }
                       }}
                       className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-lg transition-colors"
                    >
                      <i className="fas fa-times-circle mr-2"></i>
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    {isMobileDevice()
                      ? '📱 If wallet doesn\'t open, click "Open Wallet" button'
                      : 'Transaction usually confirms within 5-30 seconds'}
                  </p>
                  {/* BSCScan Link */}
                  <a
                    href={getBSCScanLink(state.pendingTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    View on BSCScan →
                  </a>
                </div>
              )}

              {/* Action Buttons */}
              {isConnected && state.credits > 0 ? (
                <>
                  {/* Start Game Button (when user has credits) */}
                  <button
                    onClick={handleStartGameWithCredits}
                    disabled={state.isProcessing}
                    className={`w-full py-5 rounded-xl font-bold text-xl transition-all duration-300 mb-4 ${
                      state.isProcessing
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-2xl transform hover:-translate-y-1 animate-pulse'
                    }`}
                  >
                    {state.isProcessing ? (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-spinner fa-spin"></i>
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fas fa-play-circle"></i>
                        START GAME
                      </span>
                    )}
                  </button>

                  {/* Purchase More Credits Section */}
                  <div className="text-center mb-3">
                    <p className="text-gray-400 text-sm">Or purchase more credits:</p>
                  </div>
                  <button
                    onClick={handlePurchaseAndStart}
                    disabled={!state.selectedPackage || state.isProcessing}
                    className={`w-full py-3 rounded-xl font-semibold text-base transition-all duration-300 ${
                      !state.selectedPackage || state.isProcessing
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                    }`}
                  >
                    {!state.selectedPackage ? 'Select a Package to Purchase' : 'Purchase Credits'}
                  </button>

                </>
              ) : (
                /* Purchase & Start Button (when user has NO credits) */
                <button
                  onClick={handlePurchaseAndStart}
                  disabled={!isConnected || !state.selectedPackage || state.isProcessing}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
                    !isConnected || !state.selectedPackage || state.isProcessing
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                  }`}
                >
                  {state.isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="fas fa-spinner fa-spin"></i>
                      Processing...
                    </span>
                  ) : !isConnected ? (
                    'Connect Wallet First'
                  ) : !state.selectedPackage ? (
                    'Select a Package'
                  ) : (
                    `Purchase & Start Game`
                  )}
                </button>
              )}
            </>
          )}

          {/* Status Message */}
          <p className="text-center text-sm text-gray-300 mt-4">
            {state.statusMessage}
          </p>

          {/* How to start info */}
          <div className="mt-6 p-4 bg-gray-800/50 rounded-xl">
            <p className="text-gray-400 text-xs text-center mb-2">
              <i className="fas fa-info-circle mr-1"></i> How to start game:
            </p>
            <ol className="text-gray-300 text-xs space-y-1 list-decimal list-inside">
              <li>Connect your wallet (MetaMask/Trust Wallet)</li>
              <li>Select a credit package</li>
              <li>Purchase with BNB (BSC Testnet)</li>
              <li>Start racing!</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

// Ticket Card Component
const TicketCard = ({ amount, bnbPrice, selected, onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-4 rounded-xl transition-all duration-300 ${
        selected
          ? 'bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg scale-105'
          : 'bg-white/10 hover:bg-white/20 border border-white/20'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="text-center">
        <p className={`text-2xl font-bold ${selected ? 'text-black' : 'text-white'}`}>
          {amount}
        </p>
        <p className={`text-xs ${selected ? 'text-black/80' : 'text-gray-300'}`}>
          credit{amount > 1 ? 's' : ''}
        </p>
        <p className={`text-sm mt-2 font-semibold ${selected ? 'text-black' : 'text-purple-300'}`}>
          {bnbPrice} BNB
        </p>
      </div>
    </button>
  );
};

export default RealLauncherUI;
