import React from 'react';
import { useGameStore } from '../App'; // Store'a erişim (App.jsx'ten export edilmeli veya ayrı bir store dosyasına taşınmalı, şimdilik prop olarak alalım daha güvenli)

const GameOverUI = ({ score, totalDistance, nearMissCount, onRestart, onMainMenu }) => {
  const credits = useGameStore(state => state.credits);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-black overflow-y-auto" style={{ zIndex: 9999 }}>
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-red-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-orange-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-yellow-600 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-500"></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 py-8">

        {/* Title */}
        <div className="mb-6 sm:mb-8 flex items-center gap-2 sm:gap-3">
          <span className="text-4xl sm:text-6xl animate-bounce">💥</span>
          <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-wider drop-shadow-2xl text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
            YOU CRASHED
          </h1>
          <span className="text-4xl sm:text-6xl animate-bounce">💥</span>
        </div>

        {/* Glassmorphism Card */}
        <div className="w-full max-w-md backdrop-blur-lg bg-white/10 rounded-3xl p-4 sm:p-8 shadow-2xl border border-white/20">

          {/* Score Display */}
          <div className="mb-6 p-4 bg-gradient-to-r from-red-500/30 to-orange-500/30 rounded-xl border border-red-400/30 text-center">
            <p className="text-gray-300 text-sm mb-1">FINAL SCORE</p>
            <p className="text-5xl font-bold text-yellow-400 drop-shadow-lg">{Math.floor(score)}</p>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
              <p className="text-gray-400 text-xs">Distance</p>
              <p className="text-xl font-bold text-blue-300">{Math.floor(totalDistance)}m</p>
            </div>
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-center">
              <p className="text-gray-400 text-xs">Near Misses</p>
              <p className="text-xl font-bold text-purple-300">{nearMissCount}</p>
            </div>
          </div>

          {/* Database Info */}
          <div className="mb-6 p-3 bg-green-500/20 rounded-lg border border-green-500/30 flex items-center justify-center gap-2">
            <i className="fas fa-check-circle text-green-400"></i>
            <span className="text-green-200 text-sm">Score saved to database!</span>
          </div>

          {/* Credits Info */}
          <div className="mb-6 text-center">
            <p className="text-gray-400 text-sm mb-1">Remaining Credits</p>
            <p className={`text-3xl font-bold ${credits > 0 ? 'text-white' : 'text-red-500'}`}>
              {credits}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {credits > 0 ? (
              <button
                onClick={onRestart}
                className="w-full py-4 rounded-xl font-bold text-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 animate-pulse"
              >
                <span className="flex items-center justify-center gap-2">
                  <i className="fas fa-flag-checkered"></i>
                  RACE AGAIN
                </span>
              </button>
            ) : (
              <button
                onClick={onMainMenu}
                className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-yellow-500 to-orange-600 text-white hover:from-yellow-600 hover:to-orange-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
              >
                <span className="flex items-center justify-center gap-2">
                  <i className="fas fa-shopping-cart"></i>
                  BUY CREDITS
                </span>
              </button>
            )}

            <button
              onClick={onMainMenu}
              className="w-full py-3 rounded-xl font-semibold text-base bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all duration-300"
            >
              <span className="flex items-center justify-center gap-2">
                <i className="fas fa-home"></i>
                MAIN MENU
              </span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default GameOverUI;
