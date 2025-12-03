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

  // FIX 1: Enemy passed flag güncellemesi için yeni action
  updateEnemyPassed: (enemyId) => set((state) => ({
    enemies: state.enemies.map(e =>
      e.id === enemyId ? { ...e, passed: true } : e
    )
  })),

  startGame: async () => {
    audioSystem.init();

    const state = get();

    // Credit kontrolü - Oyun başlamadan önce kontrol et
    if (!state.walletAddress) {
      console.error('❌ Wallet not connected');
      alert('Please connect your wallet first!');
      return;
    }

    if (state.credits < 1) {
      console.error('❌ Insufficient credits');
      alert('❌ Insufficient credits!\n\nPlease purchase more credits to play.');
      set({ gameState: 'launcher' }); // Launcher'a geri dön
      return;
    }

    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
    }

    set({
      gameState: 'countdown',
      countdown: 3,
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
      roadSegments: [],
      currentRoadType: 'straight',
      nitro: 100,
      isNitroActive: false,
      updateCounter: 0,
      startTime: 0, // Reset time

      cameraShake: 0,
      lastSpawnZ: -400
    });

    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        set({ countdown: count });
      } else if (count === 0) {
        set({ countdown: "GO!" });
      } else {
        clearInterval(timer);
        // Show "GO!" for longer to prevent black flash (especially on mobile)
        // This gives GPU time to compile shaders and warm up rendering pipeline
        setTimeout(async () => {
          // Oyun başlarken credit düş (1 credit = 1 race)
          const currentState = get();
          try {
            console.log('🎮 Starting race - deducting 1 credit...');
            await useCredit(currentState.walletAddress);

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
            // Hata durumunda oyunu başlatma
            set({
              gameState: 'launcher',
              countdown: null,
              countdownTimer: null
            });
            alert('Failed to start game. Please check your credits and try again.');
          }
        }, 1300); // Increased from 300ms to 1300ms for smoother transition
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

  // FIX 3: Nested set() kaldırıldı, return değeri içinde nitro kontrolü yapılıyor
  updateGame: (delta) => set((state) => {
    if (state.gameState !== 'playing') return { speed: 0 };

    // FIX 6: Delta spike koruması - maksimum 0.1 saniye (100ms)
    const clampedDelta = Math.min(delta, 0.1);

    const newUpdateCounter = (state.updateCounter || 0) + 1;

    let newNitro = state.nitro;
    let newTargetSpeed = 110;
    let newIsNitroActive = state.isNitroActive;

    if (state.isNitroActive && state.nitro > 0) {
      newNitro = Math.max(0, state.nitro - clampedDelta * 25);
      newTargetSpeed = 200; // Increased to 200 km/h

      // FIX 3: Nested set yerine state içinde güncelleme
      if (newNitro <= 0) {
        newIsNitroActive = false;
      }
    } else {
      newNitro = Math.min(state.maxNitro, state.nitro + clampedDelta * state.nitroRegenRate);
      newTargetSpeed = 110;
    }

    const newSpeed = THREE.MathUtils.lerp(state.speed, newTargetSpeed, clampedDelta * 2);
    const newScore = state.score + (newSpeed * clampedDelta * 0.2);
    const newDistance = state.totalDistance + (newSpeed * clampedDelta * 0.1);

    const newShake = Math.max(0, state.cameraShake - clampedDelta * 5);

    let newParticles = state.particles.map(p => ({
      ...p,
      x: p.x + p.vx * clampedDelta,
      y: p.y + p.vy * clampedDelta - 9.8 * clampedDelta,
      z: p.z + p.vz * clampedDelta,
      vy: p.vy - 9.8 * clampedDelta,
      life: p.life - clampedDelta * 3
    })).filter(p => p.life > 0);

    // FIX 7: Frame-rate bağımsız enemy update - zamana dayalı
    let newEnemies = state.enemies.map(e => {
      let updated = { ...e };

      // Şerit değiştirme mantığı - zamana dayalı olasılık
      if (!e.isChanging && Math.random() < 0.003 * (clampedDelta * 60)) {
        const currentLane = e.lane;
        let possibleLanes = [];

        if (currentLane === -1) {
          possibleLanes = [0];
        } else if (currentLane === 0) {
          possibleLanes = [-1, 1];
        } else if (currentLane === 1) {
          possibleLanes = [0];
        }

        const safeLanes = possibleLanes.filter(l => {
          const targetX = l * 4.5;
          const isSafe = !state.enemies.some(other =>
            other.id !== e.id &&
            Math.abs(other.x - targetX) < 3 &&
            Math.abs(other.z - e.z) < 25
          );
          return isSafe;
        });

        if (safeLanes.length > 0) {
          const newLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
          updated = {
            ...updated,
            isChanging: true,
            targetLane: newLane,
            changeProgress: 0
          };
        }
      }

      if (updated.isChanging) {
        const newProgress = updated.changeProgress + clampedDelta * 2;
        const startX = updated.lane * 4.5;
        const endX = updated.targetLane * 4.5;
        let newX = THREE.MathUtils.lerp(startX, endX, Math.min(newProgress, 1));

        // SAFETY: Clamp X position to stay within road bounds (-9 to +9)
        // Road is 20 units wide (-10 to +10), keep 1 unit margin from edges
        newX = Math.max(-9, Math.min(9, newX));

        if (newProgress >= 1) {
          // Clamp final position to road bounds
          const finalX = Math.max(-9, Math.min(9, updated.targetLane * 4.5));

          updated = {
            ...updated,
            isChanging: false,
            lane: updated.targetLane,
            x: finalX,
            changeProgress: 0,
            z: e.z + (newSpeed - e.ownSpeed) * clampedDelta // Removed 0.5 factor completely for 1:1 movement
          };
        } else {
          updated = {
            ...updated,
            x: newX,
            changeProgress: newProgress,
            z: e.z + (newSpeed - e.ownSpeed) * clampedDelta
          };
        }
      } else {
        updated.z = e.z + (newSpeed - e.ownSpeed) * clampedDelta;
      }

      return updated;
    }).filter(e => e.z < 50);

    let newCoins = state.coins.map(c => ({
      ...c,
      z: c.z + newSpeed * clampedDelta * 0.5
    })).filter(c => c.z < 50);

    // FIX 7: Spawn rate zamana dayalı
    let newLastSpawnZ = state.lastSpawnZ;
    const playerZ = state.totalDistance; // Approximate player Z for spawning logic relative to distance

    // Spawn logic based on distance
    if (Math.abs(newLastSpawnZ - (-playerZ)) > 30) {
      newLastSpawnZ = -playerZ;

      const lanes = [-1, 0, 1];
      const availableLanes = lanes.filter(lane => {
        const laneX = lane * 4.5;
        return !newEnemies.some(e =>
          Math.abs(e.lane - lane) < 0.5 && Math.abs(e.z - -400) < 80
        );
      });

      if (availableLanes.length > 0) {
        const lane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        // SYSTEMATIC DEBUGGING: Final - All Safe Vehicles (No Police)
        const allowedTypes = ['truck', 'sedan', 'suv', 'sport'];

        if (allowedTypes.length > 0) {
          const type = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];

          let ownSpeed = 50; // Default slow speed
          if (type === 'truck') ownSpeed = 40 + Math.random() * 10; // 40-50 (Very Slow)
          else if (type === 'sedan' || type === 'suv') ownSpeed = 50 + Math.random() * 15; // 50-65 (Medium)
          else if (type === 'sport') ownSpeed = 65 + Math.random() * 10; // 65-75 (Fast)

          // Clamp spawn X position to road bounds
          const spawnX = Math.max(-9, Math.min(9, lane * 4.5));

          newEnemies.push({
            id: Date.now(),
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
      const coinX = coinLane * 4.5;
      const isSafeCar = !newEnemies.some(e => Math.abs(e.x - coinX) < 2 && Math.abs(e.z - -400) < 40);
      const isSafeCoin = !newCoins.some(c => Math.abs(c.x - coinX) < 2 && Math.abs(c.z - -400) < 40);

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
      updateCounter: newUpdateCounter
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
