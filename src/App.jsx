import React, { useRef, useEffect, useState, Suspense, useMemo, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { PerspectiveCamera, Stars, useGLTF, Instances, Instance, useProgress, useTexture, PositionalAudio } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';
import coinLogo from './assets/coin_logo.png';

// Preload 3D Models to prevent Suspense fallback (black screen) during gameplay
useGLTF.preload('/models/truck.glb');
useGLTF.preload('/models/Car 2/scene.gltf');
useGLTF.preload('/models/Car 3/scene.gltf');
useGLTF.preload('/models/ferrari.glb');

// ==================== RESPONSIVE HELPER (Debounce Eklendi) ====================
const useResponsive = () => {
  const [dimensions, setDimensions] = useState(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = Math.min(width, height) < 768;
    const isMobileDevice = isTouchDevice && isSmallScreen;

    return {
      isMobile: isMobileDevice,
      isPortrait: height > width,
      width: width,
      height: height,
      isTouchDevice: isTouchDevice
    };
  });

  useEffect(() => {
    let timeoutId = null;

    const handleResize = () => {
      // Debounce: 100ms bekle
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        // Mobil cihaz tespiti: touch desteği veya küçük ekran (kısa kenar 768'den küçük)
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = Math.min(width, height) < 768;
        const isMobileDevice = isTouchDevice && isSmallScreen;

        setDimensions({
          isMobile: isMobileDevice,
          isPortrait: height > width,
          width: width,
          height: height,
          isTouchDevice: isTouchDevice
        });
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return dimensions;
};

// ==================== ERROR BOUNDARY ====================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Game Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          flexDirection: 'column',
          gap: '20px',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ff0000', fontSize: '36px' }}>⚠️ Oyun Hatası</h1>
          <p style={{ fontSize: '18px' }}>Bir hata oluştu. Lütfen sayfayı yenileyin.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '15px 30px',
              fontSize: '18px',
              background: '#00ff00',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Yeniden Başlat
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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

const audioSystem = new AudioSystem();

// ==================== OYUN VERİ MERKEZİ ====================
const useGameStore = create((set, get) => ({
  gameState: 'menu',
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

  nitro: 100,
  maxNitro: 100,
  isNitroActive: false,
  nitroRegenRate: 5,

  selectedCar: 'default',

  roadSegments: [],
  currentRoadType: 'straight',
  roadTransition: 0,

  updateCounter: 0,
  lastSpawnZ: -400,

  countdownTimer: null,

  // FIX 1: Enemy passed flag güncellemesi için yeni action
  updateEnemyPassed: (enemyId) => set((state) => ({
    enemies: state.enemies.map(e =>
      e.id === enemyId ? { ...e, passed: true } : e
    )
  })),

  startGame: () => {
    audioSystem.init();

    const state = get();
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
        set({ gameState: 'playing', countdown: null, speed: 110, targetSpeed: 110, countdownTimer: null });
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
        const newX = THREE.MathUtils.lerp(startX, endX, Math.min(newProgress, 1));

        if (newProgress >= 1) {
          updated = {
            ...updated,
            isChanging: false,
            lane: updated.targetLane,
            x: updated.targetLane * 4.5,
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

    const difficulty = Math.min(state.score / 15000, 1.0);
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
        const typeRoll = Math.random();
        // SYSTEMATIC DEBUGGING: Final - All Safe Vehicles (No Police)
        const allowedTypes = ['truck', 'sedan', 'suv', 'sport'];
        // const allowedTypes = [];  

        if (allowedTypes.length > 0) {
          const type = allowedTypes[Math.floor(Math.random() * allowedTypes.length)];

          let ownSpeed = 50; // Default slow speed
          if (type === 'truck') ownSpeed = 40 + Math.random() * 10; // 40-50 (Very Slow)
          else if (type === 'sedan' || type === 'suv') ownSpeed = 50 + Math.random() * 15; // 50-65 (Medium)
          else if (type === 'sport') ownSpeed = 65 + Math.random() * 10; // 65-75 (Fast)

          newEnemies.push({
            id: Date.now(),
            x: lane * 4.5,
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

// ==================== PARTIKÜL SİSTEMİ ====================
const ParticleSystem = memo(() => {
  const particles = useGameStore(state => state.particles);

  return (
    <group>
      {particles.map(p => {
        const color = p.type === 'spark' ? '#ffff00' : (p.life > 0.5 ? '#ff4500' : '#333');
        const size = p.type === 'spark' ? 0.1 : (p.size || 0.3);

        return (
          <mesh key={p.id} position={[p.x, p.y, p.z]}>
            <sphereGeometry args={[size, 4, 4]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={p.life}
            />
          </mesh>
        );
      })}
    </group>
  );
});

const Coins = memo(() => {
  const coins = useGameStore(state => state.coins);

  return (
    <group>
      {coins.map(c => (
        <group key={c.id} position={[c.x, 1, c.z]}>
          <SpinningCoin />
        </group>
      ))}
    </group>
  );
});


const SpinningCoin = () => {
  const ref = useRef();
  const texture = useTexture(coinLogo);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.z += delta * 3;
    }
  });

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh ref={ref}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 32]} />
        {/* Material 0: Side (Gold) */}
        <meshStandardMaterial attach="material-0" color="#FFD700" metalness={0.9} roughness={0.1} emissive="#FFA500" emissiveIntensity={0.5} />
        {/* Material 1: Top (Logo) */}
        <meshStandardMaterial attach="material-1" map={texture} metalness={0.9} roughness={0.1} emissive="#FFD700" emissiveIntensity={0.2} />
        {/* Material 2: Bottom (Logo) */}
        <meshStandardMaterial attach="material-2" map={texture} metalness={0.9} roughness={0.1} emissive="#FFD700" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
};

Coins.displayName = 'Coins';

ParticleSystem.displayName = 'ParticleSystem';

// ==================== MOBİL KONTROLLER ====================
const MobileControls = memo(({ isLandscape = false }) => {
  const { steer, activateNitro, deactivateNitro } = useGameStore();
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startSteering = useCallback((direction) => {
    if (intervalRef.current) return;
    steer(direction);
    intervalRef.current = setInterval(() => {
      steer(direction);
    }, 50);
  }, [steer]);

  const stopSteering = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const preventAll = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, []);

  const handlers = useCallback((direction) => ({
    onTouchStart: (e) => {
      e.preventDefault();
      e.stopPropagation();
      startSteering(direction);
    },
    onTouchEnd: (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopSteering();
    },
    onTouchMove: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onTouchCancel: (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopSteering();
    },
    onContextMenu: preventAll,
    onSelectStart: preventAll,
    onDragStart: preventAll,
  }), [startSteering, stopSteering, preventAll]);

  // Landscape ve Portrait için boyutlar
  const buttonSize = (isLandscape ? 45 : 50) * 1.75; // Increased by 1.75x
  const indicatorSize = isLandscape ? 40 : 60;

  return (
    <>
      {/* Sol kontrol alanı */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: isLandscape ? '30%' : '50%',
          height: '100%',
          zIndex: 100,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto',
          background: 'transparent'
        }}
        {...handlers(-1)}
      />

      {/* Sağ kontrol alanı */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0, // FIX: Always 0 to ensure it covers the edge
          width: isLandscape ? '30%' : '50%',
          height: '100%',
          zIndex: 100,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto',
          background: 'transparent'
        }}
        {...handlers(1)}
      />

      {/* Nitro Button */}
      <div
        onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); activateNitro(); }}
        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); deactivateNitro(); }}
        onTouchCancel={(e) => { e.preventDefault(); e.stopPropagation(); deactivateNitro(); }}
        onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onContextMenu={preventAll}
        onSelectStart={preventAll}
        onDragStart={preventAll}
        style={{
          position: 'fixed',
          bottom: isLandscape ? '120px' : '220px',
          right: isLandscape ? '15px' : '15px',
          width: `${buttonSize}px`,
          height: `${buttonSize}px`,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)',
          border: '3px solid #fff',
          zIndex: 150,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isLandscape ? '8px' : '9px',
          color: '#fff',
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 5px 30px rgba(255,69,0,0.9), 0 0 20px rgba(255,69,0,0.5)',
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          animation: 'pulseNitro 1.5s ease-in-out infinite',
          pointerEvents: 'auto'
        }}
      >
        🔥<br />NITRO
      </div>

      {/* Sol yön göstergesi */}
      <div style={{
        position: 'fixed',
        bottom: isLandscape ? '15px' : '20px',
        left: isLandscape ? '15px' : '20px',
        width: `${indicatorSize}px`,
        height: `${indicatorSize}px`,
        borderRadius: '50%',
        background: 'rgba(0,255,255,0.25)',
        border: '2px solid rgba(0,255,255,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isLandscape ? '18px' : '24px',
        color: 'rgba(0,255,255,0.9)',
        pointerEvents: 'none',
        zIndex: 120,
        boxShadow: '0 2px 15px rgba(0,255,255,0.4)'
      }}>
        ◀
      </div>

      {/* Sağ yön göstergesi */}
      <div style={{
        position: 'fixed',
        bottom: isLandscape ? '15px' : '20px',
        right: isLandscape ? '15px' : '20px', // FIX: Symmetric to left button
        width: `${indicatorSize}px`,
        height: `${indicatorSize}px`,
        borderRadius: '50%',
        background: 'rgba(0,255,255,0.25)',
        border: '2px solid rgba(0,255,255,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isLandscape ? '18px' : '24px',
        color: 'rgba(0,255,255,0.9)',
        pointerEvents: 'none',
        zIndex: 120,
        boxShadow: '0 2px 15px rgba(0,255,255,0.4)'
      }}>
        ▶
      </div>

      <style>{`
        @keyframes pulseNitro {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0 5px 20px rgba(255,69,0,0.9);
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 0 8px 30px rgba(255,69,0,1);
          }
        }
      `}</style>
    </>
  );
});

