import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * NitroBoostParticles - High-performance nitro boost effect
 *
 * Uses GPU instancing for thousands of particles with minimal CPU overhead
 *
 * @param {boolean} isActive - Whether nitro is currently active
 * @param {Array} position - Player car position [x, y, z]
 */
export function NitroBoostParticles({ isActive = false, position = [0, 0, 0] }) {
  const particlesRef = useRef();
  const particles = useRef([]);
  const maxParticles = 50;

  // PERFORMANCE FIX: Cache objects outside render loop to prevent garbage collection
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Initialize particle pool (only once on mount)
  useEffect(() => {
    if (particles.current.length === 0) {
      particles.current = Array.from({ length: maxParticles }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 0.2 + Math.random() * 0.3,
        opacity: 1.0
      }));
    }
  }, [maxParticles]);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;

    const clampedDelta = Math.min(delta, 0.1);
    // PERFORMANCE FIX: Using cached dummy object instead of creating new one each frame

    particles.current.forEach((particle, i) => {
      // Spawn new particles when nitro is active
      if (isActive && particle.life <= 0) {
        // Spawn from behind the car
        particle.position.set(
          position[0] + (Math.random() - 0.5) * 0.8,
          position[1] + 0.2 + Math.random() * 0.3,
          position[2] + 2 + Math.random() * 0.5
        );

        // Particles move backward and spread out
        particle.velocity.set(
          (Math.random() - 0.5) * 3,
          -1 - Math.random() * 2,
          5 + Math.random() * 8
        );

        particle.life = particle.maxLife;
        particle.opacity = 1.0;
      }

      // Update existing particles
      if (particle.life > 0) {
        particle.position.x += particle.velocity.x * clampedDelta;
        particle.position.y += particle.velocity.y * clampedDelta;
        particle.position.z += particle.velocity.z * clampedDelta;

        // Apply gravity and drag
        particle.velocity.y -= 5 * clampedDelta;
        particle.velocity.multiplyScalar(0.95);

        particle.life -= clampedDelta;
        particle.opacity = particle.life / particle.maxLife;

        // Scale based on life (grow then shrink)
        const lifeFactor = particle.life / particle.maxLife;
        const scale = particle.size * (lifeFactor < 0.5 ? lifeFactor * 2 : (1 - lifeFactor) * 2);

        dummy.position.copy(particle.position);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();

        particlesRef.current.setMatrixAt(i, dummy.matrix);
        // PERFORMANCE FIX: Reuse cached color object instead of creating new one each frame
        tempColor.setRGB(1.0, 0.5 + lifeFactor * 0.5, 0.0);
        particlesRef.current.setColorAt(i, tempColor);
      } else {
        // Hide inactive particles
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        particlesRef.current.setMatrixAt(i, dummy.matrix);
      }
    });

    particlesRef.current.instanceMatrix.needsUpdate = true;
    if (particlesRef.current.instanceColor) {
      particlesRef.current.instanceColor.needsUpdate = true;
    }
  });

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff6600',
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  return (
    <instancedMesh
      ref={particlesRef}
      args={[geometry, material, maxParticles]}
      frustumCulled={false}
    />
  );
}

/**
 * RocketTrailParticles - Rocket power-up alev kuyruğu
 *
 * NitroBoostParticles'in daha yoğun, daha kırmızı versiyonu. 12 saniye boyunca
 * arabanin arkasindan sürekli kalin alev çıkar.
 *
 * @param {boolean} isActive - Rocket aktif mi (rocketActive)
 * @param {Array} position - Player car position [x, y, z]
 */
export function RocketTrailParticles({ isActive = false, position = [0, 0, 0] }) {
  const particlesRef = useRef();
  const particles = useRef([]);
  const maxParticles = 80; // nitro'dan daha fazla

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (particles.current.length === 0) {
      particles.current = Array.from({ length: maxParticles }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        size: 0.3 + Math.random() * 0.4,
        opacity: 1.0
      }));
    }
  }, [maxParticles]);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;
    const clampedDelta = Math.min(delta, 0.1);

    particles.current.forEach((particle, i) => {
      if (isActive && particle.life <= 0) {
        // Spawn from behind car (geniş yelpaze)
        particle.position.set(
          position[0] + (Math.random() - 0.5) * 1.2,
          position[1] + 0.15 + Math.random() * 0.4,
          position[2] + 2.2 + Math.random() * 0.8
        );
        // Daha yavas yayılım, daha agresif arkaya itim
        particle.velocity.set(
          (Math.random() - 0.5) * 2,
          -0.8 - Math.random() * 1.5,
          7 + Math.random() * 10
        );
        particle.life = particle.maxLife;
        particle.opacity = 1.0;
      }

      if (particle.life > 0) {
        particle.position.x += particle.velocity.x * clampedDelta;
        particle.position.y += particle.velocity.y * clampedDelta;
        particle.position.z += particle.velocity.z * clampedDelta;
        particle.velocity.y -= 3 * clampedDelta;
        particle.velocity.multiplyScalar(0.96);
        particle.life -= clampedDelta;

        const lifeFactor = particle.life / particle.maxLife;
        const scale = particle.size * (lifeFactor < 0.5 ? lifeFactor * 2 : (1 - lifeFactor) * 2.2);

        dummy.position.copy(particle.position);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        particlesRef.current.setMatrixAt(i, dummy.matrix);

        // Renk: kırmızı (yeni) → sarı (orta) → siyah (sönen)
        // lifeFactor 1.0 = yeni, 0.0 = sönmek üzere
        const r = 1.0;
        const g = lifeFactor > 0.6 ? 0.3 : lifeFactor * 0.8;
        const b = 0;
        tempColor.setRGB(r, g, b);
        particlesRef.current.setColorAt(i, tempColor);
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        particlesRef.current.setMatrixAt(i, dummy.matrix);
      }
    });

    particlesRef.current.instanceMatrix.needsUpdate = true;
    if (particlesRef.current.instanceColor) {
      particlesRef.current.instanceColor.needsUpdate = true;
    }
  });

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff2200',
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }), []);

  return (
    <instancedMesh
      ref={particlesRef}
      args={[geometry, material, maxParticles]}
      frustumCulled={false}
    />
  );
}

