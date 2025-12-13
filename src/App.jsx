import React, { useRef, useEffect, useState, Suspense, useMemo, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Stars, useGLTF, useProgress, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import coinLogo from './assets/coin_logo.png';
import RealLauncherUI from './components/RealLauncherUI';
import GameOverUI from './components/GameOverUI';
import PostProcessing from './components/PostProcessing';
import { NitroBoostParticles } from './components/AdvancedParticles';
import { useGameStore } from './store'; // Imported from store

// --- OYUN AYARLARI (SUPABASE & WALLET) ---
// Note: Supabase logic moved to store/utils, but components might still use global supabase for now if needed.
// But mostly we rely on the store.

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
          textAlign: 'center',
          zIndex: 10000
        }}>
          <h1 style={{ color: '#ff0000', fontSize: '36px' }}>⚠️ Game Error</h1>
          <p style={{ fontSize: '18px' }}>An error occurred. Please refresh the page.</p>
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
            Restart
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==================== PARTIKÜL SİSTEMİ (GPU INSTANCED) ====================
const ParticleSystem = memo(() => {
  const particles = useGameStore(state => state.particles);
  const sparkInstanceRef = useRef();
  const explosionInstanceRef = useRef();

  // Pre-allocated matrices for GPU instancing
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Shared geometries and materials (created once)
  const sparkGeometry = useMemo(() => new THREE.SphereGeometry(0.1, 4, 4), []);
  const explosionGeometry = useMemo(() => new THREE.SphereGeometry(0.3, 4, 4), []);
  const sparkMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffff00',
    transparent: true
  }), []);
  const explosionMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff4500',
    transparent: true
  }), []);

  // Update instance matrices each frame
  useFrame(() => {
    if (!sparkInstanceRef.current || !explosionInstanceRef.current) return;

    let sparkIdx = 0;
    let explosionIdx = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p || typeof p.life === 'undefined') continue;

      if (p.type === 'spark') {
        if (sparkIdx < 50) {
          tempMatrix.makeTranslation(p.x, p.y, p.z);
          tempMatrix.scale(new THREE.Vector3(p.life, p.life, p.life));
          sparkInstanceRef.current.setMatrixAt(sparkIdx, tempMatrix);
          sparkIdx++;
        }
      } else {
        if (explosionIdx < 50) {
          const scale = (p.size || 0.3) * p.life;
          tempMatrix.makeTranslation(p.x, p.y, p.z);
          tempMatrix.scale(new THREE.Vector3(scale, scale, scale));
          explosionInstanceRef.current.setMatrixAt(explosionIdx, tempMatrix);

          // Color transition: orange -> dark
          tempColor.setHex(p.life > 0.5 ? 0xff4500 : 0x333333);
          explosionInstanceRef.current.setColorAt(explosionIdx, tempColor);
          explosionIdx++;
        }
      }
    }

    // Hide unused instances by scaling to 0
    for (let i = sparkIdx; i < 50; i++) {
      tempMatrix.makeScale(0, 0, 0);
      sparkInstanceRef.current.setMatrixAt(i, tempMatrix);
    }
    for (let i = explosionIdx; i < 50; i++) {
      tempMatrix.makeScale(0, 0, 0);
      explosionInstanceRef.current.setMatrixAt(i, tempMatrix);
    }

    sparkInstanceRef.current.instanceMatrix.needsUpdate = true;
    explosionInstanceRef.current.instanceMatrix.needsUpdate = true;
    if (explosionInstanceRef.current.instanceColor) {
      explosionInstanceRef.current.instanceColor.needsUpdate = true;
    }
  });

  // Cleanup
  useEffect(() => {
    return () => {
      sparkGeometry.dispose();
      explosionGeometry.dispose();
      sparkMaterial.dispose();
      explosionMaterial.dispose();
    };
  }, [sparkGeometry, explosionGeometry, sparkMaterial, explosionMaterial]);

  return (
    <group>
      {/* GPU Instanced Spark Particles - max 50 */}
      <instancedMesh
        ref={sparkInstanceRef}
        args={[sparkGeometry, sparkMaterial, 50]}
        frustumCulled={false}
      />
      {/* GPU Instanced Explosion Particles - max 50 */}
      <instancedMesh
        ref={explosionInstanceRef}
        args={[explosionGeometry, explosionMaterial, 50]}
        frustumCulled={false}
      />
    </group>
  );
});

