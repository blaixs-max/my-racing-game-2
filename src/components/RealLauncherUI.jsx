import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance, useConfig } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { sendBNBPayment, formatAddress, hasEnoughBalance, getBSCScanLink } from '../utils/realWallet';
import { getOrCreateUser, getUserCredits } from '../utils/supabaseClient';
import { PRICING } from '../wagmi.config';

const RealLauncherUI = ({ onStartGame }) => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const config = useConfig();
  const { data: balanceData } = useBalance({
    address: address,
    chainId: 97, // BSC Testnet
  });

  // State Management
  const [state, setState] = useState({
    selectedPackage: null, // 1, 5, or 10
    credits: 0,
    isProcessing: false,
    statusMessage: 'Connect your wallet to get started',
    lastTransaction: null,
  });

  // Load user credits when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      loadUserCredits(address);
    } else {
      setState(prev => ({
        ...prev,
        credits: 0,
        selectedPackage: null,
        statusMessage: 'Connect your wallet to get started'
      }));
    }
  }, [isConnected, address]);

  // Load user credits from database
  const loadUserCredits = async (walletAddress) => {
    try {
      setState(prev => ({ ...prev, isProcessing: true }));
      const user = await getOrCreateUser(walletAddress);
      setState(prev => ({
        ...prev,
        credits: user.credits || 0,
        isProcessing: false,
        statusMessage: `Connected! You have ${user.credits || 0} credits`
      }));
      console.log('✅ User loaded:', user);
    } catch (error) {
      console.error('Failed to load user:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        statusMessage: 'Failed to load credits. Please refresh.'
      }));
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

  // Purchase & Start Game Handler
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
        statusMessage: '⏳ Sending BNB payment... Please confirm in your wallet'
      }));

      // Send BNB payment to our wallet
      const txResult = await sendBNBPayment(config, address, state.selectedPackage);

      console.log('✅ Payment sent:', txResult);

      setState(prev => ({
        ...prev,
        statusMessage: '⏳ Verifying payment on blockchain...',
        lastTransaction: txResult.hash
      }));

      // Verify payment via Supabase Edge Function
      const verifyResult = await verifyPaymentOnChain(txResult.hash, address, state.selectedPackage);

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
        statusMessage: `✅ Payment successful! +${state.selectedPackage} credits`
      }));

      // Show success message with transaction link
      alert(
        `✅ Payment Successful!\n\n` +
        `Credits added: ${state.selectedPackage}\n` +
        `New balance: ${verifyResult.credits} credits\n\n` +
        `View transaction:\n${getBSCScanLink(txResult.hash)}`
      );

      // Wait 2 seconds then start game
      setTimeout(() => {
        onStartGame({
          walletAddress: address,
          credits: verifyResult.credits
        });
      }, 2000);

    } catch (error) {
      console.error('❌ Payment failed:', error);

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

    // Start game immediately with current credits
    onStartGame({
      walletAddress: address,
      credits: state.credits
    });
  };

  // Render
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-black overflow-y-auto">
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
