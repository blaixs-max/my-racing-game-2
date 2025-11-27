import { useState, useEffect } from 'react';
import { connectMockWallet, mockTokenTransfer } from '../utils/mockWallet';
import { getOrCreateUser, addCredits, logTransaction, getUserCredits } from '../utils/supabaseClient';

const LauncherUI = ({ onStartGame }) => {
  // State Management
  const [state, setState] = useState({
    walletConnected: false,
    selectedPackage: null, // 1, 5, or 10
    walletAddress: null,
    fullWalletAddress: null,
    credits: 0,
    isProcessing: false,
    statusMessage: 'Please connect wallet and select a ticket'
  });

  // Connect Wallet Handler
  const handleConnectWallet = async () => {
    if (state.walletConnected) {
      // Already connected - show info
      alert(`Wallet Connected: ${state.walletAddress}\nCredits: ${state.credits}`);
      return;
    }

    try {
      setState(prev => ({ ...prev, isProcessing: true, statusMessage: 'Connecting wallet...' }));

      // Mock wallet bağlantısı
      const walletData = await connectMockWallet();

      // Supabase'den kullanıcı bilgilerini al
      const user = await getOrCreateUser(walletData.fullAddress);

      setState(prev => ({
        ...prev,
        walletConnected: true,
        walletAddress: walletData.address,
        fullWalletAddress: walletData.fullAddress,
        credits: user.credits || 0,
        isProcessing: false,
        statusMessage: `Connected! You have ${user.credits} credits`
      }));

      console.log('✅ Wallet connected:', walletData);
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        statusMessage: 'Connection failed. Please try again.'
      }));
    }
  };

  // Ticket Selection Handler
  const handleSelectTicket = (amount) => {
    setState(prev => ({
      ...prev,
      selectedPackage: amount,
      statusMessage: state.walletConnected
        ? `Ready to purchase ${amount} credits for $${amount}`
        : 'Please connect wallet first'
    }));
  };

  // Purchase & Start Game
  const handlePurchaseAndStart = async () => {
    if (!state.selectedPackage) {
      alert('Please select a ticket first');
      return;
    }

    if (!state.walletConnected) {
      alert('Please connect wallet first');
      return;
    }

    try {
      setState(prev => ({ ...prev, isProcessing: true, statusMessage: 'Processing payment...' }));

      // Mock ödeme işlemi
      const transaction = await mockTokenTransfer(state.selectedPackage, state.fullWalletAddress);

      // Supabase'e credit ekle
      await addCredits(state.fullWalletAddress, transaction.credits, transaction.amount);

      // Transaction'ı logla
      await logTransaction(state.fullWalletAddress, transaction);

      // Yeni credit sayısını al
      const newCredits = await getUserCredits(state.fullWalletAddress);

      setState(prev => ({
        ...prev,
        credits: newCredits,
        isProcessing: false,
        statusMessage: `✅ Payment successful! +${transaction.credits} credits`
      }));

      // Success bildirimi
      setTimeout(() => {
        alert(`🎉 Payment Successful!\n\n+${transaction.credits} Credits Added\nTotal Credits: ${newCredits}\n\nReady to race!`);

        // Oyunu başlat
        if (onStartGame) {
          onStartGame({
            walletAddress: state.fullWalletAddress,
            credits: newCredits
          });
        }
      }, 500);

    } catch (error) {
      console.error('Purchase failed:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        statusMessage: '❌ Payment failed. Please try again.'
      }));
      alert('Payment failed. Please try again.');
    }
  };

  // Start Game (eğer zaten credit varsa)
  const handleStartGame = () => {
    if (state.credits < 1) {
      alert('❌ Insufficient credits!\n\nPlease purchase a ticket to play.');
      return;
    }

    if (onStartGame) {
      onStartGame({
        walletAddress: state.fullWalletAddress,
        credits: state.credits
      });
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative py-10 px-4 font-inter">
      {/* Background Elements */}
      <div className="fixed top-0 left-0 w-full h-full bg-gradient-radial from-slate-800 to-slate-900 -z-20"></div>
      <div className="fixed top-0 left-0 w-full h-full -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500 opacity-40 blur-[80px] animate-float"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-purple-500 opacity-40 blur-[80px] animate-float-delayed"></div>
      </div>

      {/* Main Container */}
      <main className="w-full max-w-5xl relative z-10">
        {/* Glass Panel */}
        <div className="bg-white/[0.03] backdrop-blur-2xl rounded-3xl p-6 md:p-12 relative overflow-hidden border border-white/10 shadow-2xl">

          {/* Header: Logo & Wallet */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6 w-full">
            {/* Logo */}
            <div className="text-center md:text-left relative flex flex-col items-center md:items-start">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-500 to-amber-700 rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-yellow-500/20 border border-yellow-400/30 transform rotate-45">
                <i className="fa-solid fa-bolt text-4xl text-white transform -rotate-45"></i>
              </div>
              <h1 className="text-3xl font-bold text-yellow-400 tracking-wider mt-4" style={{ textShadow: '0 0 10px rgba(250, 204, 21, 0.3)' }}>
                LUMEXIA
              </h1>
              <p className="text-slate-400 text-sm font-semibold tracking-[0.3em] mt-1">$LMX TOKEN</p>
            </div>

            {/* Connect Wallet Button */}
            <button
              onClick={handleConnectWallet}
              disabled={state.isProcessing}
              className={`z-50 group relative px-6 py-3 rounded-xl shadow-lg border transition-all flex items-center gap-3 ${
                state.walletConnected
                  ? 'bg-slate-800 border-green-500/30 hover:bg-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-400/50 shadow-indigo-500/30'
              } ${state.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                  state.walletConnected ? 'bg-green-400 shadow-[0_0_8px_green]' : 'bg-white shadow-[0_0_8px_white]'
                }`}
              ></div>
              <span className="font-bold text-white text-sm tracking-wide">
                {state.walletConnected ? state.walletAddress : 'Connect Wallet'}
              </span>
              <i className="fa-solid fa-wallet text-white transition-colors ml-1"></i>
            </button>
          </div>

          {/* Credits Display (if connected) */}
          {state.walletConnected && (
            <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 backdrop-blur-sm">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-coins text-yellow-400 text-2xl"></i>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Available Credits</p>
                    <p className="text-2xl font-bold text-white">{state.credits}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">1 Credit = 1 Race</p>
                </div>
              </div>
            </div>
          )}

          {/* How to Start Guide */}
          <div className="mb-10 p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm">
            <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3 text-center">
              How to start game:
            </div>
            <div className="flex flex-wrap justify-center items-center gap-4 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border ${
                  state.walletConnected ? 'bg-green-600 border-green-500' : 'bg-slate-700 border-slate-600'
                }`}>
                  1
                </span>
                <span>Connect Wallet</span>
              </div>
              <div className="hidden md:block w-12 h-px bg-slate-600/50"></div>
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border ${
                  state.selectedPackage ? 'bg-indigo-600 border-indigo-500' : 'bg-indigo-900/50 border-indigo-500/30'
                }`}>
                  2
                </span>
                <span>Select Ticket</span>
              </div>
              <div className="hidden md:block w-12 h-px bg-slate-600/50"></div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white border border-slate-600">
                  3
                </span>
                <span>Press Start</span>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="space-y-8">
            {/* Section Title */}
            <div className="text-center mb-10">
              <h2 className="text-2xl font-semibold text-white mb-2">Select Race Ticket</h2>
              <p className="text-slate-400 text-sm">Purchase tickets to enter the competitive arena.</p>
            </div>

            {/* Pricing Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* $1 Option */}
              <TicketCard
                amount={1}
                title="Rookie"
                icon="fa-ticket"
                description="1 Race Coin Purchase"
                subtitle="Single Race Entry"
                isSelected={state.selectedPackage === 1}
                onSelect={() => handleSelectTicket(1)}
              />

              {/* $5 Option */}
              <TicketCard
                amount={5}
                title="Pro Racer"
                icon="fa-layer-group"
                description="5 Race Coin Purchase"
                subtitle="5 Race Bundle + XP Boost"
                isSelected={state.selectedPackage === 5}
                onSelect={() => handleSelectTicket(5)}
                isBestValue={true}
                iconColor="indigo"
              />

              {/* $10 Option */}
              <TicketCard
                amount={10}
                title="Legend"
                icon="fa-crown"
                description="10 Race Coin Purchase"
                subtitle="10 Race Bundle + VIP Access"
                isSelected={state.selectedPackage === 10}
                onSelect={() => handleSelectTicket(10)}
                iconColor="purple"
              />
            </div>

            {/* Action Area */}
            <div className="mt-12 pt-8 border-t border-white/10 flex flex-col items-center gap-4">
              <button
                onClick={state.credits > 0 ? handleStartGame : handlePurchaseAndStart}
                disabled={!state.selectedPackage || state.isProcessing}
                className={`w-full md:w-2/3 py-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xl shadow-lg shadow-indigo-500/30 transition-all transform active:scale-95 relative overflow-hidden ${
                  !state.selectedPackage || state.isProcessing
                    ? 'opacity-40 cursor-not-allowed'
                    : 'opacity-100 hover:shadow-indigo-500/60 hover:-translate-y-1 cursor-pointer'
                }`}
              >
                {state.isProcessing ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin mr-2"></i>
                    PROCESSING...
                  </>
                ) : state.credits > 0 ? (
                  'START GAME'
                ) : (
                  `PURCHASE & START ($${state.selectedPackage || '?'})`
                )}
              </button>
              <p className={`text-sm font-medium h-5 transition-colors ${
                state.statusMessage.includes('✅') ? 'text-green-400' :
                state.statusMessage.includes('❌') ? 'text-red-400' :
                state.statusMessage.includes('Ready') ? 'text-green-400' :
                'text-slate-500'
              }`}>
                {state.statusMessage}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-8 text-slate-500 text-xs flex justify-center gap-4">
          <span>
            <i className="fa-brands fa-ethereum mr-1"></i> BSC Network (Mock)
          </span>
          <span>•</span>
          <span>Secure Web3 Payment</span>
        </div>
      </main>

      {/* Custom animations in style tag */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, 50px); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, -50px); }
        }
        .animate-float {
          animation: float 10s infinite ease-in-out;
        }
        .animate-float-delayed {
          animation: float-delayed 10s infinite ease-in-out;
          animation-delay: -5s;
        }
      `}</style>
    </div>
  );
};

// ==================== TICKET CARD COMPONENT ====================
const TicketCard = ({ amount, title, icon, description, subtitle, isSelected, onSelect, isBestValue, iconColor = 'slate' }) => {
  const iconColorClasses = {
    slate: 'bg-slate-800 text-slate-300 group-hover:text-indigo-400',
    indigo: 'bg-indigo-900/40 text-indigo-400 group-hover:text-white',
    purple: 'bg-purple-900/30 text-purple-400 group-hover:text-purple-300'
  };

  return (
    <div
      onClick={onSelect}
      className={`relative rounded-2xl p-6 cursor-pointer group transition-all duration-300 border ${
        isSelected
          ? 'border-indigo-500 bg-gradient-to-b from-indigo-500/20 to-indigo-500/5 shadow-[0_0_20px_rgba(99,102,241,0.3)] transform -translate-y-1'
          : 'border-white/5 bg-gradient-to-b from-white/5 to-transparent hover:border-indigo-500/50 hover:-translate-y-1'
      } ${isBestValue ? 'border-t-2 border-t-indigo-500/50' : ''}`}
    >
      {/* Best Value Badge */}
      {isBestValue && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-[0_0_15px_rgba(99,102,241,0.6)]">
          Best Value
        </div>
      )}

      {/* Check Icon */}
      <div
        className={`absolute top-4 right-4 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/50 transition-all duration-300 ${
          isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
        }`}
      >
        <i className="fa-solid fa-check text-white text-xs"></i>
      </div>

      {/* Icon */}
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${iconColorClasses[iconColor]}`}>
        <i className={`fa-solid ${icon} text-2xl`}></i>
      </div>

      {/* Title & Price */}
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <div className="text-3xl font-bold text-indigo-400 my-2">${amount}</div>

      {/* Description */}
      <p className="text-sm text-white font-medium">{description}</p>
      <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
    </div>
  );
};

export default LauncherUI;