MobileControls.displayName = 'MobileControls';

// ==================== HIZ GÖSTERGESİ ====================
const Speedometer = memo(({ speed }) => {
  const maxSpeed = 200;
  const angle = -135 + (speed / maxSpeed) * 270;

  const marks = useMemo(() => {
    const result = [];
    for (let i = 0; i <= maxSpeed; i += 20) {
      const markAngle = -135 + (i / maxSpeed) * 270;
      const isMajor = i % 40 === 0;
      result.push(
        <div key={`line-${i}`} style={{ position: 'absolute', bottom: '50%', left: '50%', width: isMajor ? '3px' : '2px', height: '100px', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${markAngle}deg)` }}>
          <div style={{ width: '100%', height: isMajor ? '15px' : '10px', background: i >= 140 ? '#ff3333' : '#00ff00', position: 'absolute', top: 0 }}></div>
        </div>
      );
      if (isMajor) {
        const rad = (markAngle - 90) * (Math.PI / 180);
        result.push(<div key={`num-${i}`} style={{ position: 'absolute', top: `calc(50% + ${Math.sin(rad) * 70}px)`, left: `calc(50% + ${Math.cos(rad) * 70}px)`, transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 'bold', color: i >= 140 ? '#ff3333' : '#00ff00' }}>{i}</div>);
      }
    }
    return result;
  }, [maxSpeed]);

  return (
    <div style={{ position: 'relative', width: '200px', height: '200px', background: 'radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 70%)', borderRadius: '50%', border: '5px solid #2e2e4e', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Arial' }}>
      {marks}
      <div style={{ position: 'absolute', top: '65%', textAlign: 'center' }}><div style={{ fontSize: '32px', fontWeight: 'bold', textShadow: '0 0 10px #00ff00' }}>{Math.floor(speed)}</div><div style={{ fontSize: '12px', color: '#aaa' }}>km/h</div></div>
      <div style={{ position: 'absolute', bottom: '50%', left: '50%', width: '6px', height: '85px', background: 'linear-gradient(to top, #ff3333, #ff6666)', transformOrigin: 'bottom center', transform: `translateX(-50%) rotate(${angle}deg)`, borderRadius: '50% 50% 0 0', zIndex: 2 }}></div>
      <div style={{ position: 'absolute', width: '20px', height: '20px', background: '#333', borderRadius: '50%', border: '3px solid #ff3333', zIndex: 3 }}></div>
    </div>
  );
});

Speedometer.displayName = 'Speedometer';

// ==================== OYUNCU ARABASI ====================
const VEHICLE_DIMENSIONS = {
  player: { width: 1.8, length: 5.5 }, // Increased for tighter collision
  sedan: { width: 3.0, length: 6.75, height: 2.7 }, // Scaled up by 35%
  truck: { width: 3.1, length: 8.3, height: 4.2 }, // Reduced by 8% (3.36->3.1, 9.0->8.3)
  bus: { width: 3.0, length: 8.5, height: 4.0 },
  pickup: { width: 2.4, length: 7.0, height: 2.6 },
  police: { width: 2.0, length: 4.8, height: 1.8 }, // Car 1 (Original Sedan)
  ambulance: { width: 2.8, length: 7.0, height: 3.3 },
  sport: { width: 1.9, length: 4.2, height: 1.9 }, // Sport Increased by 5% (1.8->1.9, 4.0->4.2)
  suv: { width: 2.9, length: 7.6, height: 3.8 } // SUV Reduced by 8% (3.1->2.9, 8.2->7.6)
};

useGLTF.preload('/models/ferrari.glb');
useGLTF.preload('/models/truck.glb');
useGLTF.preload('/models/sport_car.glb'); // F1 Car
useGLTF.preload('/models/tree.glb');
useGLTF.preload('/models/Car1/scene.gltf'); // Sedan replacement
useGLTF.preload('/models/Car 2/scene.gltf'); // SUV replacement
useGLTF.preload('/models/Car 3/scene.gltf'); // Pickup replacement

function CarModel({ modelPath, color, scale = 1, rotation = [0, 0, 0] }) {
  const { scene } = useGLTF(modelPath);
  const clonedScene = useMemo(() => {
    const s = scene.clone();
    s.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Tinting might not work perfectly on all models without messing up textures, 
        // but for simple coloring it can be effective. 
        // For the Ferrari model, it likely has textures so we might skip tinting or apply it carefully.
        if (color) {
          child.material.color.set(color);
        }
      }
    });
    return s;
  }, [scene, color]);

  return <primitive object={clonedScene} scale={scale} rotation={rotation} />;
}

function TreeModel({ scale = 1, rotation = [0, 0, 0] }) {
  const { scene } = useGLTF('/models/tree.glb');
  // Optimization: Simple clone is fine for small numbers, but Instances would be better.
  // For now, sticking to clone but ensuring it's efficient.
  const clonedScene = useMemo(() => {
    const s = scene.clone();
    s.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return s;
  }, [scene]);

  return <primitive object={clonedScene} scale={scale} rotation={rotation} />;
}



function PlayerCar() {
  const { targetX, enemies, coins, setGameOver, gameOver, triggerNearMiss, collectCoin, speed, selectedCar, gameState, updateEnemyPassed } = useGameStore();
  const group = useRef();
  const wheels = useRef([]);

  const [leftTarget] = useState(() => {
    const obj = new THREE.Object3D();
    obj.position.set(-0.5, -0.5, -100);
    return obj;
  });
  const [rightTarget] = useState(() => {
    const obj = new THREE.Object3D();
    obj.position.set(0.5, -0.5, -100);
    return obj;
  });

  useEffect(() => {
    if (group.current && gameState === 'playing') {
      group.current.position.set(0, 0.1, -2);
      group.current.rotation.set(0, 0, 0);
    }
  }, [gameState]);

  useFrame((state, delta) => {
    if (gameOver || !group.current) return;

    // FIX 6: Delta spike koruması
    const clampedDelta = Math.min(delta, 0.1);

    const currentX = group.current.position.x;
    const lerpSpeed = 5;
    group.current.position.x = THREE.MathUtils.lerp(currentX, targetX, clampedDelta * lerpSpeed);

    const moveDiff = (group.current.position.x - currentX) / clampedDelta;
    group.current.rotation.z = -moveDiff * 0.002;
    group.current.rotation.x = -speed * 0.0002;

    wheels.current.forEach(w => { if (w) w.rotation.x += speed * clampedDelta * 0.1; });

    const playerWidth = VEHICLE_DIMENSIONS.player.width;
    const playerLength = VEHICLE_DIMENSIONS.player.length;

    let hasCollision = false;

    // FIX 1: Near miss kontrolü ve enemy passed güncellemesi
    enemies.forEach(enemy => {
      const dx = Math.abs(group.current.position.x - enemy.x);
      const dz = Math.abs(enemy.z - (-2));

      const enemyDim = VEHICLE_DIMENSIONS[enemy.type] || VEHICLE_DIMENSIONS.sedan;

      // Add small padding to ensure visual contact is always a crash
      const COLLISION_PADDING = 0.2;
      const crashWidthThreshold = (playerWidth + enemyDim.width) / 2 + COLLISION_PADDING;
      const crashDepthThreshold = (playerLength + enemyDim.length) / 2 + COLLISION_PADDING;

      // Çarpışma kontrolü
      if (dz < crashDepthThreshold && dx < crashWidthThreshold) {
        hasCollision = true;
      }

      // Near miss için çok daha dar threshold'lar
      const nearMissWidthMin = crashWidthThreshold + 0.3;
      const nearMissWidthMax = crashWidthThreshold + 1.2;
      const nearMissDepthThreshold = crashDepthThreshold + 0.8;

      // FIX 1: Near miss - passed flag'i store'da güncelleniyor
      if (!enemy.passed &&
        dz < nearMissDepthThreshold &&
        dz >= 1.0 &&
        dx >= nearMissWidthMin &&
        dx < nearMissWidthMax) {
        updateEnemyPassed(enemy.id); // Store'da güncelle
        triggerNearMiss({ x: enemy.x, y: 1, z: enemy.z });
      }
    });

    if (hasCollision) {
      setGameOver();
    }

    coins.forEach(coin => {
      const dx = Math.abs(group.current.position.x - coin.x);
      const dz = Math.abs(coin.z - (-2));
      if (dz < 2.5 && dx < 2.0) collectCoin(coin.id);
    });
  });

  const carColors = useMemo(() => ({
    default: '#aaaaaa',
    sport: '#ff0000',
    muscle: '#000000'
  }), []);

  const materials = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ color: carColors[selectedCar] || '#aaaaaa', metalness: 0.9, roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1 }),
    neon: new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 2 }),
    tailLight: new THREE.MeshBasicMaterial({ color: 'red' }),
    wheel: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 })
  }), [selectedCar, carColors]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

  return (
    <group ref={group} position={[0, 0.1, -2]}>
      <primitive object={leftTarget} />
      <primitive object={rightTarget} />
      <spotLight position={[0.8, 0.6, -1.5]} target={rightTarget} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} />
      <spotLight position={[-0.8, 0.6, -1.5]} target={leftTarget} angle={0.3} penumbra={0.2} intensity={120} color="#fff" distance={250} />

      {/* 3D Model Replacement */}
      <group rotation={[0, 0, 0]} position={[0, 0, 0]}>
        {/* Player is now F1 Car (sport_car.glb) */}
        {/* Scaled up another 15% from 0.14 -> ~0.16 */}
        <CarModel modelPath="/models/sport_car.glb" scale={0.16} />
      </group>
    </group>
  );
}

// ==================== ALTINLAR ====================
const SingleCoin = memo(({ x, z }) => {
  const group = useRef();
  const material = useMemo(() =>
    new THREE.MeshStandardMaterial({
      color: "#FFD700",
      metalness: 0.8,
      roughness: 0.2,
      emissive: "#FFD700",
      emissiveIntensity: 0.4
    }), []
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((state, delta) => {
    // FIX 6: Delta clamp
    const clampedDelta = Math.min(delta, 0.1);
    if (group.current) group.current.rotation.y += clampedDelta * 3;
  });

  return (
    <group ref={group} position={[x, 1, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.1, 32]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
});

SingleCoin.displayName = 'SingleCoin';


Coins.displayName = 'Coins';

// ==================== TRAFİK ====================
const Traffic = memo(() => {
  const enemies = useGameStore(state => state.enemies);

  const materials = useMemo(() => ({
    truck: new THREE.MeshStandardMaterial({ color: '#335577', roughness: 0.5 }),
    container: new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.8 }),
    bus: new THREE.MeshStandardMaterial({ color: '#ddaa00', roughness: 0.5 }),
    sedan: new THREE.MeshStandardMaterial({ color: '#ccc', roughness: 0.3 }),
    police: new THREE.MeshStandardMaterial({ color: '#000', roughness: 0.3 }),
    ambulance: new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.3 }),
    sport: new THREE.MeshStandardMaterial({ color: '#ff0000', metalness: 0.8, roughness: 0.2 }),
    tailLight: new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 4 }),
    policeLight: new THREE.MeshStandardMaterial({ color: '#0000ff', emissive: '#0000ff', emissiveIntensity: 5 }),
    ambulanceLight: new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 5 })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

  return (
    <>
      {enemies.map(enemy => {
        const x = enemy.x;
        const tilt = enemy.isChanging ? (enemy.targetLane > enemy.lane ? -0.1 : 0.1) : 0;

        return (
          <group key={enemy.id} position={[x, 0, enemy.z]} rotation={[0, 0, tilt]}>
            {enemy.type === 'truck' && (
              <group rotation={[0, Math.PI, 0]}>
                {/* Truck: Reduced by 8% from 1.824 -> 1.678 */}
                <CarModel modelPath="/models/truck.glb" scale={1.678} />
              </group>
            )}
            {enemy.type === 'bus' && (
              <group rotation={[0, Math.PI, 0]}>
                {/* Bus: Fallback to Truck but longer. Scaled up another 15% */}
                <CarModel modelPath="/models/truck.glb" scale={[1.52, 1.52, 2.4]} color="#FFD700" />
              </group>
            )}
            {enemy.type === 'pickup' && (
              <group rotation={[0, Math.PI, 0]}>
                {/* Pickup: Car 3 */}
                <CarModel modelPath="/models/Car 3/scene.gltf" scale={1.0} />
              </group>
            )}
            {enemy.type === 'suv' && (
              <group rotation={[0, Math.PI, 0]}>
                {/* SUV: Car 2 - Reduced by 8% (1.66 * 0.92 = 1.527 -> 1.53) */}
                <CarModel modelPath="/models/Car 2/scene.gltf" scale={1.53} />
              </group>
            )}
            {enemy.type === 'sedan' && (
              <group rotation={[0, Math.PI, 0]}>
                {/* Sedan: Car 3 (Green Taxi/Pickup) - Scaled up by 35% */}
                <CarModel modelPath="/models/Car 3/scene.gltf" scale={1.35} />
              </group>
            )}
            {enemy.type === 'ambulance' && (
              <group rotation={[0, Math.PI, 0]}>
                <CarModel modelPath="/models/truck.glb" scale={1.52} />
              </group>
            )}
            {enemy.type === 'sport' && (
              <group rotation={[0, 0, 0]}>
                {/* Sport: Ferrari Model. Increased by 5% (1.15 * 1.05 = 1.21) */}
                <CarModel modelPath="/models/ferrari.glb" scale={1.21} />
              </group>
            )}
          </group>
        );
      })}
    </>
  );
});

Traffic.displayName = 'Traffic';

// ==================== ÇEVRE ====================
const Building = memo(({ width, height, side, type }) => {
  const isApartment = type === 'apartment';

  const materials = useMemo(() => ({
    building: new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.9 }),
    window: new THREE.MeshStandardMaterial({ color: '#ffaa44', emissive: '#ffaa44', emissiveIntensity: 3 }),
    roof: new THREE.MeshStandardMaterial({ color: '#444' })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

  const wins = useMemo(() => {
    if (!isApartment) return [];
    const w = [];
    const floors = Math.floor(height / 3);
    // Use a seeded random or deterministic pattern based on position/index if possible, 
    // but for now just move random to useMemo dependency or accept it runs once per mount.
    // Since this is inside useMemo, it's fine.
    for (let i = 1; i < floors; i++) {
      if (Math.random() > 0.75) {
        const offsetDirection = side > 0 ? -1 : 1;
        w.push([0, i * 3, offsetDirection * (width / 2 + 0.1)]);
      }
    }
    return w;
  }, [height, isApartment, side, width]);

  return (
    <group>
      <mesh position={[0, height / 2, 0]} material={materials.building}>
        <boxGeometry args={[width, height, width]} />
      </mesh>
      {wins.map((pos, i) => (
        <mesh key={i} position={pos} material={materials.window} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <planeGeometry args={[width * 0.6, 1.5]} />
        </mesh>
      ))}
      {type === 'small_house' && (
        <mesh position={[0, height + 1, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[width * 0.8, 3, 4]} />
          <primitive object={materials.roof} attach="material" />
        </mesh>
      )}
    </group>
  );
});

Building.displayName = 'Building';

const SideObjects = memo(({ side }) => {
  const { speed } = useGameStore();
  const objects = useMemo(() => new Array(20).fill(0).map((_, i) => {
    // eslint-disable-next-line
    const rand = Math.random();
    let type = 'empty', height = 0, width = 0;

    // Periodic Tunnels - REMOVED
    if (rand > 0.7) {
      type = 'tree';
      width = 2 + rand * 2;
      height = 5 + rand * 5;
    } else if (rand > 0.4) {
      type = 'building';
      width = 5 + rand * 5;
      height = 10 + rand * 20;
    }

    return { z: -i * 50, type, height, width, offset: (Math.random() - 0.5) * 20 };
  }), []);

  const groupRef = useRef();
  const itemsRef = useRef(objects);

  const treeMaterials = useMemo(() => ({
    leaves: new THREE.MeshStandardMaterial({ color: '#224422', roughness: 1 }),
    trunk: new THREE.MeshStandardMaterial({ color: '#443322', roughness: 1 })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(treeMaterials).forEach(mat => mat.dispose());
    };
  }, [treeMaterials]);

  useFrame((state, delta) => {
    // FIX 6: Delta clamp
    const clampedDelta = Math.min(delta, 0.1);

    if (groupRef.current) {
      groupRef.current.children.forEach((mesh, i) => {
        const item = itemsRef.current[i];
        item.z += speed * clampedDelta * 0.5;
        if (item.z > 20) {
          item.z = -1500;
          const rand = Math.random();
          if (rand > 0.8) { item.type = 'apartment'; item.height = 30 + Math.random() * 40; item.width = 12; }
          else if (rand > 0.5) { item.type = 'small_house'; item.height = 6; item.width = 8; }
          else if (rand > 0.2) { item.type = 'tree'; }
          else { item.type = 'empty'; }
        }
        mesh.position.z = item.z;
        mesh.visible = item.type !== 'empty';
      });
    }
  });

  return (
    <group ref={groupRef}>
      {objects.map((obj, i) => {
        return (
          <group key={i} position={[side * (45 + obj.offset), 0, obj.z]}>
            {(obj.type === 'apartment' || obj.type === 'small_house') && <Building width={obj.width} height={obj.height} side={side} type={obj.type} />}
            {obj.type === 'tree' && (
              <TreeModel scale={2.5} />
            )}
          </group>
        );
      })}
    </group>
  );
});

SideObjects.displayName = 'SideObjects';

// FIX 2: Barrier component'i dışarıya çıkarıldı
const Barrier = memo(({ x }) => {
  const barrierMaterials = useMemo(() => ({
    post: new THREE.MeshStandardMaterial({ color: '#999' }),
    rail: new THREE.MeshStandardMaterial({ color: '#B0C4DE', metalness: 0.6, roughness: 0.4 })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(barrierMaterials).forEach(mat => mat.dispose());
    };
  }, [barrierMaterials]);

  return (
    <group position={[x, 0, 0]}>
      {Array.from({ length: 40 }).map((_, i) => (
        <mesh key={i} position={[0, 0.5, -i * 10]} material={barrierMaterials.post}>
          <boxGeometry args={[0.2, 1.0, 0.2]} />
        </mesh>
      ))}
      <mesh position={[0, 0.8, -200]} material={barrierMaterials.rail}>
        <boxGeometry args={[0.3, 0.4, 1000]} />
      </mesh>
    </group>
  );
});

Barrier.displayName = 'Barrier';

// ==================== YOL VE ZEMİN ====================
function RoadEnvironment() {
  const { updateGame, speed } = useGameStore();
  const stripesRef = useRef();

  useFrame((state, delta) => {
    updateGame(delta);

    // FIX 6: Delta clamp
    const clampedDelta = Math.min(delta, 0.1);

    if (stripesRef.current) {
      stripesRef.current.children.forEach(stripe => {
        stripe.position.z += speed * clampedDelta * 0.5;
        if (stripe.position.z > 10) stripe.position.z = -200;
      });
    }
  });

  const roadMaterials = useMemo(() => ({
    road: new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.8 }),
    stripe: new THREE.MeshBasicMaterial({ color: "#fff" }),
    ground: new THREE.MeshStandardMaterial({ color: "#2e5a2e", roughness: 1.0 })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(roadMaterials).forEach(mat => mat.dispose());
    };
  }, [roadMaterials]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 1000]} />
        <primitive object={roadMaterials.road} attach="material" />
      </mesh>
      <group ref={stripesRef}>
        {[-2.25, 2.25].map((x) => Array.from({ length: 30 }).map((_, j) => (
          <mesh key={`${x}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -j * 20]}>
            <planeGeometry args={[0.25, 6]} />
            <primitive object={roadMaterials.stripe} attach="material" />
          </mesh>
        )))}
      </group>
      {/* FIX 2: Barrier artık dışarıda tanımlı */}
      <Barrier x={-10.5} />
      <Barrier x={10.5} />
      <SideObjects side={1} />
      <SideObjects side={-1} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <primitive object={roadMaterials.ground} attach="material" />
      </mesh>
    </group>
  );
}

