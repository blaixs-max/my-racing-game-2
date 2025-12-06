import React from 'react';
import { EffectComposer } from '@react-three/postprocessing';

/**
 * PostProcessing - ALL EFFECTS DISABLED
 *
 * All post-processing effects have been disabled for clean gameplay visuals.
 * Performance: ~0% overhead (no active effects)
 *
 * @param {boolean} enabled - Toggle all effects (default: true)
 */
export default function PostProcessing({ enabled = true }) {

  if (!enabled) return null;

  return (
    <EffectComposer multisampling={0}>
      {/* ALL POST-PROCESSING DISABLED - Clean gameplay visuals */}
    </EffectComposer>
  );
}