const Coins = memo(() => {
  const coins = useGameStore(state => state.coins);

  // Safety: Filter out invalid coins before rendering
  const validCoins = coins.filter(c =>
    c &&
    typeof c === 'object' &&
    typeof c.x !== 'undefined' &&
    typeof c.z !== 'undefined' &&
    typeof c.id !== 'undefined'
  );

  return (
    <group>
      {validCoins.map(c => (
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
  const { targetX, enemies, coins, setGameOver, gameOver, triggerNearMiss, collectCoin, speed, selectedCar, gameState, updateEnemyPassed, isNitroActive } = useGameStore();
  const group = useRef();

  // Track player position for particles
  const [playerPos, setPlayerPos] = useState([0, 0.1, -2]);

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

    // Update player position for particles
    setPlayerPos([group.current.position.x, group.current.position.y, group.current.position.z]);

    const moveDiff = (group.current.position.x - currentX) / clampedDelta;
    group.current.rotation.z = -moveDiff * 0.002;
    group.current.rotation.x = -speed * 0.0002;

    const playerWidth = VEHICLE_DIMENSIONS.player.width;
    const playerLength = VEHICLE_DIMENSIONS.player.length;

    let hasCollision = false;

    // FIX 1: Near miss kontrolü ve enemy passed güncellemesi
    // SAFETY: Filter valid enemies before collision check
    const validEnemies = enemies.filter(enemy =>
      enemy &&
      typeof enemy === 'object' &&
      typeof enemy.x !== 'undefined' &&
      typeof enemy.z !== 'undefined' &&
      typeof enemy.type !== 'undefined'
    );

    validEnemies.forEach(enemy => {
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

    // SAFETY: Filter valid coins before collection check
    const validCoins = coins.filter(coin =>
      coin &&
      typeof coin === 'object' &&
      typeof coin.x !== 'undefined' &&
      typeof coin.z !== 'undefined'
    );

    validCoins.forEach(coin => {
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
    // Upgraded to MeshPhysicalMaterial for realistic car paint with clearcoat
    body: new THREE.MeshPhysicalMaterial({
      color: carColors[selectedCar] || '#aaaaaa',
      metalness: 0.9,
      roughness: 0.15, // Smoother than before
      clearcoat: 1.0, // Car paint clearcoat effect
      clearcoatRoughness: 0.1, // Glossy clearcoat
      reflectivity: 1.0
    }),
    // Glass with transmission (realistic transparency)
    glass: new THREE.MeshPhysicalMaterial({
      color: '#111',
      roughness: 0.05,
      transmission: 0.9, // Glass transparency
      thickness: 0.5,
      metalness: 0.0
    }),
    // Neon lights with higher emissive
    neon: new THREE.MeshStandardMaterial({
      color: '#00ffff',
      emissive: '#00ffff',
      emissiveIntensity: 3.0, // Brighter for bloom effect
      metalness: 0.5,
      roughness: 0.2
    }),
    // Tail lights (bright for bloom)
    tailLight: new THREE.MeshBasicMaterial({
      color: 'red',
      fog: false
    }),
    // Wheels with realistic rubber material
    wheel: new THREE.MeshPhysicalMaterial({
      color: '#111',
      roughness: 0.9,
      metalness: 0.1,
      clearcoat: 0.3,
      clearcoatRoughness: 0.8
    })
  }), [selectedCar, carColors]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

  return (
    <>
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

      {/* Advanced Particle Effects */}
      <NitroBoostParticles
        isActive={isNitroActive}
        position={playerPos}
        speed={speed}
      />
    </>
  );
}

// ==================== ALTINLAR ====================
const SingleCoin = memo(({ x, z }) => {
  const group = useRef();
  const material = useMemo(() =>
    // Upgraded to MeshPhysicalMaterial for realistic gold
    new THREE.MeshPhysicalMaterial({
      color: "#FFD700",
      metalness: 1.0, // Pure metal
      roughness: 0.15, // Polished gold
      emissive: "#FFD700",
      emissiveIntensity: 0.6, // Brighter for bloom
      clearcoat: 0.5, // Slight clearcoat for extra shine
      clearcoatRoughness: 0.2,
      reflectivity: 1.0
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
  const gameState = useGameStore(state => state.gameState);
  const initialSpawnRef = useRef(false);

  const materials = useMemo(() => ({
    truck: new THREE.MeshStandardMaterial({ color: '#335577', roughness: 0.5 }),
    container: new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.8 }),
    sedan: new THREE.MeshStandardMaterial({ color: '#ccc', roughness: 0.3 }),
    sport: new THREE.MeshStandardMaterial({ color: '#ff0000', metalness: 0.8, roughness: 0.2 }),
    tailLight: new THREE.MeshStandardMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 4 })
  }), []);

  // Staggered initial spawn - prevents frame drop when game starts
  useEffect(() => {
    if (gameState === 'playing' && !initialSpawnRef.current) {
      initialSpawnRef.current = true;
      console.log('🚗 Staggered traffic spawning started...');

      // The normal spawn system will gradually add more vehicles
      // No need to manually spawn here, just ensure smooth start
    }

    // Reset when game restarts
    if (gameState !== 'playing') {
      initialSpawnRef.current = false;
    }
  }, [gameState]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach(mat => mat.dispose());
    };
  }, [materials]);

  // Safety: Filter out invalid enemies before rendering
  const validEnemies = enemies.filter(enemy =>
    enemy &&
    typeof enemy === 'object' &&
    typeof enemy.id !== 'undefined' &&
    typeof enemy.x !== 'undefined' &&
    typeof enemy.z !== 'undefined' &&
    typeof enemy.type !== 'undefined'
  );

  return (
    <>
      {validEnemies.map(enemy => {
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

// ==================== SHARED BUILDING MATERIALS (OPTIMIZED) ====================
// Global material pool - shared across all buildings to reduce memory and GPU overhead
const sharedBuildingMaterials = {
  // Building body materials by type
  apartment: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.9 }),
  villa: new THREE.MeshStandardMaterial({ color: '#8B7355', roughness: 0.9 }),
  modern_house: new THREE.MeshStandardMaterial({ color: '#778899', roughness: 0.9 }),
  shop: new THREE.MeshStandardMaterial({ color: '#A0522D', roughness: 0.9 }),
  townhouse: new THREE.MeshStandardMaterial({ color: '#6B6B6B', roughness: 0.9 }),
  small_house: new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.9 }),
  // Shared materials
  window: new THREE.MeshStandardMaterial({ color: '#88ccff', emissive: '#4488ff', emissiveIntensity: 2 }),
  windowFrame: new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.6 }),
  roof: new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.7 }),
  modernRoof: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.3 }),
  villaRoof: new THREE.MeshStandardMaterial({ color: '#8B4513', roughness: 0.8 }),
  balcony: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.5, metalness: 0.2 }),
  door: new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 0.8 }),
  awning: new THREE.MeshStandardMaterial({ color: '#CC5500', roughness: 0.8 })
};