// ==================== KAMERA SHAKE ====================
const CameraShake = memo(() => {
  const { cameraShake, gameState } = useGameStore();
  const { camera } = useThree();

  const originalPosition = useRef({
    x: 0,
    y: 4,
    z: 8
  });

  useEffect(() => {
    if (gameState === 'playing' || gameState === 'countdown') {
      camera.position.set(0, 4, 11); // Moved back from 8 to 11
      camera.rotation.set(0, 0, 0);
      originalPosition.current = { x: 0, y: 4, z: 11 };
    }
  }, [gameState, camera]);

  useFrame((state, delta) => {
    // FIX 6: Delta clamp
    const clampedDelta = Math.min(delta, 0.1);

    // Smooth Camera Follow
    const { targetX } = useGameStore.getState(); // Access current targetX directly
    const targetCameraX = targetX * 0.7; // Follow factor (0.7 means camera moves 70% as much as car)

    // Lerp current camera X towards target X
    originalPosition.current.x = THREE.MathUtils.lerp(originalPosition.current.x, targetCameraX, clampedDelta * 3);

    if (cameraShake > 0 && gameState === 'gameover') {
      // eslint-disable-next-line react-hooks/immutability
      camera.position.x = originalPosition.current.x + (Math.random() - 0.5) * cameraShake * 0.5;
      // eslint-disable-next-line react-hooks/immutability
      camera.position.y = originalPosition.current.y + (Math.random() - 0.5) * cameraShake * 0.5;
    } else {
      camera.position.x = originalPosition.current.x;
      camera.position.y = originalPosition.current.y;
    }
  });

  return null;
});

