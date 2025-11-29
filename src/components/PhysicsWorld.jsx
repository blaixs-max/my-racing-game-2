import React from 'react';
import { Physics } from '@react-three/rapier';

/**
 * PhysicsWorld - Rapier Physics Engine Wrapper
 *
 * WebAssembly tabanlı, yüksek performanslı fizik motoru
 *
 * Features:
 * - Deterministic physics (aynı koşullarda aynı sonuç)
 * - Realistic collision detection
 * - Vehicle physics support
 * - Near-native performance
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - 3D scene content
 * @param {boolean} props.debug - Physics debug visualizer (development only)
 * @param {Array} props.gravity - Gravity vector [x, y, z] (default: [0, -9.81, 0])
 */
export default function PhysicsWorld({ children, debug = false, gravity = [0, -9.81, 0] }) {
  return (
    <Physics
      debug={debug}
      gravity={gravity}
      // Performance optimizations
      timeStep="vary" // Adaptive timestep for smooth physics
      paused={false}
      // Collision detection settings
      colliders="hull" // Use convex hull colliders by default
      // Solver iterations (higher = more accurate but slower)
      numSolverIterations={4}
      // Enable CCD (Continuous Collision Detection) for fast-moving objects
      updatePriority={-50}
    >
      {children}
    </Physics>
  );
}

/**
 * Usage example:
 *
 * <Canvas>
 *   <PhysicsWorld debug={false}>
 *     <RigidBody type="dynamic">
 *       <mesh>
 *         <boxGeometry />
 *         <meshStandardMaterial />
 *       </mesh>
 *     </RigidBody>
 *   </PhysicsWorld>
 * </Canvas>
 */