// ==================== ÇEVRE ====================
const Building = memo(({ width, height, side, type }) => {
  const isApartment = type === 'apartment';
  const isVilla = type === 'villa';
  const isModernHouse = type === 'modern_house';
  const isShop = type === 'shop';
  const isTownhouse = type === 'townhouse';

  // Use shared materials from global pool (no per-component allocation)
  const buildingMaterial = sharedBuildingMaterials[type] || sharedBuildingMaterials.small_house;

  // Windows for apartments and townhouses - More consistent
  const wins = useMemo(() => {
    if (!isApartment && !isTownhouse) return [];
    const w = [];
    const floors = Math.floor(height / 3);
    const offsetDirection = side > 0 ? -1 : 1;

    for (let i = 1; i < floors; i++) {
      // Add 2-3 windows per floor
      const numWindows = Math.min(Math.floor(width / 4), 3);
      for (let j = 0; j < numWindows; j++) {
        const xOffset = (j - (numWindows - 1) / 2) * 2.5;
        w.push([xOffset, i * 3, offsetDirection * (width / 2 + 0.05)]);
      }
    }
    return w;
  }, [height, isApartment, isTownhouse, side, width]);

  // Small windows for other building types
  const smallWins = useMemo(() => {
    if (isApartment || isTownhouse || type === 'small_house') return [];
    const w = [];
    const numWindows = isShop ? 2 : Math.floor(height / 4);
    for (let i = 0; i < numWindows; i++) {
      const offsetDirection = side > 0 ? -1 : 1;
      w.push([0, 2 + i * 3, offsetDirection * (width / 2 + 0.05)]);
    }
    return w;
  }, [height, isApartment, isTownhouse, isShop, side, width, type]);

  return (
    <group>
      {/* Main building body */}
      <mesh position={[0, height / 2, 0]} material={buildingMaterial}>
        <boxGeometry args={[width, height, width]} />
      </mesh>

      {/* Apartment/Townhouse windows with frames */}
      {wins.map((pos, i) => (
        <group key={i}>
          {/* Window glass */}
          <mesh position={pos} material={sharedBuildingMaterials.window} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[1.8, 1.5]} />
          </mesh>
          {/* Window frame */}
          <mesh position={[pos[0], pos[1], pos[2]]} material={sharedBuildingMaterials.windowFrame} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[2.0, 1.7]} />
          </mesh>
          {/* Balcony for apartments */}
          {isApartment && i % 3 === 0 && (
            <mesh position={[pos[0], pos[1] - 1, pos[2] + (side > 0 ? -0.3 : 0.3)]} material={sharedBuildingMaterials.balcony}>
              <boxGeometry args={[2.2, 0.1, 0.6]} />
            </mesh>
          )}
        </group>
      ))}

      {/* Villa/Modern House/Shop windows with frames */}
      {smallWins.map((pos, i) => (
        <group key={`sw-${i}`}>
          {/* Window glass */}
          <mesh position={pos} material={sharedBuildingMaterials.window} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[1.2, 1.0]} />
          </mesh>
          {/* Window frame */}
          <mesh position={[pos[0], pos[1], pos[2]]} material={sharedBuildingMaterials.windowFrame} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[1.4, 1.2]} />
          </mesh>
        </group>
      ))}

      {/* Small House - Pyramid roof and door */}
      {type === 'small_house' && (
        <>
          <mesh position={[0, height + 1, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[width * 0.8, 3, 4]} />
            <primitive object={sharedBuildingMaterials.roof} attach="material" />
          </mesh>
          {/* Door */}
          <mesh position={[0, 1.5, (side > 0 ? -1 : 1) * (width / 2 + 0.05)]} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} material={sharedBuildingMaterials.door}>
            <planeGeometry args={[1.2, 2.5]} />
          </mesh>
          {/* Door frame */}
          <mesh position={[0, 1.5, (side > 0 ? -1 : 1) * (width / 2 + 0.04)]} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} material={sharedBuildingMaterials.windowFrame}>
            <planeGeometry args={[1.3, 2.6]} />
          </mesh>
        </>
      )}

      {/* Villa - Flat roof with chimney */}
      {isVilla && (
        <>
          <mesh position={[0, height + 0.2, 0]}>
            <boxGeometry args={[width, 0.4, width]} />
            <primitive object={sharedBuildingMaterials.villaRoof} attach="material" />
          </mesh>
          <mesh position={[width * 0.3, height + 1.5, 0]}>
            <boxGeometry args={[0.8, 3, 0.8]} />
            <primitive object={sharedBuildingMaterials.villaRoof} attach="material" />
          </mesh>
        </>
      )}

      {/* Modern House - Flat modern roof */}
      {isModernHouse && (
        <mesh position={[0, height + 0.15, 0]}>
          <boxGeometry args={[width * 1.05, 0.3, width * 1.05]} />
          <primitive object={sharedBuildingMaterials.modernRoof} attach="material" />
        </mesh>
      )}

      {/* Shop - Awning and door */}
      {isShop && (
        <>
          {/* Awning */}
          <mesh position={[0, 2.5, side > 0 ? -width / 2 : width / 2]} rotation={[Math.PI / 6, 0, 0]} material={sharedBuildingMaterials.awning}>
            <boxGeometry args={[width * 0.9, 0.1, 1.5]} />
          </mesh>
          {/* Door */}
          <mesh position={[0, 1.5, (side > 0 ? -1 : 1) * (width / 2 + 0.05)]} rotation={[0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} material={sharedBuildingMaterials.door}>
            <planeGeometry args={[1.2, 2.5]} />
          </mesh>
        </>
      )}

      {/* Townhouse - Gabled roof */}
      {isTownhouse && (
        <mesh position={[0, height + 1.5, 0]} rotation={[0, 0, 0]}>
          <coneGeometry args={[width * 0.7, 3, 4]} />
          <primitive object={sharedBuildingMaterials.roof} attach="material" />
        </mesh>
      )}
    </group>
  );
});