CameraShake.displayName = 'CameraShake';

// ==================== GÖKYÜZÜ ====================
const SkyEnvironment = memo(() => {
  const moonMaterial = useMemo(() =>
    new THREE.MeshBasicMaterial({ color: "#ffffff" }), []
  );

  useEffect(() => {
    return () => {
      moonMaterial.dispose();
    };
  }, [moonMaterial]);

  return (
    <group>
      <Stars radius={150} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <mesh position={[50, 80, -200]}>
        <sphereGeometry args={[10, 32, 32]} />
        <primitive object={moonMaterial} attach="material" />
      </mesh>
      <pointLight position={[50, 80, -180]} intensity={1.5} color="#aabbff" distance={500} />
    </group>
  );
});

SkyEnvironment.displayName = 'SkyEnvironment';

// ==================== SPEED LINES EFFECT ====================
const SpeedLines = memo(() => {
  const { speed } = useGameStore();
  const linesRef = useRef();

  // Create 50 lines
  const lines = useMemo(() => {
    return new Array(50).fill(0).map(() => ({
      x: (Math.random() - 0.5) * 30,
      y: (Math.random() - 0.5) * 20 + 5, // Above ground
      z: (Math.random() - 0.5) * 100 - 50,
      len: Math.random() * 10 + 5,
      speed: Math.random() * 2 + 1
    }));
  }, []);

  useFrame((state, delta) => {
    if (!linesRef.current) return;

    // Only visible above 160 km/h
    const isVisible = speed > 160;
    linesRef.current.visible = isVisible;

    if (!isVisible) return;

    const clampedDelta = Math.min(delta, 0.1);

    linesRef.current.children.forEach((line, i) => {
      const data = lines[i];
      line.position.z += speed * clampedDelta * 2; // Move fast towards camera

      if (line.position.z > 20) {
        line.position.z = -100;
        line.position.x = (Math.random() - 0.5) * 30;
        line.position.y = (Math.random() - 0.5) * 20 + 5;
      }
    });
  });

  return (
    <group ref={linesRef}>
      {lines.map((l, i) => (
        <mesh key={i} position={[l.x, l.y, l.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, l.len, 4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
});

SpeedLines.displayName = 'SpeedLines';

// ==================== SPEED BLUR OVERLAY ====================
const SpeedBlurOverlay = memo(() => {
  const { speed } = useGameStore();

  if (speed < 160) return null;

  const opacity = Math.min((speed - 160) / 40, 1); // 0 at 160, 1 at 200

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 50,
      background: 'radial-gradient(circle, transparent 40%, rgba(255,255,255,0.8) 100%)',
      opacity: opacity * 0.5, // Max 0.5 opacity
      mixBlendMode: 'overlay',
      transition: 'opacity 0.2s ease-out'
    }}>
      {/* Wind lines effect via CSS gradient */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(90deg, transparent 0, transparent 50px, rgba(255,255,255,0.1) 50px, rgba(255,255,255,0.1) 51px)',
        opacity: opacity * 0.3,
        filter: 'blur(2px)'
      }} />
    </div>
  );
});

SpeedBlurOverlay.displayName = 'SpeedBlurOverlay';

// ==================== LANDSCAPE BLOCKER - MOBİL İÇİN ====================
const LandscapeBlocker = memo(() => {
  const { isMobile, isPortrait } = useResponsive();

  if (!isMobile || isPortrait) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      textAlign: 'center',
      padding: '20px'
    }}>
      <div style={{ fontSize: '60px', marginBottom: '20px' }}>📱</div>
      <h1 style={{ fontSize: '32px', marginBottom: '20px', color: '#00ffff' }}>Lütfen Telefonunuzu Döndürün</h1>
      <p style={{ fontSize: '18px', color: '#aaa' }}>Bu oyun sadece dikey (portrait) modda oynanabilir</p>
      <div style={{
        marginTop: '30px',
        width: '80px',
        height: '120px',
        border: '4px solid #00ffff',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'rotatePhone 2s ease-in-out infinite'
      }}>
        <div style={{ fontSize: '40px' }}>📲</div>
      </div>
      <style>{`
        @keyframes rotatePhone {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(90deg); }
        }
      `}</style>
    </div>
  );
});

