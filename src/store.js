import { create } from 'zustand';
import * as THREE from 'three';
import { useCredit, getUserCredits } from './utils/supabaseClient';

// ==================== SES SİSTEMİ ====================
class AudioSystem {
  constructor() {
    this.context = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) {
      if (this.context && this.context.state === 'suspended') {
        this.context.resume();
      }
      return;
    }
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch {
      console.log('Audio not supported');
    }
  }

  playCrash() {
    if (!this.context) return;
    if (this.context.state === 'suspended') this.context.resume();

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'square';
    osc.frequency.value = 100;
    gain.gain.value = 0.5;
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.5);
    osc.stop(this.context.currentTime + 0.5);

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  }

  playNearMiss() {
    if (!this.context) return;
    if (this.context.state === 'suspended') this.context.resume();

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(this.context.destination);
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(1200, this.context.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + 0.2);
    osc.stop(this.context.currentTime + 0.2);

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  playCoin() {
    if (!this.context) return;
    if (this.context.state === 'suspended') this.context.resume();

    // Super Mario Coin Sound Synthesis (B5 -> E6)
    const now = this.context.currentTime;

    // First tone (B5 - 987.77 Hz)
    const osc1 = this.context.createOscillator();
    const gain1 = this.context.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(988, now);
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(this.context.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // Second tone (E6 - 1318.51 Hz) - slightly delayed
    const osc2 = this.context.createOscillator();
    const gain2 = this.context.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1319, now + 0.05);
    gain2.gain.setValueAtTime(0.1, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(this.context.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.35);
  }

}

export const audioSystem = new AudioSystem();

// ==================== OYUN VERİ MERKEZİ ====================
export const useGameStore = create((set, get) => ({
  gameState: 'loading', // 'loading' | 'launcher' | 'countdown' | 'playing' | 'gameOver'
  countdown: 3,
  speed: 0,
  targetSpeed: 60,
  currentX: 0,
  targetX: 0,
  score: 0,
  combo: 1,
  gameOver: false,
  enemies: [],
  coins: [],
  particles: [],
  message: "",
  cameraShake: 0,
  totalDistance: 0,
  nearMissCount: 0,
  startTime: 0, // Oyun süresi için
  currentLevel: 1,
  lastLevelUpDistance: 0,

  nitro: 100,
  maxNitro: 100,
  isNitroActive: false,
  nitroRegenRate: 5,

  selectedCar: 'default',

  // Wallet & Credit System
  walletAddress: null,
  credits: 0,

  // Team System
  selectedTeam: null, // 'blue' | 'red' | null
  teamSelectionDate: null,
  canChangeTeam: true,

  // Game Mode System
  gameMode: 'classic', // 'classic' | 'doubleOrNothing'
  reachedLevel5: false, // Track if player reached level 5 (for Double or Nothing)

  updateCounter: 0,
  lastSpawnZ: -400,

  countdownTimer: null,

  // Set game state
  setGameState: (newState) => set({ gameState: newState }),

  // Set wallet data
  setWalletData: (address, credits) => set({
    walletAddress: address,
    credits: credits
  }),

  // Set team data
  setTeamData: (team, selectionDate, canChange) => set({
    selectedTeam: team,
    teamSelectionDate: selectionDate,
    canChangeTeam: canChange
  }),

  // Set game mode
  setGameMode: (mode) => set({
    gameMode: mode,
    reachedLevel5: false
  }),

  // FIX 1: Enemy passed flag güncellemesi için yeni action
  updateEnemyPassed: (enemyId) => set((state) => ({
    enemies: state.enemies.map(e =>
      e.id === enemyId ? { ...e, passed: true } : e
    )
  })),

  startGame: async () => {
    audioSystem.init();

    const state = get();

    // ==================== CREDIT CHECK DISABLED FOR TESTING ====================
    // TODO: Re-enable before production!
    /*
    // Credit kontrolü - Oyun başlamadan önce kontrol et
    if (!state.walletAddress) {
      console.error('❌ Wallet not connected');
      alert('Please connect your wallet first!');
      return;
    }

    const requiredCredits = state.gameMode === 'doubleOrNothing' ? 2 : 1;
    if (state.credits < requiredCredits) {
      console.error('❌ Insufficient credits');
      const modeText = state.gameMode === 'doubleOrNothing' ? 'Double or Nothing requires 2 credits!' : '';
      alert(`❌ Insufficient credits!\n\n${modeText}\nPlease purchase more credits to play.`);
      set({ gameState: 'launcher' }); // Launcher'a geri dön
      return;
    }
    */
    console.log('⚠️ TESTING MODE: Credit check disabled');
    // ==================== END DISABLED SECTION ====================

    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }

    set({
      gameState: 'countdown',
      countdown: 5, // Changed from 3 to 5 for longer warmup
      speed: 0,
      targetSpeed: 0,
      score: 0,
      combo: 1,
      enemies: [],
      coins: [],
      particles: [],
      message: "",
      currentX: 0,
      targetX: 0,
      gameOver: false,
      totalDistance: 0,
      nearMissCount: 0,
      currentLevel: 1,
      lastLevelUpDistance: 0,
      roadSegments: [],
      currentRoadType: 'straight',
      nitro: 100,
      isNitroActive: false,
      updateCounter: 0,
      startTime: 0, // Reset time
      reachedLevel5: false, // Reset for Double or Nothing mode
      cameraShake: 0,
      lastSpawnZ: -400
    });

    let count = 5; // Changed from 3 to 5
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        set({ countdown: count });
      } else if (count === 0) {
        set({ countdown: "GO!" });
      } else {
        clearInterval(timer);
        // Show "GO!" for 2.5 seconds to allow shader compilation
        // This prevents the black screen/freeze when game starts
        setTimeout(async () => {
          // ==================== CREDIT DEDUCTION DISABLED FOR TESTING ====================
          // TODO: Re-enable before production!
          /*
          // Oyun başlarken credit düş (gameMode'a göre 1 veya 2 credit)
          const currentState = get();
          const creditsToDeduct = currentState.gameMode === 'doubleOrNothing' ? 2 : 1;
          try {
            console.log(`🎮 Starting race - deducting ${creditsToDeduct} credit(s)...`);
            await useCredit(currentState.walletAddress, creditsToDeduct);

            // Güncel credit sayısını al
            const newCredits = await getUserCredits(currentState.walletAddress);
            console.log(`✅ Credit deducted. Remaining: ${newCredits}`);

            set({
              gameState: 'playing',
              countdown: null,
              speed: 0,
              targetSpeed: 110,
              countdownTimer: null,
              startTime: Date.now(),
              credits: newCredits // Store'u güncelle
            });
          } catch (error) {
            console.error('❌ Credit deduction failed:', error);
            set({
              gameState: 'launcher',
              countdown: null,
              countdownTimer: null
            });
            alert('Failed to start game. Please check your credits and try again.');
          }
          */
          console.log('⚠️ TESTING MODE: Credit deduction disabled - starting game directly');
          set({
            gameState: 'playing',
            countdown: null,
            speed: 0,
            targetSpeed: 110,
            countdownTimer: null,
            startTime: Date.now()
          });
          // ==================== END DISABLED SECTION ====================
        }, 2500); // Increased from 1300ms to 2500ms for shader compilation
      }
    }, 1000);

    set({ countdownTimer: timer });
  },

  quitGame: () => {
    const state = get();
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }

    set({
      gameState: 'menu',
      gameOver: false,
      score: 0,
      speed: 0,
      targetSpeed: 110,
      currentX: 0,
      targetX: 0,
      cameraShake: 0,
      countdownTimer: null,
      particles: [],
      enemies: [],

      coins: [],
      lastSpawnZ: -400
    });
  },

  // FIX 4: Timer cleanup için
  cleanupTimer: () => {
    const state = get();
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      set({ countdownTimer: null });
    }
  },

  steer: (direction) => set((state) => {
    if (state.gameState !== 'playing') return {};
    const step = 1.25;
    let newX = state.targetX + (direction * step);
    newX = Math.max(-5.0, Math.min(5.0, newX));
    return { targetX: newX };
  }),

  activateNitro: () => set((state) => {
    if (state.gameState !== 'playing' || state.nitro <= 0) return {};
    return { isNitroActive: true };
  }),

  deactivateNitro: () => set({ isNitroActive: false }),

  collectCoin: (id) => {
    audioSystem.playCoin(); // Play coin sound
    set((state) => ({
      score: state.score + 100,
      coins: state.coins.filter(c => c.id !== id),
      message: "+100 GOLD"
    }));
    setTimeout(() => set({ message: "" }), 600);
  },

  triggerNearMiss: (position) => {
    const { combo, score, nearMissCount } = get();
    audioSystem.playNearMiss();

    const newParticles = [];
    for (let i = 0; i < 5; i++) {
      newParticles.push({
        id: Math.random(),
        type: 'spark',
        x: position.x + (Math.random() - 0.5) * 2,
        y: position.y + Math.random() * 2,
        z: position.z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 5,
        vy: Math.random() * 5,
        vz: (Math.random() - 0.5) * 5,
        life: 1.0
      });
    }

    set((state) => ({
      combo: Math.min(combo + 1, 10),
      score: score + (500 * combo),
      message: `NEAR MISS! ${combo}x`,
      nearMissCount: nearMissCount + 1,
      particles: [...state.particles, ...newParticles]
    }));

    setTimeout(() => set({ message: "" }), 600);
  },

  addExplosion: (x, y, z) => {
    const newParticles = [];
    for (let i = 0; i < 20; i++) {
      newParticles.push({
        id: Math.random(),
        type: 'explosion',
        x: x + (Math.random() - 0.5) * 2,
        y: y + Math.random() * 2,
        z: z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 10,
        vy: Math.random() * 10 + 5,
        vz: (Math.random() - 0.5) * 10,
        life: 1.0,
        size: Math.random() * 0.5 + 0.3
      });
    }
    set((state) => ({ particles: [...state.particles, ...newParticles] }));
  },

  // ==================== PERFORMANCE OPTIMIZED updateGame ====================
  updateGame: (delta) => set((state) => {
    if (state.gameState !== 'playing') return { speed: 0 };

    // Delta spike protection - max 0.1 second (100ms)
    const clampedDelta = Math.min(delta, 0.1);
    const newUpdateCounter = (state.updateCounter || 0) + 1;

    // ==================== NITRO SYSTEM ====================
    let newNitro = state.nitro;
    let newTargetSpeed = 110;
    let newIsNitroActive = state.isNitroActive;

    if (state.isNitroActive && state.nitro > 0) {
      newNitro = Math.max(0, state.nitro - clampedDelta * 25);
      newTargetSpeed = 200;
      if (newNitro <= 0) newIsNitroActive = false;
    } else {
      newNitro = Math.min(state.maxNitro, state.nitro + clampedDelta * state.nitroRegenRate);
    }

    const newSpeed = THREE.MathUtils.lerp(state.speed, newTargetSpeed, clampedDelta * 2);
    const newScore = state.score + (newSpeed * clampedDelta * 0.2);
    const newDistance = state.totalDistance + (newSpeed * clampedDelta * 0.1);

    // ==================== LEVEL SYSTEM ====================
    const newLevel = Math.floor(newDistance / 1000) + 1;
    let newLastLevelUpDistance = state.lastLevelUpDistance;
    let levelUpMessage = '';
    let newReachedLevel5 = state.reachedLevel5;

    if (newLevel > state.currentLevel) {
      levelUpMessage = `LEVEL ${newLevel}!`;
      newLastLevelUpDistance = newDistance;
      setTimeout(() => set({ message: '' }), 1500);
      if (newLevel >= 5 && !state.reachedLevel5) {
        newReachedLevel5 = true;
        if (state.gameMode === 'doubleOrNothing') {
          levelUpMessage = `LEVEL 5! 2X BONUS UNLOCKED!`;
        }
      }
    }

    const newShake = Math.max(0, state.cameraShake - clampedDelta * 5);

    // ==================== OPTIMIZED PARTICLE UPDATE ====================
    // In-place update to reduce object allocations
    const newParticles = [];
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      if (!p || typeof p.life === 'undefined') continue;
      const newLife = p.life - clampedDelta * 3;
      if (newLife > 0) {
        newParticles.push({
          id: p.id,
          type: p.type,
          x: p.x + p.vx * clampedDelta,
          y: p.y + p.vy * clampedDelta - 9.8 * clampedDelta,
          z: p.z + p.vz * clampedDelta,
          vx: p.vx,
          vy: p.vy - 9.8 * clampedDelta,
          vz: p.vz,
          life: newLife,
          size: p.size
        });
      }
    }

    // ==================== CACHED ENEMY DATA FOR COLLISION ====================
    // Pre-compute enemy positions once for O(1) lookups
    const playerZ = -2;
    const playerCurrentX = state.currentX;
    const playerLane = playerCurrentX < -2.25 ? -1 : (playerCurrentX > 2.25 ? 1 : 0);

    // Filter valid enemies once
    const validEnemies = [];
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e && typeof e.z !== 'undefined' && e.z < 50) {
        validEnemies.push(e);
      }
    }

    // Pre-compute lane occupancy for quick lookups (grid-based spatial partitioning)
    const laneOccupancy = { '-1': [], '0': [], '1': [] };
    for (let i = 0; i < validEnemies.length; i++) {
      const e = validEnemies[i];
      const laneName = String(e.lane);
      if (laneOccupancy[laneName]) {
        laneOccupancy[laneName].push(e);
      }
    }

    // ==================== OPTIMIZED ENEMY UPDATE ====================
    const newEnemies = [];
    for (let i = 0; i < validEnemies.length; i++) {
      const e = validEnemies[i];
      const distanceAheadOfPlayer = playerZ - e.z;
      const canChangeLaneNow = distanceAheadOfPlayer >= 35;

      // Reuse object properties instead of spread operator
      let newX = e.x;
      let newZ = e.z;
      let newLane = e.lane;
      let isChanging = e.isChanging;
      let targetLane = e.targetLane;
      let changeProgress = e.changeProgress;

      // Lane change initiation logic
      if (!isChanging && canChangeLaneNow && Math.random() < 0.003 * (clampedDelta * 60)) {
        const currentLane = e.lane;
        const possibleLanes = currentLane === -1 ? [0] : (currentLane === 0 ? [-1, 1] : [0]);

        // Quick lane availability check using cached data
        for (let j = 0; j < possibleLanes.length; j++) {
          const testLane = possibleLanes[j];
          const targetX = testLane * 4.5;
          const laneEnemies = laneOccupancy[String(testLane)] || [];

          let isLaneClear = true;
          for (let k = 0; k < laneEnemies.length; k++) {
            const other = laneEnemies[k];
            if (other.id !== e.id && Math.abs(other.z - e.z) < 25) {
              isLaneClear = false;
              break;
            }
          }

          const wouldBlockPlayer = testLane === playerLane && distanceAheadOfPlayer < 50;

          if (isLaneClear && !wouldBlockPlayer) {
            isChanging = true;
            targetLane = testLane;
            changeProgress = 0;
            break;
          }
        }
      }

      // Process lane change
      if (isChanging) {
        const newProgress = changeProgress + clampedDelta * 2;
        const startX = newLane * 4.5;
        const endX = targetLane * 4.5;

        // Quick collision check for target lane
        const targetLaneEnemies = laneOccupancy[String(targetLane)] || [];
        let isTargetBlocked = false;
        for (let k = 0; k < targetLaneEnemies.length; k++) {
          const other = targetLaneEnemies[k];
          if (other.id !== e.id && Math.abs(other.z - e.z) < 12) {
            isTargetBlocked = true;
            break;
          }
        }

        if (isTargetBlocked && newProgress < 0.5) {
          // Abort lane change
          isChanging = false;
          targetLane = newLane;
          newX = Math.max(-7, Math.min(7, newLane * 4.5));
          changeProgress = 0;
          newZ = e.z + (newSpeed - e.ownSpeed) * clampedDelta;
        } else if (isTargetBlocked) {
          // Pause lane change
          newX = THREE.MathUtils.lerp(startX, endX, changeProgress);
          newZ = e.z + (newSpeed - e.ownSpeed * 0.7) * clampedDelta;
        } else if (newProgress >= 1) {
          // Complete lane change
          isChanging = false;
          newLane = targetLane;
          newX = Math.max(-7, Math.min(7, targetLane * 4.5));
          changeProgress = 0;
          newZ = e.z + (newSpeed - e.ownSpeed) * clampedDelta;
        } else {
          // Continue lane change
          newX = Math.max(-7, Math.min(7, THREE.MathUtils.lerp(startX, endX, newProgress)));
          changeProgress = newProgress;
          newZ = e.z + (newSpeed - e.ownSpeed) * clampedDelta;
        }
      } else {
        // Normal driving - check for NPC ahead
        const mySpeed = e.ownSpeed;
        newZ = e.z + (newSpeed - mySpeed) * clampedDelta;

        // Quick ahead check using cached lane data
        const sameLaneEnemies = laneOccupancy[String(e.lane)] || [];
        let npcAhead = null;
        let minDist = 15;

        for (let k = 0; k < sameLaneEnemies.length; k++) {
          const other = sameLaneEnemies[k];
          if (other.id !== e.id && other.z < e.z) {
            const dist = e.z - other.z;
            if (dist < minDist) {
              minDist = dist;
              npcAhead = other;
            }
          }
        }

        if (npcAhead) {
          if (minDist >= 8 && minDist < 15 && canChangeLaneNow) {
            // Try to change lane
            const possibleLanes = e.lane === -1 ? [0] : (e.lane === 0 ? [-1, 1] : [0]);
            for (let j = 0; j < possibleLanes.length; j++) {
              const testLane = possibleLanes[j];
              const laneEnemies = laneOccupancy[String(testLane)] || [];
              let isLaneClear = true;

              for (let k = 0; k < laneEnemies.length; k++) {
                const other = laneEnemies[k];
                if (other.id !== e.id && Math.abs(other.z - e.z) < 20) {
                  isLaneClear = false;
                  break;
                }
              }

              const wouldBlockPlayer = testLane === playerLane && distanceAheadOfPlayer < 50;
              if (isLaneClear && !wouldBlockPlayer) {
                isChanging = true;
                targetLane = testLane;
                changeProgress = 0;
                break;
              }
            }
            if (!isChanging) {
              newZ = e.z + (newSpeed - npcAhead.ownSpeed) * clampedDelta;
            }
          } else if (minDist < 8) {
            newZ = e.z + (newSpeed - mySpeed * 0.5) * clampedDelta;
          } else {
            newZ = e.z + (newSpeed - npcAhead.ownSpeed) * clampedDelta;
          }
        }
      }

      // Push updated enemy (reuse object structure)
      newEnemies.push({
        id: e.id,
        x: newX,
        z: newZ,
        lane: newLane,
        speed: e.speed,
        type: e.type,
        isChanging: isChanging,
        targetLane: targetLane,
        ownSpeed: e.ownSpeed,
        passed: e.passed,
        changeProgress: changeProgress
      });
    }

    // Safety: Filter out any undefined/null coins first
    let newCoins = state.coins.filter(c => c && typeof c === 'object' && typeof c.z !== 'undefined').map(c => ({
      ...c,
      z: c.z + newSpeed * clampedDelta * 0.5
    })).filter(c => c.z < 50);

    // FIX 7: Spawn rate zamana dayalı
    let newLastSpawnZ = state.lastSpawnZ;
    const spawnPlayerZ = state.totalDistance; // Approximate player Z for spawning logic relative to distance

    // Spawn logic based on distance
    if (Math.abs(newLastSpawnZ - (-spawnPlayerZ)) > 30) {
      newLastSpawnZ = -spawnPlayerZ;

      const lanes = [-1, 0, 1];

      // ==================== ALWAYS KEEP ONE LANE OPEN (SPAWN CHECK) ====================
      // Count blocked lanes in the VISIBLE area (35m to 150m ahead of player at Z=-2)
      const countBlockedLanesForSpawn = () => {
        const allLanes = [-1, 0, 1];
        let blockedCount = 0;

        for (const lane of allLanes) {
          const laneX = lane * 4.5;
          // Check if any NPC blocks this lane in the visible range
          const isBlocked = newEnemies.some(npc => {
            if (!npc || typeof npc.x === 'undefined' || typeof npc.z === 'undefined') return false;

            const npcLaneX = npc.lane * 4.5;
            const distFromPlayer = -2 - npc.z;  // Player at Z=-2

            // Check NPCs in visible range ahead (35m to 150m)
            return Math.abs(npcLaneX - laneX) < 3.5 &&
                   distFromPlayer >= 35 &&
                   distFromPlayer <= 150;
          });

          if (isBlocked) blockedCount++;
        }
        return blockedCount;
      };

      // Only spawn if at least 1 lane will remain open
      const currentBlockedLanes = countBlockedLanesForSpawn();
      const canSpawn = currentBlockedLanes < 2;  // Allow spawn only if max 1 lane is blocked (leaving 2 open)

      const availableLanes = lanes.filter(lane => {
        // Check spawn point is clear
        const spawnPointClear = !newEnemies.some(e =>
          e && typeof e.lane !== 'undefined' && typeof e.z !== 'undefined' &&
          Math.abs(e.lane - lane) < 0.5 && Math.abs(e.z - -400) < 80
        );

        // Check if this lane is already blocked in visible area
        const laneX = lane * 4.5;
        const laneAlreadyBlocked = newEnemies.some(npc => {
          if (!npc || typeof npc.z === 'undefined') return false;
          const npcLaneX = npc.lane * 4.5;
          const distFromPlayer = -2 - npc.z;
          return Math.abs(npcLaneX - laneX) < 3.5 &&
                 distFromPlayer >= 35 &&
                 distFromPlayer <= 150;
        });

        return spawnPointClear && laneAlreadyBlocked;  // Prefer lanes that are already blocked
      });

      // If no "already blocked" lanes available, use any clear spawn point but limit total
      let finalAvailableLanes = availableLanes;
      if (finalAvailableLanes.length === 0 && canSpawn) {
        finalAvailableLanes = lanes.filter(lane => {
          return !newEnemies.some(e =>
            e && typeof e.lane !== 'undefined' && typeof e.z !== 'undefined' &&
            Math.abs(e.lane - lane) < 0.5 && Math.abs(e.z - -400) < 80
          );
        });
      }

      // Skip spawn entirely if it would block all lanes
      if (!canSpawn) {
        finalAvailableLanes = [];
      }

      if (finalAvailableLanes.length > 0) {
        const lane = finalAvailableLanes[Math.floor(Math.random() * finalAvailableLanes.length)];
        // Vehicle types for traffic
        const allowedTypes = ['truck', 'sedan', 'suv', 'sport'];

        if (allowedTypes.length > 0) {
          const type = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];

          // Level-based difficulty: +10% speed per level
          const levelSpeedMultiplier = 1 + ((newLevel - 1) * 0.1);

          let ownSpeed = 50; // Default slow speed
          if (type === 'truck') ownSpeed = (40 + Math.random() * 10) * levelSpeedMultiplier;
          else if (type === 'sedan' || type === 'suv') ownSpeed = (50 + Math.random() * 15) * levelSpeedMultiplier;
          else if (type === 'sport') ownSpeed = (65 + Math.random() * 10) * levelSpeedMultiplier;

          // Spawn X position - lane centers at -4.5, 0, +4.5
          const spawnX = Math.max(-7, Math.min(7, lane * 4.5));

          newEnemies.push({
            id: Date.now() + Math.random(), // Add random to prevent ID collisions
            x: spawnX,
            z: -400, // Spawn further away
            lane,
            speed: Math.random() * 0.5 + 0.5,
            type: type,
            isChanging: false,
            targetLane: lane,
            ownSpeed: ownSpeed,
            passed: false,
            changeProgress: 0
          });
        }
      }
    }

    // FIX 7: Coin spawn zamana dayalı (4.5x increased total)
    if (Math.random() < 0.09 * (clampedDelta * 60) && newCoins.length < 15) {
      const coinLane = Math.floor(Math.random() * 3) - 1;
      const coinX = coinLane * 4.5; // Lane centers at -4.5, 0, +4.5
      const isSafeCar = !newEnemies.some(e => e && typeof e.x !== 'undefined' && typeof e.z !== 'undefined' && Math.abs(e.x - coinX) < 2 && Math.abs(e.z - -400) < 40);
      const isSafeCoin = !newCoins.some(c => c && typeof c.x !== 'undefined' && typeof c.z !== 'undefined' && Math.abs(c.x - coinX) < 2 && Math.abs(c.z - -400) < 40);

      if (isSafeCar && isSafeCoin) {
        newCoins.push({ id: Math.random(), x: coinX, z: -400 - Math.random() * 50 });
      }
    }

    return {
      speed: newSpeed,
      score: newScore,
      totalDistance: newDistance,
      cameraShake: newShake,
      particles: newParticles,
      enemies: newEnemies,
      coins: newCoins,
      nitro: newNitro,
      isNitroActive: newIsNitroActive,
      targetSpeed: newTargetSpeed,
      lastSpawnZ: newLastSpawnZ,
      updateCounter: newUpdateCounter,
      currentLevel: newLevel,
      lastLevelUpDistance: newLastLevelUpDistance,
      reachedLevel5: newReachedLevel5,
      message: levelUpMessage || state.message
    };
  }),

  setGameOver: () => {
    const state = get();
    audioSystem.playCrash();

    state.addExplosion(state.currentX, 1, -2);

    set({
      gameOver: true,
      gameState: 'gameover',
      speed: 0,
      targetSpeed: 0,
      cameraShake: 3.0
    });
  }
}));
