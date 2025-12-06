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

  // PERFORMANCE: Reuse these objects to avoid GC pressure
  const dummyRef = useRef(new THREE.Object3D());
  const tempColorRef = useRef(new THREE.Color());

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
    const dummy = dummyRef.current;
    const tempColor = tempColorRef.current;

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
        // PERFORMANCE: Reuse tempColor instead of creating new Color each frame
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