LandscapeBlocker.displayName = 'LandscapeBlocker';

// ==================== SHADER WARMUP ====================
// Forces shader compilation by rendering all models once invisibly
const ShaderWarmup = () => {
  return (
    <group position={[0, -50, 0]}>
      <CarModel modelPath="/models/truck.glb" scale={1.678} />
      <CarModel modelPath="/models/Car 2/scene.gltf" scale={1.53} />
      <CarModel modelPath="/models/Car 3/scene.gltf" scale={1.0} />
      <CarModel modelPath="/models/ferrari.glb" scale={1.21} />
      <SpinningCoin />
    </group>
  );
};

// ==================== AUDIO LISTENER ====================
const AudioListenerController = () => {
  const { camera } = useThree();
  useEffect(() => {
    const listener = new THREE.AudioListener();
    camera.add(listener);
    return () => camera.remove(listener);
  }, [camera]);
  return null;
};

// New GameContent component to encapsulate Canvas children
const GameContent = () => (
  <>
    <PerspectiveCamera
      makeDefault
      position={[0, 4, 11]} // Moved back from 8 to 11 to show full car
      fov={50}
    />
    <AudioListenerController />
    <ambientLight intensity={0.6} color="#ffffff" />
    <hemisphereLight skyColor="#445566" groundColor="#223344" intensity={0.6} />
    <Suspense fallback={null}>
      {/* <ShaderWarmup /> */}
      <SkyEnvironment />
      <CameraShake />
      <ParticleSystem />
      <PlayerCar />
      <Traffic />
      <Coins />
      <SpeedLines />
      <RoadEnvironment />
    </Suspense>
  </>
);

