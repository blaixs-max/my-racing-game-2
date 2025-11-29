import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * NitroBoostParticles - High-performance nitro boost effect
 *
 * Uses GPU instancing for thousands of particles with minimal CPU overhead
 *
 * @param {boolean} isActive - Whether nitro is currently active
 * @param {Array} position - Player car position [x, y, z]
 * @param {number} speed - Current speed for particle velocity
 */
export function NitroBoostParticles({ isActive = false, position = [0, 0, 0], speed = 0 }) {
  const particlesRef = useRef();
  const particles = useRef([]);
  const maxParticles = 50;

  // Initialize particle pool
  useMemo(() => {
    particles.current = Array.from({ length: maxParticles }, (_, i) => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.5 + Math.random() * 0.5,
      size: 0.2 + Math.random() * 0.3,
      opacity: 1.0
    }));
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;

    const clampedDelta = Math.min(delta, 0.1);
    const dummy = new THREE.Object3D();

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
        particlesRef.current.setColorAt(i, new THREE.Color(
          1.0,
          0.5 + lifeFactor * 0.5,
          0.0
        ));
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
 * TireSmokeParticles - Drift and tire smoke effect
 *
 * @param {boolean} isDrifting - Whether car is currently drifting
 * @param {Array} position - Car position
 * @param {number} speed - Current speed
 */
export function TireSmokeParticles({ isDrifting = false, position = [0, 0, 0], speed = 0 }) {
  const particlesRef = useRef();
  const particles = useRef([]);
  const maxParticles = 30;

  useMemo(() => {
    particles.current = Array.from({ length: maxParticles }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1.0 + Math.random() * 0.5,
      size: 0.5 + Math.random() * 0.5,
      opacity: 0.6
    }));
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;

    const clampedDelta = Math.min(delta, 0.1);
    const dummy = new THREE.Object3D();

    particles.current.forEach((particle, i) => {
      // Spawn smoke particles when drifting
      if (isDrifting && speed > 50 && particle.life <= 0 && Math.random() < 0.3) {
        // Spawn from rear wheels
        const wheelOffset = Math.random() < 0.5 ? -0.6 : 0.6;
        particle.position.set(
          position[0] + wheelOffset,
          position[1] + 0.1,
          position[2] + 1.5
        );

        particle.velocity.set(
          (Math.random() - 0.5) * 2,
          0.5 + Math.random(),
          3 + Math.random() * 2
        );

        particle.life = particle.maxLife;
        particle.opacity = 0.6;
      }

      // Update smoke particles
      if (particle.life > 0) {
        particle.position.x += particle.velocity.x * clampedDelta;
        particle.position.y += particle.velocity.y * clampedDelta;
        particle.position.z += particle.velocity.z * clampedDelta;

        // Smoke rises and disperses
        particle.velocity.y += 0.5 * clampedDelta;
        particle.velocity.multiplyScalar(0.92);

        particle.life -= clampedDelta;
        const lifeFactor = particle.life / particle.maxLife;
        particle.opacity = lifeFactor * 0.4;

        // Grow over time (smoke expands)
        const scale = particle.size * (1 + (1 - lifeFactor) * 2);

        dummy.position.copy(particle.position);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();

        particlesRef.current.setMatrixAt(i, dummy.matrix);
      } else {
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0.001);
        dummy.updateMatrix();
        particlesRef.current.setMatrixAt(i, dummy.matrix);
      }
    });

    particlesRef.current.instanceMatrix.needsUpdate = true;
  });

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#888888',
    transparent: true,
    opacity: 0.3,
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide
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
 * CollisionSparks - Sparks on collision
 *
 * @param {Array} triggerPosition - Position where collision occurred
 * @param {number} triggerTime - Timestamp when collision occurred
 */
export function CollisionSparks({ triggerPosition = null, triggerTime = 0 }) {
  const particlesRef = useRef();
  const particles = useRef([]);
  const lastTrigger = useRef(0);
  const maxParticles = 20;

  useMemo(() => {
    particles.current = Array.from({ length: maxParticles }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.5,
      size: 0.1
    }));
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;

    const clampedDelta = Math.min(delta, 0.1);
    const dummy = new THREE.Object3D();

    // Spawn new sparks on collision
    if (triggerTime > lastTrigger.current && triggerPosition) {
      lastTrigger.current = triggerTime;

      particles.current.forEach(particle => {
        particle.position.set(
          triggerPosition[0] + (Math.random() - 0.5) * 0.5,
          triggerPosition[1] + Math.random() * 0.5,
          triggerPosition[2] + (Math.random() - 0.5) * 0.5
        );

        particle.velocity.set(
          (Math.random() - 0.5) * 8,
          Math.random() * 5,
          (Math.random() - 0.5) * 8
        );

        particle.life = particle.maxLife;
      });
    }

    // Update sparks
    particles.current.forEach((particle, i) => {
      if (particle.life > 0) {
        particle.position.x += particle.velocity.x * clampedDelta;
        particle.position.y += particle.velocity.y * clampedDelta;
        particle.position.z += particle.velocity.z * clampedDelta;

        // Gravity
        particle.velocity.y -= 20 * clampedDelta;

        particle.life -= clampedDelta;
        const lifeFactor = particle.life / particle.maxLife;

        dummy.position.copy(particle.position);
        dummy.scale.setScalar(particle.size * lifeFactor);
        dummy.updateMatrix();

        particlesRef.current.setMatrixAt(i, dummy.matrix);
        particlesRef.current.setColorAt(i, new THREE.Color(
          1.0,
          lifeFactor * 0.8,
          lifeFactor * 0.2
        ));
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

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffff00',
    transparent: true,
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
