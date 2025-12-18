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
        padding: '40px 20px'
      }}>

        {/* Title */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          marginBottom: '30px'
        }}>
          <span style={{ fontSize: '48px' }}>💥</span>
          <h1 style={{
            fontSize: '42px',
            fontWeight: '900',
            color: '#fff',
            letterSpacing: '4px',
            margin: 0,
            textShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
            fontFamily: "'Inter', sans-serif"
          }}>
            YOU CRASHED
          </h1>
          <span style={{ fontSize: '48px' }}>💥</span>
        </div>

        {/* Main Card */}
        <div style={{
          width: '100%',
          maxWidth: '450px',
          background: 'linear-gradient(180deg, #1A1A2E 0%, #12121F 100%)',
          borderRadius: '20px',
          border: '2px solid rgba(100, 100, 120, 0.3)',
          padding: '30px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}>

          {/* Score Display */}
          <div style={{
            padding: '25px',
            borderRadius: '16px',
            marginBottom: '25px',
            textAlign: 'center',
            background: gameMode === 'doubleOrNothing'
              ? reachedLevel5
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.1))'
              : 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(184, 134, 11, 0.1))',
            border: gameMode === 'doubleOrNothing'
              ? reachedLevel5
                ? '2px solid rgba(16, 185, 129, 0.4)'
                : '2px solid rgba(239, 68, 68, 0.4)'
              : '2px solid rgba(255, 215, 0, 0.3)'
          }}>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '2px' }}>
              FINAL SCORE
            </p>
            <p style={{
              fontSize: '56px',
              fontWeight: '900',
              margin: '0',
              color: gameMode === 'doubleOrNothing' && !reachedLevel5
                ? '#EF4444'
                : gameMode === 'doubleOrNothing' && reachedLevel5
                  ? '#10B981'
                  : '#FFD700',
              textShadow: gameMode === 'doubleOrNothing' && !reachedLevel5
                ? '0 0 30px rgba(239, 68, 68, 0.5)'
                : gameMode === 'doubleOrNothing' && reachedLevel5
                  ? '0 0 30px rgba(16, 185, 129, 0.5)'
                  : '0 0 30px rgba(255, 215, 0, 0.5)'
            }}>
              {finalScore}
            </p>

            {/* Double or Nothing Mode Info */}
            {gameMode === 'doubleOrNothing' && (
              <div style={{
                marginTop: '15px',
                padding: '12px',
                borderRadius: '8px',
                background: reachedLevel5
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${reachedLevel5 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {reachedLevel5 ? (
                  <>
                    <p style={{ color: '#10B981', fontSize: '14px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
                      🎰 DOUBLE OR NOTHING: SUCCESS!
                    </p>
                    <p style={{ color: '#6EE7B7', fontSize: '12px', margin: 0 }}>
                      Level 5 reached! Original: {Math.floor(score)} → 2X = {finalScore}
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#EF4444', fontSize: '14px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
                      🎰 DOUBLE OR NOTHING: FAILED!
                    </p>
                    <p style={{ color: '#FCA5A5', fontSize: '12px', margin: 0 }}>
                      Did not reach Level 5. Score: 0
                    </p>
                  </>
                )}
              </div>
            )}

            {gameMode === 'classic' && (
              <p style={{
                color: '#FFD700',
                fontSize: '12px',
                marginTop: '10px',
                marginBottom: 0
              }}>
                ⭐ Play more to score More ⭐
              </p>
            )}
          </div>

          {/* Statistics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '15px',
            marginBottom: '25px'
          }}>
            <div style={{
              padding: '18px',
              background: 'rgba(45, 45, 70, 0.4)',
              borderRadius: '12px',
              border: '1px solid rgba(100, 100, 120, 0.2)',
              textAlign: 'center'
            }}>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase' }}>Distance</p>
              <p style={{ color: '#60A5FA', fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
                {Math.floor(totalDistance)}m
              </p>
            </div>
            <div style={{
              padding: '18px',
              background: 'rgba(45, 45, 70, 0.4)',
              borderRadius: '12px',
              border: '1px solid rgba(100, 100, 120, 0.2)',
              textAlign: 'center'
            }}>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase' }}>Near Misses</p>
              <p style={{ color: '#A78BFA', fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
                {nearMissCount}
              </p>
            </div>
          </div>

          {/* Database Save Status */}
          <div style={{
            padding: '14px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: saveStatus === 'saved'
              ? 'rgba(16, 185, 129, 0.15)'
              : saveStatus === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
            border: `1px solid ${
              saveStatus === 'saved'
                ? 'rgba(16, 185, 129, 0.3)'
                : saveStatus === 'error'
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(59, 130, 246, 0.3)'
            }`
          }}>
            {saveStatus === 'saved' && (
              <>
                <span style={{ color: '#10B981', fontSize: '16px' }}>✓</span>
                <span style={{ color: '#6EE7B7', fontSize: '13px' }}>Score saved to database!</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <span style={{ color: '#60A5FA', fontSize: '14px' }}>⏳</span>
                <span style={{ color: '#93C5FD', fontSize: '13px' }}>Saving score...</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span style={{ color: '#EF4444', fontSize: '16px' }}>✗</span>
                <span style={{ color: '#FCA5A5', fontSize: '13px' }}>{errorMessage || 'Failed to save score'}</span>
              </>
            )}
          </div>

          {/* Credits Info */}
          <div style={{
            textAlign: 'center',
            marginBottom: '25px'
          }}>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Remaining Credits</p>
            <p style={{
              fontSize: '32px',
              fontWeight: 'bold',
              margin: 0,
              color: credits > 0 ? '#FFD700' : '#EF4444'
            }}>
              {credits}
            </p>
          </div>

          {/* Anti-Cheat Warning */}
          <div style={{
            padding: '15px',
            borderRadius: '12px',
            marginBottom: '25px',
            background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.08), rgba(184, 134, 11, 0.05))',
            border: '1px solid rgba(255, 215, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '15px'
          }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#FFD700', fontSize: '13px', fontWeight: '600', margin: '0 0 4px 0' }}>
                Fair Play Protected
              </p>
              <p style={{ color: '#B8860B', fontSize: '11px', margin: 0 }}>
                All scores are verified on-chain. Cheaters will be detected.
              </p>
            </div>
            <span style={{ fontSize: '24px' }}>⚔️</span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* RACE AGAIN */}
            <button
              onClick={credits > 0 ? onRestart : undefined}
              disabled={credits <= 0}
              style={{
                width: '100%',
                padding: '18px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: credits > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.3s ease',
                background: credits > 0
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : '#3D3D5C',
                color: credits > 0 ? '#fff' : '#666',
                boxShadow: credits > 0 ? '0 0 25px rgba(16, 185, 129, 0.4)' : 'none'
              }}
            >
              <span>🏁</span>
              RACE AGAIN
              {credits <= 0 && <span style={{ fontSize: '12px' }}>(No Credits)</span>}
            </button>

            {/* CHECK SCORES */}
            <button
              onClick={() => window.open('https://lumexia.net', '_blank')}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.3s ease',
                background: 'linear-gradient(135deg, #FFD700, #B8860B)',
                color: '#000'
              }}
            >
              <span>🏆</span>
              CHECK SCORES
            </button>

            {/* MAIN MENU */}
            <button
              onClick={onMainMenu}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid rgba(100, 100, 120, 0.4)',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                transition: 'all 0.3s ease',
                background: 'rgba(45, 45, 70, 0.5)',
                color: '#C4C4C4'
              }}
            >
              <span>🏠</span>
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameOverUI;