// ==================== ANA UYGULAMA ====================
function Game() {
  const {
    speed, score, message, gameOver, gameState, countdown,
    startGame, quitGame, steer, cleanupTimer,
    totalDistance, nearMissCount, nitro, maxNitro, isNitroActive,
    activateNitro, deactivateNitro
  } = useGameStore();

  const { isMobile, isPortrait } = useResponsive();
  const isLandscape = isMobile && !isPortrait;

  // FIX 4: Component unmount'ta timer cleanup
  useEffect(() => {
    return () => {
      cleanupTimer();
    };
  }, [cleanupTimer]);

  useEffect(() => {
    let metaViewport = document.querySelector('meta[name=viewport]');
    if (!metaViewport) {
      metaViewport = document.createElement('meta');
      metaViewport.name = 'viewport';
      document.head.appendChild(metaViewport);
    }
    const originalContent = metaViewport.getAttribute('content');
    metaViewport.setAttribute('content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
    );

    let metaApple = document.querySelector('meta[name=apple-mobile-web-app-capable]');
    if (!metaApple) {
      metaApple = document.createElement('meta');
      metaApple.name = 'apple-mobile-web-app-capable';
      metaApple.content = 'yes';
      document.head.appendChild(metaApple);
    }

    let metaStatus = document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]');
    if (!metaStatus) {
      metaStatus = document.createElement('meta');
      metaStatus.name = 'apple-mobile-web-app-status-bar-style';
      metaStatus.content = 'black-translucent';
      document.head.appendChild(metaStatus);
    }

    let metaMobile = document.querySelector('meta[name=mobile-web-app-capable]');
    if (!metaMobile) {
      metaMobile = document.createElement('meta');
      metaMobile.name = 'mobile-web-app-capable';
      metaMobile.content = 'yes';
      document.head.appendChild(metaMobile);
    }

    const preventScroll = (e) => {
      e.preventDefault();
      window.scrollTo(0, 0);
    };

    window.addEventListener('scroll', preventScroll, { passive: false });
    document.body.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      if (originalContent) {
        metaViewport.setAttribute('content', originalContent);
      }
      window.removeEventListener('scroll', preventScroll);
      document.body.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') steer(-1);
      if (e.key === 'ArrowRight') steer(1);
      if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault();
        activateNitro();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        deactivateNitro();
      }
    };

    const preventDefaults = (e) => {
      if (e.target.tagName !== 'BUTTON') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('contextmenu', preventDefaults);
    window.addEventListener('selectstart', preventDefaults);
    window.addEventListener('gesturestart', preventDefaults);
    window.addEventListener('gesturechange', preventDefaults);
    window.addEventListener('gestureend', preventDefaults);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('contextmenu', preventDefaults);
      window.removeEventListener('selectstart', preventDefaults);
      window.removeEventListener('gesturestart', preventDefaults);
      window.removeEventListener('gesturechange', preventDefaults);
      window.removeEventListener('gestureend', preventDefaults);
    };
  }, [gameState, steer, activateNitro, deactivateNitro]);

  const isGoldMessage = message.includes("GOLD");
  const messageColor = isGoldMessage ? '#00ffff' : '#ff0000';
  const messageShadow = isGoldMessage ? '0 0 20px #00ffff' : '0 0 30px red';

  const scoreStyle = useMemo(() => ({
    color: '#00ffff',
    textShadow: '0 0 20px #00ffff',
    fontWeight: 'bold'
  }), []);

  const handleStart = useCallback(() => {
    const elem = document.documentElement;

    const metaViewport = document.querySelector('meta[name=viewport]');
    if (metaViewport) {
      metaViewport.setAttribute('content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }

    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }

    window.scrollTo(0, 0);
    document.body.scrollTop = 0;

    startGame();
  }, [startGame]);

  // Landscape modda da oynanabilir
  // if (isMobile && !isPortrait) {
  //   return <LandscapeBlocker />;
  // }

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      background: '#0a0a15',
      overflow: 'hidden',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      touchAction: 'manipulation',
      position: 'fixed',
      top: 0,
      left: 0,
      margin: 0,
      padding: 0
    }}>
      <SpeedBlurOverlay />

      <style>{`
        * {
          user-select: none !important;
          -webkit-user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        
        body, html {
          overscroll-behavior: none;
          touch-action: manipulation;
          overflow: hidden;
          position: fixed;
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }
        
        @supports (-webkit-touch-callout: none) {
          body {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
            padding-left: env(safe-area-inset-left);
            padding-right: env(safe-area-inset-right);
            -webkit-overflow-scrolling: touch;
          }
        }
        
        canvas {
          display: block;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          position: fixed;
          top: 0;
          left: 0;
        }
        
        input, textarea {
          display: none !important;
        }
        
        ::selection {
          background: transparent !important;
        }
        
        ::-moz-selection {
          background: transparent !important;
        }

        @keyframes nitroFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes fireGlow {
          0%, 100% { 
            filter: brightness(1.2);
            box-shadow: 0 0 30px rgba(255,102,0,1), inset 0 0 20px rgba(255,69,0,0.8);
          }
          50% { 
            filter: brightness(1.5);
            box-shadow: 0 0 50px rgba(255,69,0,1), inset 0 0 30px rgba(255,140,0,1);
          }
        }
      `}</style>

      {gameState === 'playing' && isMobile && <MobileControls isLandscape={!isPortrait} />}

      {
        gameState === 'countdown' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <h1 style={{ fontSize: isMobile ? '80px' : '150px', color: '#00ff00', textShadow: '0 0 30px #fff', fontStyle: 'italic', fontFamily: 'Arial', userSelect: 'none' }}>{countdown}</h1>
          </div>
        )
      }

      {
        gameState === 'menu' && (
          <div style={{ position: 'absolute', zIndex: 60, inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', gap: isMobile ? '15px' : '20px', userSelect: 'none', WebkitUserSelect: 'none', padding: '20px' }}>
            <button onClick={handleStart} style={{ padding: isMobile ? '15px 40px' : '20px 60px', fontSize: isMobile ? '20px' : '30px', background: '#00ff00', color: '#000', border: 'none', borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px #00ff00', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>
              START RACE
            </button>
          </div>
        )
      }

      {/* HUD - Speedometer */}
      <div style={{ position: 'absolute', top: isLandscape ? '3px' : (isMobile ? '3px' : '20px'), left: isLandscape ? '3px' : (isMobile ? '3px' : '20px'), zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ transform: isLandscape ? 'scale(0.28)' : (isMobile ? 'scale(0.35)' : 'scale(1)'), transformOrigin: 'top left' }}>
          <Speedometer speed={speed} />
        </div>
      </div>

      {/* Score */}
      <div style={{
        position: 'fixed',
        top: isLandscape ? '3px' : (isMobile ? '5px' : '20px'),
        right: isLandscape ? '3px' : (isMobile ? '5px' : '20px'),
        background: 'linear-gradient(135deg, #333 0%, #000 100%)',
        border: isLandscape ? '1px solid #555' : '2px solid #555',
        borderRadius: isLandscape ? '3px' : (isMobile ? '5px' : '10px'),
        padding: isLandscape ? '2px 5px' : (isMobile ? '3px 8px' : '10px 30px'),
        transform: 'skewX(-15deg)',
        zIndex: 10,
        color: '#fff',
        textAlign: 'right',
        boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
        fontSize: isLandscape ? '0.5em' : (isMobile ? '0.6em' : '1em')
      }}>
        <div style={{ fontSize: isLandscape ? '6px' : (isMobile ? '8px' : '12px'), ...scoreStyle, transform: 'skewX(15deg)' }}>SCORE</div>
        <div style={{ fontSize: isLandscape ? '12px' : (isMobile ? '16px' : '40px'), ...scoreStyle, transform: 'skewX(15deg)' }}>{Math.floor(score)}</div>
      </div>

      {/* Nitro Bar */}
      {
        gameState === 'playing' && (
          <>
            <div style={{
              position: 'fixed',
              top: isLandscape ? '3px' : (isMobile ? '5px' : '20px'),
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              pointerEvents: 'none'
            }}>
              <div style={{
                width: isLandscape ? '100px' : (isMobile ? '140px' : '300px'),
                height: isLandscape ? '22px' : (isMobile ? '35px' : '70px'),
                background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
                border: nitro >= 100 ? (isLandscape ? '1px solid #ff6600' : '2px solid #ff6600') : (isLandscape ? '1px solid #ff9933' : '2px solid #ff9933'),
                borderRadius: isLandscape ? '11px' : (isMobile ? '18px' : '35px'),
                padding: isLandscape ? '1px' : (isMobile ? '2px' : '5px'),
                boxShadow: nitro >= 100
                  ? '0 5px 30px rgba(255,102,0,0.9), 0 0 40px rgba(255,69,0,0.7)'
                  : '0 5px 20px rgba(255,153,51,0.6)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: isLandscape ? '10px' : (isMobile ? '14px' : '30px'),
                  fontWeight: 'bold',
                  color: nitro >= 100 ? '#fff' : '#666',
                  zIndex: 2,
                  textShadow: nitro >= 100 ? '0 0 10px #fff, 0 0 20px #ff6600' : 'none',
                  fontFamily: 'Impact, Arial Black, sans-serif',
                  letterSpacing: isLandscape ? '1px' : '2px',
                  userSelect: 'none',
                  pointerEvents: 'none'
                }}>
                  N2O
                </div>

                <div style={{
                  width: `${(nitro / maxNitro) * 100}%`,
                  height: '100%',
                  background: nitro >= 100
                    ? 'linear-gradient(90deg, #ff4500 0%, #ff6600 50%, #ff8c00 100%)'
                    : isNitroActive
                      ? 'linear-gradient(90deg, #ff9933 0%, #ffaa55 100%)'
                      : 'linear-gradient(90deg, #ff9933 0%, #ff7722 100%)',
                  borderRadius: isLandscape ? '10px' : (isMobile ? '15px' : '30px'),
                  transition: 'width 0.1s ease-out, background 0.3s ease',
                  boxShadow: nitro >= 100
                    ? '0 0 30px rgba(255,102,0,1), inset 0 0 20px rgba(255,69,0,0.8)'
                    : isNitroActive
                      ? '0 0 20px rgba(255,153,51,0.8)'
                      : '0 0 10px rgba(255,153,51,0.5)',
                  animation: nitro >= 100
                    ? 'fireGlow 0.5s ease-in-out infinite'
                    : isNitroActive
                      ? 'nitroFlash 0.3s ease-in-out infinite'
                      : 'none',
                  zIndex: 1
                }} />
              </div>
            </div>

            {/* Distance */}
            <div style={{
              position: 'fixed',
              top: isLandscape ? '28px' : (isMobile ? '70px' : '120px'),
              right: isLandscape ? '3px' : (isMobile ? '5px' : '20px'),
              zIndex: 10
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)',
                border: isLandscape ? '1px solid #00ffff' : '2px solid #00ffff',
                borderRadius: isLandscape ? '3px' : (isMobile ? '4px' : '10px'),
                padding: isLandscape ? '2px 5px' : (isMobile ? '3px 8px' : '8px 20px'),
                transform: 'skewX(-15deg)',
                boxShadow: '0 5px 15px rgba(0,255,255,0.3)'
              }}>
                <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
                  <div style={{ fontSize: isLandscape ? '5px' : (isMobile ? '7px' : '10px'), color: '#00ffff', fontWeight: 'bold' }}>DISTANCE</div>
                  <div style={{ fontSize: isLandscape ? '9px' : (isMobile ? '12px' : '24px'), color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #00ffff' }}>{Math.floor(totalDistance)}m</div>
                </div>
              </div>
            </div>

            {/* Near Miss */}
            <div style={{
              position: 'fixed',
              top: isLandscape ? '52px' : (isMobile ? '105px' : '190px'),
              right: isLandscape ? '3px' : (isMobile ? '5px' : '20px'),
              zIndex: 10
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #2e1a1a 0%, #1a0f0f 100%)',
                border: isLandscape ? '1px solid #ff00ff' : '2px solid #ff00ff',
                borderRadius: isLandscape ? '3px' : (isMobile ? '4px' : '10px'),
                padding: isLandscape ? '2px 5px' : (isMobile ? '3px 8px' : '8px 20px'),
                transform: 'skewX(-15deg)',
                boxShadow: '0 5px 15px rgba(255,0,255,0.3)'
              }}>
                <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
                  <div style={{ fontSize: isLandscape ? '5px' : (isMobile ? '7px' : '10px'), color: '#ff00ff', fontWeight: 'bold' }}>NEAR MISS</div>
                  <div style={{ fontSize: isLandscape ? '9px' : (isMobile ? '12px' : '24px'), color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #ff00ff' }}>{nearMissCount}</div>
                </div>
              </div>
            </div>
          </>
        )
      }

      {/* Message */}
      {
        message && (
          <div style={{
            position: 'absolute',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: messageColor,
            fontSize: isMobile ? 'clamp(16px, 5vw, 36px)' : 'clamp(30px, 8vw, 80px)',
            fontWeight: 'bold',
            fontStyle: 'italic',
            zIndex: 15,
            textShadow: messageShadow,
            textTransform: 'uppercase',
            letterSpacing: '2px',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            pointerEvents: 'none'
          }}>
            {message}
          </div>
        )
      }

      {
        gameOver && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(50,0,0,0.95)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'Arial', userSelect: 'none', WebkitUserSelect: 'none', padding: '20px' }}>
            <h1 style={{ fontSize: isMobile ? 'clamp(30px, 8vw, 50px)' : 'clamp(40px, 10vw, 80px)', color: '#ff0000', margin: '0 0 20px 0', textShadow: '0 0 30px red', textTransform: 'uppercase', textAlign: 'center', userSelect: 'none' }}>YOU CRASHED</h1>
            <h2 style={{ color: '#fff', fontSize: isMobile ? '20px' : '30px', marginBottom: isMobile ? '15px' : '20px', userSelect: 'none' }}>FINAL SCORE: {Math.floor(score)}</h2>
            <div style={{ color: '#00ffff', fontSize: isMobile ? '16px' : '20px', marginBottom: isMobile ? '30px' : '40px', userSelect: 'none', textAlign: 'center' }}>
              <div>Distance: {Math.floor(totalDistance)}m</div>
              <div>Near Misses: {nearMissCount}</div>
            </div>

            <div style={{ display: 'flex', gap: isMobile ? '15px' : '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={startGame} style={{ padding: isMobile ? '15px 30px' : '20px 40px', fontSize: isMobile ? '18px' : '24px', cursor: 'pointer', background: '#fff', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', boxShadow: '0 0 20px white', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>RESTART</button>
              <button onClick={quitGame} style={{ padding: isMobile ? '15px 30px' : '20px 40px', fontSize: isMobile ? '18px' : '24px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #666', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>QUIT</button>
            </div>
          </div>
        )
      }

      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap, shadowMapSize: [512, 512] }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        frameloop="always"
      >
        <GameContent />
      </Canvas>
    </div >
  );
}

// ==================== LOADING SCREEN ====================

const LoadingScreen = () => {
  const { progress, active } = useProgress();

  const [finished, setFinished] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    if (!active && progress === 100) {
      setFinished(true);
      // Wait for transition to finish before removing from DOM
      setTimeout(() => {
        setShouldRender(false);
      }, 1000); // 1s buffer to ensure smooth transition
    }
  }, [active, progress]);

  if (!shouldRender) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      transition: 'opacity 1s ease-out',
      opacity: finished ? 0 : 1,
      pointerEvents: 'none'
    }}>
      <div style={{
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '20px',
        color: '#00ffff',
        textShadow: '0 0 10px #00ffff'
      }}>
        LOADING ASSETS
      </div>
      <div style={{
        width: '200px',
        height: '10px',
        background: '#333',
        borderRadius: '5px',
        overflow: 'hidden',
        border: '1px solid #555'
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #00ffff, #0088ff)',
          transition: 'width 0.2s ease-out'
        }} />
      </div>
      <div style={{
        marginTop: '10px',
        fontSize: '14px',
        color: '#aaa'
      }}>
        {Math.floor(progress)}%
      </div>
      <div style={{
        marginTop: '30px',
        fontSize: '12px',
        color: '#666',
        maxWidth: '300px',
        textAlign: 'center'
      }}>
        Note: 3G connections may take longer to load 3D models.
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <LoadingScreen />
      <Game />
    </ErrorBoundary>
  );
}