Building.displayName = 'Building';

const SideObjects = memo(({ side }) => {
  const { speed } = useGameStore();
  const [objects] = useState(() => new Array(30).fill(0).map((_, i) => { // Increased from 20 to 30 objects
    const rand = Math.random();
    let type = 'empty', height = 0, width = 0;

    // Increased building density: ~65% buildings, ~25% trees, ~10% empty
    if (rand > 0.75) {
      type = 'tree';
      width = 2 + rand * 2;
      height = 5 + rand * 5;
    } else if (rand > 0.1) {
      // Assign varied building types
      const buildingRand = Math.random();
      if (buildingRand > 0.85) {
        type = 'apartment';
        width = 12;
        height = 30 + Math.random() * 40;
      } else if (buildingRand > 0.7) {
        type = 'villa';
        width = 10 + Math.random() * 3;
        height = 8 + Math.random() * 4;
      } else if (buildingRand > 0.5) {
        type = 'modern_house';
        width = 8 + Math.random() * 2;
        height = 10 + Math.random() * 5;
      } else if (buildingRand > 0.3) {
        type = 'shop';
        width = 7 + Math.random() * 3;
        height = 5 + Math.random() * 3;
      } else if (buildingRand > 0.15) {
        type = 'townhouse';
        width = 6 + Math.random() * 2;
        height = 12 + Math.random() * 6;
      } else {
        type = 'small_house';
        width = 8;
        height = 6;
      }
    }

    return { z: -i * 40, type, height, width, offset: (Math.random() - 0.5) * 20 }; // Reduced spacing from 50 to 40
  }));

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
        // SAFETY: Check if item exists before accessing properties
        if (!item || typeof item.z === 'undefined') return;

        item.z += speed * clampedDelta * 0.5;
        if (item.z > 20) {
          item.z = -1500;
          const rand = Math.random();
          // Respawn with increased building variety and density
          if (rand > 0.92) {
            item.type = 'apartment';
            item.height = 30 + Math.random() * 40;
            item.width = 12;
          }
          else if (rand > 0.82) {
            item.type = 'villa';
            item.height = 8 + Math.random() * 4;
            item.width = 10 + Math.random() * 3;
          }
          else if (rand > 0.68) {
            item.type = 'modern_house';
            item.height = 10 + Math.random() * 5;
            item.width = 8 + Math.random() * 2;
          }
          else if (rand > 0.52) {
            item.type = 'shop';
            item.height = 5 + Math.random() * 3;
            item.width = 7 + Math.random() * 3;
          }
          else if (rand > 0.38) {
            item.type = 'townhouse';
            item.height = 12 + Math.random() * 6;
            item.width = 6 + Math.random() * 2;
          }
          else if (rand > 0.25) {
            item.type = 'small_house';
            item.height = 6;
            item.width = 8;
          }
          else if (rand > 0.15) {
            item.type = 'tree';
          }
          else {
            item.type = 'empty';
          }
        }
        mesh.position.z = item.z;
        mesh.visible = item.type !== 'empty';
      });
    }
  });

  return (
    <group ref={groupRef}>
      {objects.map((obj, i) => {
        const isBuildingType = ['apartment', 'small_house', 'villa', 'modern_house', 'shop', 'townhouse'].includes(obj.type);
        return (
          <group key={i} position={[side * (45 + obj.offset), 0, obj.z]}>
            {isBuildingType && <Building width={obj.width} height={obj.height} side={side} type={obj.type} />}
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

// ==================== STREET LIGHTS (OPTIMIZED) ====================
const StreetLights = memo(() => {
  const { speed } = useGameStore();
  const lightsRef = useRef();

  // OPTIMIZED: Reduced from 22 to 12 lights (every 150m instead of 100m)
  const lights = useMemo(() => {
    const result = [];
    // Create lights from -450m to +450m (6 pairs = 12 total, down from 22)
    for (let i = -3; i <= 3; i++) {
      result.push({
        id: `left-${i}`,
        side: -1,
        initialZ: i * 150
      });
      result.push({
        id: `right-${i}`,
        side: 1,
        initialZ: i * 150
      });
    }
    return result;
  }, []);

  useFrame((state, delta) => {
    const clampedDelta = Math.min(delta, 0.1);

    if (lightsRef.current) {
      lightsRef.current.children.forEach((lightGroup) => {
        // Move lights based on speed (same as road movement)
        lightGroup.position.z += speed * clampedDelta * 0.5;

        // Respawn lights when they pass the camera
        if (lightGroup.position.z > 50) {
          lightGroup.position.z = -500;
        }
      });
    }
  });

  const lightMaterials = useMemo(() => ({
    pole: new THREE.MeshStandardMaterial({
      color: '#333',
      roughness: 0.7,
      metalness: 0.3
    }),
    lampHead: new THREE.MeshStandardMaterial({
      color: '#FFA500',
      emissive: '#FF8C00',
      emissiveIntensity: 0.5,
      roughness: 0.3
    })
  }), []);

  useEffect(() => {
    return () => {
      Object.values(lightMaterials).forEach(mat => mat.dispose());
    };
  }, [lightMaterials]);

  return (
    <group ref={lightsRef}>
      {lights.map((light) => {
        const x = light.side === 1 ? 10.7 : -10.7;
        const armDirection = light.side === 1 ? -1 : 1; // Arm extends toward road

        return (
          <group key={light.id} position={[x, 0, light.initialZ]}>
            {/* Main Pole - Taller and more realistic */}
            <mesh position={[0, 3.5, 0]} material={lightMaterials.pole}>
              <cylinderGeometry args={[0.12, 0.15, 7, 12]} />
            </mesh>

            {/* Pole Base */}
            <mesh position={[0, 0.15, 0]} material={lightMaterials.pole}>
              <cylinderGeometry args={[0.25, 0.3, 0.3, 12]} />
            </mesh>

            {/* Horizontal Arm extending toward road */}
            <mesh position={[armDirection * 0.6, 7, 0]} rotation={[0, 0, Math.PI / 2]} material={lightMaterials.pole}>
              <cylinderGeometry args={[0.06, 0.08, 1.2, 8]} />
            </mesh>

            {/* Lamp Fixture - Realistic curved lamp */}
            <group position={[armDirection * 1.2, 6.8, 0]}>
              {/* Lamp Cover (cone shape) */}
              <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0]} material={lightMaterials.lampHead}>
                <coneGeometry args={[0.35, 0.8, 12]} />
              </mesh>

              {/* Lamp Bulb Glow */}
              <mesh position={[0, -0.1, 0]} material={lightMaterials.lampHead}>
                <sphereGeometry args={[0.25, 12, 12]} />
              </mesh>
            </group>

            {/* OPTIMIZED: Single point light with reduced intensity (was 25+12, now just 15) */}
            <pointLight
              position={[armDirection * 1.2, 6.8, 0]}
              color="#FFB347"
              intensity={15}
              distance={25}
              decay={2}
            />
          </group>
        );
      })}
    </group>
  );
});

StreetLights.displayName = 'StreetLights';

// ==================== YOL VE ZEMİN (OPTIMIZED) ====================
function RoadEnvironment() {
  const { updateGame, speed } = useGameStore();
  const leftStripesRef = useRef();
  const rightStripesRef = useRef();

  // Pre-allocated matrix for GPU instancing
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);

  // Track stripe positions (30 stripes per lane)
  const stripePositions = useRef(
    Array.from({ length: 30 }, (_, i) => -i * 20)
  );

  // Shared geometry for all stripes (created once)
  const stripeGeometry = useMemo(() => new THREE.PlaneGeometry(0.25, 6), []);

  useFrame((state, delta) => {
    updateGame(delta);

    const clampedDelta = Math.min(delta, 0.1);

    // Update stripe positions
    for (let i = 0; i < stripePositions.current.length; i++) {
      stripePositions.current[i] += speed * clampedDelta * 0.5;
      if (stripePositions.current[i] > 10) {
        stripePositions.current[i] = -200;
      }
    }

    // Update instanced mesh matrices
    if (leftStripesRef.current && rightStripesRef.current) {
      for (let i = 0; i < 30; i++) {
        const z = stripePositions.current[i];

        // Left lane stripes
        tempMatrix.makeRotationX(-Math.PI / 2);
        tempMatrix.setPosition(-2.25, 0.02, z);
        leftStripesRef.current.setMatrixAt(i, tempMatrix);

        // Right lane stripes
        tempMatrix.makeRotationX(-Math.PI / 2);
        tempMatrix.setPosition(2.25, 0.02, z);
        rightStripesRef.current.setMatrixAt(i, tempMatrix);
      }

      leftStripesRef.current.instanceMatrix.needsUpdate = true;
      rightStripesRef.current.instanceMatrix.needsUpdate = true;
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
      stripeGeometry.dispose();
    };
  }, [roadMaterials, stripeGeometry]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 1000]} />
        <primitive object={roadMaterials.road} attach="material" />
      </mesh>

      {/* OPTIMIZED: GPU Instanced stripes - 2 instanced meshes instead of 60 separate meshes */}
      <instancedMesh
        ref={leftStripesRef}
        args={[stripeGeometry, roadMaterials.stripe, 30]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={rightStripesRef}
        args={[stripeGeometry, roadMaterials.stripe, 30]}
        frustumCulled={false}
      />

      <Barrier x={-10.5} />
      <Barrier x={10.5} />

      {/* Street Lights - OPTIMIZED: Reduced count */}
      <StreetLights />

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
      camera.position.set(
        originalPosition.current.x + (Math.random() - 0.5) * cameraShake * 0.5,
        originalPosition.current.y + (Math.random() - 0.5) * cameraShake * 0.5,
        camera.position.z
      );
    } else {
      camera.position.set(
        originalPosition.current.x,
        originalPosition.current.y,
        camera.position.z
      );
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

  // Create 50 lines (only once on mount)
  const [lines] = useState(() => {
    return new Array(50).fill(0).map(() => ({
      x: (Math.random() - 0.5) * 30,
      y: (Math.random() - 0.5) * 20 + 5, // Above ground
      z: (Math.random() - 0.5) * 100 - 50,
      len: Math.random() * 10 + 5,
      speed: Math.random() * 2 + 1
    }));
  });

  useFrame((state, delta) => {
    if (!linesRef.current) return;

    // Only visible above 160 km/h
    const isVisible = speed > 160;
    linesRef.current.visible = isVisible;

    if (!isVisible) return;

    const clampedDelta = Math.min(delta, 0.1);

    linesRef.current.children.forEach((line) => {
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

// ==================== SHADER WARMUP ====================
// Preloads and compiles shaders to prevent stuttering on first render
// This component renders all game objects invisibly during countdown
// to force GPU shader compilation before gameplay starts
const ShaderWarmup = () => {
  const gameState = useGameStore(state => state.gameState);
  const countdown = useGameStore(state => state.countdown);
  const [warmupDone, setWarmupDone] = useState(false);

  // Activate warmup when countdown reaches 5 (once)
  useEffect(() => {
    if (gameState === 'countdown' && countdown === 5 && !warmupDone) {
      // Use setTimeout to avoid cascading renders
      setTimeout(() => {
        setWarmupDone(true);
        console.log('🔥 Warming up shaders - Pre-rendering all game objects...');
      }, 0);
    }

    // Reset when returning to launcher
    if (gameState === 'launcher' && warmupDone) {
      setTimeout(() => setWarmupDone(false), 0);
    }
  }, [gameState, countdown, warmupDone]);

  // Keep invisible warmup active during countdown
  const isCountdown = gameState === 'countdown';

  return (
    <group position={[0, -1000, 0]} visible={isCountdown}>
      {/* Render all car models to compile their shaders */}
      <CarModel modelPath="/models/truck.glb" scale={1.678} />
      <CarModel modelPath="/models/Car 2/scene.gltf" scale={1.53} />
      <CarModel modelPath="/models/Car 3/scene.gltf" scale={1.0} />
      <CarModel modelPath="/models/ferrari.glb" scale={1.21} />
      <SpinningCoin />

      {/* Also warmup road and environment materials */}
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
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
const GameContent = () => {
  // Get game state for post-processing effects
  const speed = useGameStore(state => state.speed);
  const isNitroActive = useGameStore(state => state.isNitroActive);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 4, 11]} // Moved back from 8 to 11 to show full car
        fov={50}
      />
      <AudioListenerController />
      <ambientLight intensity={0.6} color="#ffffff" />
      <hemisphereLight skyColor="#445566" groundColor="#223344" intensity={0.6} />

      {/* Professional Post-Processing Effects */}
      <PostProcessing
        enabled={true}
        speed={speed}
        isNitroActive={isNitroActive}
      />

      <Suspense fallback={null}>
        <ShaderWarmup />
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
};

// ==================== ANA UYGULAMA ====================
function Game() {
  const {
    speed, score, message, gameOver, gameState, countdown,
    steer, cleanupTimer,
    totalDistance, nearMissCount, nitro, maxNitro, isNitroActive,
    activateNitro, deactivateNitro, currentLevel
  } = useGameStore();

  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  // Network durumu monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log("✅ Internet connection restored");
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log("❌ Internet connection lost");
      alert("⚠️ Internet connection lost!\nYou can continue playing when the connection is restored.");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const { isMobile, isPortrait } = useResponsive();
  const isLandscape = isMobile && !isPortrait;

  // FIX 4: Component unmount'ta timer cleanup
  useEffect(() => {
    return () => {
      cleanupTimer();
    };
  }, [cleanupTimer]);

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
  const isLevelMessage = message.includes("LEVEL");
  const messageColor = isLevelMessage ? '#ffd700' : (isGoldMessage ? '#00ffff' : '#ff0000');
  const messageShadow = isLevelMessage ? '0 0 40px #ffd700, 0 0 80px #ffa500' : (isGoldMessage ? '0 0 20px #00ffff' : '0 0 30px red');

  const scoreStyle = useMemo(() => ({
    color: '#00ffff',
    textShadow: '0 0 20px #00ffff',
    fontWeight: 'bold'
  }), []);

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

      {/* Bağlantı Durumu Göstergesi */}
      {!isOnline && (
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(255, 0, 0, 0.9)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          zIndex: 10000,
          boxShadow: '0 0 20px rgba(255, 0, 0, 0.5)',
          animation: 'pulse 2s infinite'
        }}>
          ⚠️ No Internet Connection
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

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

            {/* Level */}
            <div style={{
              position: 'fixed',
              top: isLandscape ? '76px' : (isMobile ? '140px' : '260px'),
              right: isLandscape ? '3px' : (isMobile ? '5px' : '20px'),
              zIndex: 10
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #2e1a2e 0%, #1a0f1a 100%)',
                border: isLandscape ? '1px solid #ffd700' : '2px solid #ffd700',
                borderRadius: isLandscape ? '3px' : (isMobile ? '4px' : '10px'),
                padding: isLandscape ? '2px 5px' : (isMobile ? '3px 8px' : '8px 20px'),
                transform: 'skewX(-15deg)',
                boxShadow: '0 5px 15px rgba(255,215,0,0.3)'
              }}>
                <div style={{ transform: 'skewX(15deg)', textAlign: 'center' }}>
                  <div style={{ fontSize: isLandscape ? '5px' : (isMobile ? '7px' : '10px'), color: '#ffd700', fontWeight: 'bold' }}>LEVEL</div>
                  <div style={{ fontSize: isLandscape ? '9px' : (isMobile ? '12px' : '24px'), color: '#fff', fontWeight: 'bold', textShadow: '0 0 10px #ffd700' }}>{currentLevel}</div>
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

      {!gameOver && (
        <Canvas
          shadows={{ type: THREE.PCFSoftShadowMap, shadowMapSize: [512, 512] }}
          dpr={[1, 1.5]}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
            alpha: false, // Disable transparency for better performance
            stencil: false, // Disable stencil buffer if not needed
            depth: true,
            logarithmicDepthBuffer: false
          }}
          frameloop="always"
          onCreated={({ gl }) => {
            // Optimize renderer settings
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.0;

            // Pre-compile shaders during countdown to prevent stuttering
            console.log('🎨 Canvas created - Renderer optimized');
          }}
        >
          <GameContent />
        </Canvas>
      )}
    </div >
  );
}

// ==================== LOADING SCREEN ====================

const LoadingScreen = () => {
  const { progress, active } = useProgress();
  const setGameState = useGameStore(state => state.setGameState);
  const { isMobile, isPortrait, width, height } = useResponsive();

  const [finished, setFinished] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);
  const [modelsPreloaded, setModelsPreloaded] = useState(false);

  // Preload 3D models when progress reaches 90%
  useEffect(() => {
    if (progress >= 90 && !modelsPreloaded) {
      console.log('📦 Preloading 3D models for faster game start...');

      // Preload all car models
      Promise.all([
        useGLTF.preload('/models/truck.glb'),
        useGLTF.preload('/models/Car 2/scene.gltf'),
        useGLTF.preload('/models/Car 3/scene.gltf'),
        useGLTF.preload('/models/ferrari.glb'),
      ]).then(() => {
        console.log('✅ All 3D models preloaded successfully');
        setModelsPreloaded(true);
      }).catch((error) => {
        console.warn('⚠️ Some models failed to preload:', error);
        setModelsPreloaded(true); // Continue anyway
      });
    }
  }, [progress, modelsPreloaded]);

  useEffect(() => {
    if (!active && progress === 100 && !finished && modelsPreloaded) {
      // Wait for transition to finish before removing from DOM
      setTimeout(() => {
        setFinished(true);
        setShouldRender(false);
        // Go to launcher after loading
        setGameState('launcher');
      }, 1000); // 1s buffer to ensure smooth transition
    }
  }, [active, progress, setGameState, finished, modelsPreloaded]);

  if (!shouldRender) return null;

  // Responsive sizing for banner image (larger to fit full image)
  const bannerHeight = isMobile
    ? (isPortrait ? height * 0.55 : height * 0.65)
    : height * 0.65;

  const bannerWidth = isMobile
    ? (isPortrait ? width * 0.95 : width * 0.9)
    : width * 0.85;

  // Responsive text sizing (smaller for loading text)
  const titleSize = isMobile
    ? (isPortrait ? '18px' : '16px')
    : '28px';

  const percentSize = isMobile
    ? (isPortrait ? '16px' : '14px')
    : '24px';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a0a0a 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      transition: 'opacity 1s ease-out',
      opacity: finished ? 0 : 1,
      pointerEvents: 'none',
      padding: isMobile ? '20px' : '40px'
    }}>
      {/* Banner - Frame Design */}
      <div style={{
        maxWidth: isMobile ? '95%' : '85%',
        maxHeight: '70vh',
        marginBottom: isMobile ? '15px' : '25px',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(255, 215, 0, 0.4), 0 0 40px rgba(255, 165, 0, 0.3)',
        border: '4px solid #FFD700',
        animation: 'pulse 3s ease-in-out infinite',
        lineHeight: 0
      }}>
        <img
          src="/Lumexia.jpg"
          alt="LUMEXIA Racing"
          style={{
            maxWidth: '100%',
            maxHeight: '70vh',
            display: 'block'
          }}
        />
      </div>

      {/* Loading Game Text */}
      <div style={{
        fontSize: titleSize,
        fontWeight: '900',
        marginBottom: '12px',
        background: 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textShadow: '0 0 30px rgba(255, 215, 0, 0.5)',
        letterSpacing: isMobile ? '2px' : '5px',
        textTransform: 'uppercase',
        fontFamily: "'Inter', 'Arial Black', sans-serif",
        animation: 'glow 2s ease-in-out infinite alternate'
      }}>
        Loading Game
      </div>

      {/* Progress Bar */}
      <div style={{
        width: isMobile ? (isPortrait ? '80%' : '60%') : '400px',
        maxWidth: '500px',
        height: isMobile ? '8px' : '12px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        overflow: 'hidden',
        border: '2px solid rgba(255, 215, 0, 0.3)',
        boxShadow: '0 0 20px rgba(255, 215, 0, 0.2)',
        position: 'relative'
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #FFD700, #FFA500, #FF8C00)',
          borderRadius: '20px',
          transition: 'width 0.3s ease-out',
          boxShadow: '0 0 20px rgba(255, 165, 0, 0.6)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Animated shine effect */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
            animation: 'shine 1.5s infinite'
          }} />
        </div>
      </div>

      {/* Percentage */}
      <div style={{
        marginTop: '15px',
        fontSize: percentSize,
        fontWeight: 'bold',
        color: '#FFD700',
        textShadow: '0 0 20px rgba(255, 215, 0, 0.6)',
        fontFamily: "'Inter', sans-serif"
      }}>
        {Math.floor(progress)}%
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        @keyframes glow {
          from {
            filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.4));
          }
          to {
            filter: drop-shadow(0 0 40px rgba(255, 215, 0, 0.8));
          }
        }

        @keyframes shine {
          0% { left: -100%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};


export default function App() {
  const gameState = useGameStore(state => state.gameState);
  const setGameState = useGameStore(state => state.setGameState);
  const setWalletData = useGameStore(state => state.setWalletData);
  const setTeamData = useGameStore(state => state.setTeamData);
  const setGameMode = useGameStore(state => state.setGameMode);
  const startGame = useGameStore(state => state.startGame);

  // Restore viewport settings on mount
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
      // Allow scrolling in launcher and gameover screens
      const currentState = useGameStore.getState().gameState;
      if (currentState === 'launcher' || currentState === 'gameover') {
        return;
      }

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

  const handleLauncherStart = (data) => {
    // Launcher'dan gelen wallet ve credit bilgilerini kaydet
    setWalletData(data.walletAddress, data.credits);

    // Team bilgisini kaydet
    if (data.selectedTeam) {
      setTeamData(data.selectedTeam, null, false);
    }

    // Game mode bilgisini kaydet
    if (data.gameMode) {
      setGameMode(data.gameMode);
    }

    // Oyunu başlat (countdown timer'ı başlatır)
    startGame();
  };

  return (
    <ErrorBoundary>
      {gameState === 'loading' && <LoadingScreen />}

      {gameState === 'launcher' && (
        <RealLauncherUI onStartGame={handleLauncherStart} />
      )}

      {/* Render Game (Canvas) ONLY when playing or countdown. Unmount on GameOver. */}
      {(gameState === 'countdown' || gameState === 'playing') && (
        <Game />
      )}

      {gameState === 'gameover' && (
        <GameOverUI
          score={useGameStore.getState().score}
          totalDistance={useGameStore.getState().totalDistance}
          nearMissCount={useGameStore.getState().nearMissCount}
          onRestart={useGameStore.getState().startGame}
          onMainMenu={() => setGameState('launcher')}
        />
      )}
    </ErrorBoundary>
  );
}
