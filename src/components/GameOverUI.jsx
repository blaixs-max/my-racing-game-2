import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import { supabase } from '../utils/supabaseClient';

const GameOverUI = ({ score, totalDistance, nearMissCount, onRestart, onMainMenu }) => {
  const credits = useGameStore(state => state.credits);
  const walletAddress = useGameStore(state => state.walletAddress);
  const startTime = useGameStore(state => state.startTime);
  const selectedTeam = useGameStore(state => state.selectedTeam);
  const gameMode = useGameStore(state => state.gameMode);
  const reachedLevel5 = useGameStore(state => state.reachedLevel5);

  const [saveStatus, setSaveStatus] = useState('saving'); // 'saving', 'saved', 'error'
  const [errorMessage, setErrorMessage] = useState('');

  // Calculate final score based on game mode
  const calculateFinalScore = () => {
    if (gameMode === 'doubleOrNothing') {
      if (reachedLevel5) {
        return Math.floor(score * 2); // 2x score if reached Level 5
      } else {
        return 0; // 0 score if didn't reach Level 5
      }
    }
    return Math.floor(score); // Classic mode - normal score
  };

  const finalScore = calculateFinalScore();

  useEffect(() => {
    // Prevent double saving if component re-renders
    if (saveStatus !== 'saving') return;

    const saveScore = async (retryCount = 0) => {
      if (!walletAddress || !supabase) {
         setSaveStatus('error');
         setErrorMessage("System error: No wallet or database connection");
         return;
      }

      const duration = Math.floor((Date.now() - startTime) / 1000);
      console.log("Submitting Score:", finalScore, "Duration:", duration, "Mode:", gameMode);

      if (!navigator.onLine) {
        setSaveStatus('error');
        setErrorMessage("No internet connection!");
        return;
      }

      try {
        const { error } = await supabase.rpc('submit_score', {
            p_wallet: walletAddress,
            p_score: finalScore,
            p_duration: duration,
            p_distance: Math.floor(totalDistance),
            p_team: selectedTeam || 'none' // Add team parameter
        });

        if (!error) {
          setSaveStatus('saved');
          console.log("✅ Score saved successfully!");
        } else {
          console.error("Score Error:", error);
          if (retryCount < 3) {
             console.log(`Retrying... (${retryCount + 1}/3)`);
             setTimeout(() => saveScore(retryCount + 1), 2000 * (retryCount + 1));
          } else {
             setSaveStatus('error');
             setErrorMessage(error.message || "Failed to save score");
          }
        }
      } catch (error) {
        console.error("Score Exception:", error);
        if (retryCount < 3) {
           setTimeout(() => saveScore(retryCount + 1), 2000 * (retryCount + 1));
        } else {
           setSaveStatus('error');
           setErrorMessage(error.message || "Network error");
        }
      }
    };

    saveScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

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
          <div className={`mb-6 p-4 rounded-xl border text-center ${
            gameMode === 'doubleOrNothing'
              ? reachedLevel5
                ? 'bg-gradient-to-r from-green-500/30 to-emerald-500/30 border-green-400/30'
                : 'bg-gradient-to-r from-red-500/30 to-orange-500/30 border-red-400/30'
              : 'bg-gradient-to-r from-red-500/30 to-orange-500/30 border-red-400/30'
          }`}>
            <p className="text-gray-300 text-sm mb-1">FINAL SCORE</p>
            <p className={`text-5xl font-bold drop-shadow-lg ${
              gameMode === 'doubleOrNothing' && !reachedLevel5
                ? 'text-red-400'
                : gameMode === 'doubleOrNothing' && reachedLevel5
                  ? 'text-green-400'
                  : 'text-yellow-400'
            }`}>{finalScore}</p>

            {/* Double or Nothing Mode Info */}
            {gameMode === 'doubleOrNothing' && (
              <div className={`mt-3 p-2 rounded-lg ${
                reachedLevel5
                  ? 'bg-green-500/20 border border-green-400/30'
                  : 'bg-red-500/20 border border-red-400/30'
              }`}>
                {reachedLevel5 ? (
                  <>
                    <p className="text-green-300 text-sm font-bold">🎰 DOUBLE OR NOTHING: SUCCESS!</p>
                    <p className="text-green-200 text-xs mt-1">
                      Level 5 reached! Original: {Math.floor(score)} → 2X = {finalScore}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-red-300 text-sm font-bold">🎰 DOUBLE OR NOTHING: FAILED!</p>
                    <p className="text-red-200 text-xs mt-1">
                      Did not reach Level 5. Score: 0
                    </p>
                  </>
                )}
              </div>
            )}

            {gameMode === 'classic' && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-yellow-300 text-xs animate-pulse">⭐ Play more to score More ⭐</span>
              </div>
            )}
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

          {/* Database Info - Conditional Rendering */}
          <div className={`mb-6 p-3 rounded-lg border flex items-center justify-center gap-2 ${
            saveStatus === 'saved' ? 'bg-green-500/20 border-green-500/30' :
            saveStatus === 'error' ? 'bg-red-500/20 border-red-500/30' :
            'bg-blue-500/20 border-blue-500/30'
          }`}>
            {saveStatus === 'saved' && (
              <>
                <i className="fas fa-check-circle text-green-400"></i>
                <span className="text-green-200 text-sm">Score saved to database!</span>
              </>
            )}
            {saveStatus === 'saving' && (
               <>
                <i className="fas fa-spinner fa-spin text-blue-400"></i>
                <span className="text-blue-200 text-sm">Saving score...</span>
              </>
            )}
            {saveStatus === 'error' && (
               <>
                <i className="fas fa-exclamation-circle text-red-400"></i>
                <span className="text-red-200 text-sm">{errorMessage || 'Failed to save score'}</span>
              </>
            )}
          </div>

          {/* Credits Info */}
          <div className="mb-6 text-center">
            <p className="text-gray-400 text-sm mb-1">Remaining Credits</p>
            <p className={`text-3xl font-bold ${credits > 0 ? 'text-white' : 'text-red-400'}`}>
              {credits}
            </p>
          </div>

          {/* Anti-Cheat Warning */}
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/30">
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">🛡️</span>
              <div className="text-center">
                <p className="text-amber-300 text-sm font-semibold">
                  Fair Play Protected
                </p>
                <p className="text-amber-200/70 text-xs mt-1">
                  All scores are verified on-chain. Cheaters will be detected.
                </p>
              </div>
              <span className="text-2xl">⚔️</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* RACE AGAIN - Only enabled if user has credits */}
            <button
              onClick={credits > 0 ? onRestart : undefined}
              disabled={credits <= 0}
              className={`w-full py-4 rounded-xl font-bold text-xl transition-all duration-300 ${
                credits > 0
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-2xl transform hover:-translate-y-1 animate-pulse cursor-pointer'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <i className="fas fa-flag-checkered"></i>
                RACE AGAIN
                {credits <= 0 && <span className="text-sm">(No Credits)</span>}
              </span>
            </button>

            {/* CHECK SCORES - Opens Lumexia.net */}
            <button
              onClick={() => window.open('https://lumexia.net', '_blank')}
              className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
            >
              <span className="flex items-center justify-center gap-2">
                <i className="fas fa-trophy"></i>
                CHECK SCORES
              </span>
            </button>

            {/* MAIN MENU - Always available */}
            <button
              onClick={onMainMenu}
              className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
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
