import { useState, useEffect, useRef } from 'react';
import { useAccount, useBalance, useConfig, useSwitchChain, useChainId } from 'wagmi';
import { bscTestnet } from 'wagmi/chains';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { initiateBNBPayment, waitForPaymentConfirmation, hasEnoughBalance, getBSCScanLink } from '../utils/realWallet';
import { getOrCreateUser, getUserTeamSelection, updateTeamSelection } from '../utils/supabaseClient';
import { PRICING } from '../wagmi.config';

const RealLauncherUI = ({ onStartGame }) => {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const config = useConfig();

  // Track mounting to prevent strict mode double-firing issues
  const isMounted = useRef(false);

  const isWrongNetwork = isConnected && chainId !== bscTestnet.id;

  // State Management
  const [state, setState] = useState({
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
  });

  // Re-check connection and pending transactions when app comes to foreground
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 App returned to foreground');

        // Resume Pending Transaction Check
        if (state.pendingTxHash && state.isProcessing) {
          console.log('⏳ Resuming check for pending TX:', state.pendingTxHash);
          await checkPendingTransaction(state.pendingTxHash);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingTxHash, state.isProcessing]);

  // Force network switch check (Auto)
  useEffect(() => {
    if (isWrongNetwork) {
      console.log('Wrong network detected. Requesting switch to BSC Testnet...');
      switchChain({ chainId: bscTestnet.id });
    }
  }, [isWrongNetwork, switchChain]);

  const { data: balanceData } = useBalance({
    address: address,
    chainId: bscTestnet.id,
  });

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

      // Wait for confirmation (Robust method)
      await waitForPaymentConfirmation(config, hash);

      // Verify payment via Supabase Edge Function
      const verifyResult = await verifyPaymentOnChain(hash, address, packageAmount);

      if (!verifyResult.success) {
        throw new Error(verifyResult.error || 'Payment verification failed');
      }

      console.log('✅ Payment verified:', verifyResult);

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
      setState(prev => ({
        ...prev,
        isProcessing: false, // Stop spinner
        // We do NOT clear pendingTxHash here immediately if it was a timeout,
        // allowing user to retry check. But for general errors we clear it.
        statusMessage: `❌ ${error.message}`
      }));
      alert(`❌ Payment Processing Failed\n\n${error.message}\n\nIf you paid, use the 'Check Status' button.`);
    }
  };

  // New: Check specific pending transaction (Resumed from background)
  const checkPendingTransaction = async (hash) => {
    if (!hash || !state.selectedPackage) return;

    console.log("Checking pending transaction...", hash);
    await processTransactionResult(hash, address, state.selectedPackage);
  };

  // Purchase & Start Game Handler (Optimized)
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

    try {
      setState(prev => ({
        ...prev,
        isProcessing: true,
        statusMessage: '⏳ Opening wallet... Please confirm in your wallet app'
      }));

      // Step 1: Initiate Transaction (Send only)
      const hash = await initiateBNBPayment(config, address, state.selectedPackage);

      console.log('✅ Payment initiated, hash:', hash);

      // Step 2: Process Confirmation (Separate step)
      await processTransactionResult(hash, address, state.selectedPackage);

    } catch (error) {
      console.error('❌ Payment initiation failed:', error);

      let errorMessage = 'Payment failed';
      if (error.message.includes('rejected')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient BNB balance';
      } else {
        errorMessage = error.message;
      }

      setState(prev => ({
        ...prev,
        isProcessing: false,
        statusMessage: `❌ ${errorMessage}`
      }));

      alert(`❌ Payment Failed\n\n${errorMessage}`);
    }
  };

  // Verify payment via Supabase Edge Function
  const verifyPaymentOnChain = async (transactionHash, userAddress, packageAmount) => {
    try {
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
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Verification failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Verification error:', error);
      return { success: false, error: error.message };
    }
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

    if (state.credits < 1) {
      alert('You need at least 1 credit to start the game. Please purchase credits first.');
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
      selectedTeam: state.selectedTeam // Pass team to game
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
              accountStatus="address"
              chainStatus="icon"
              showBalance={true}
            />
          </div>

          {/* Wrong Network Warning */}
          {isWrongNetwork ? (
            <div className="mb-6 p-6 bg-red-900/50 rounded-xl border border-red-500 text-center animate-pulse">
              <i className="fas fa-exclamation-triangle text-3xl text-red-500 mb-3"></i>
              <h3 className="text-xl font-bold text-white mb-2">Yanlış Ağ!</h3>
              <p className="text-gray-300 mb-4">Lütfen oyuna devam etmek için BSC Testnet ağına geçin.</p>
              <button
                onClick={() => switchChain({ chainId: bscTestnet.id })}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors shadow-lg"
              >
                Ağı Değiştir (BSC Testnet)
              </button>
            </div>
          ) : (
            <>
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

              {/* MANUAL CHECK BUTTON - Visible only when pending and processing */}
              {state.pendingTxHash && state.isProcessing && (
                <div className="mb-6 p-4 bg-orange-500/20 border border-orange-500/50 rounded-xl text-center animate-pulse">
                  <p className="text-orange-200 text-sm mb-2">
                    Waiting for confirmation...
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    If you already paid in your wallet, click below to check status manually.
                  </p>
                  <button
                     onClick={() => checkPendingTransaction(state.pendingTxHash)}
                     className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-lg shadow-lg"
                  >
                    Check Status Now
                  </button>
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
