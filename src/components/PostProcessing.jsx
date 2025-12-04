import React from 'react';
import { EffectComposer } from '@react-three/postprocessing';

/**
 * PostProcessing - ALL EFFECTS DISABLED
 *
 * All post-processing effects have been disabled for clean gameplay visuals.
 *
 * Removed Effects (all caused visual issues):
 * - Bloom: Glowing effect - caused bad visuals
 * - Depth of Field: Made gameplay blurry
 * - Chromatic Aberration: Rainbow color separation blur
 * - Vignette: Edge darkening
 *
 * Performance: ~0% overhead (no active effects)
 *
 * @param {boolean} enabled - Toggle all effects (default: true)
 */
export default function PostProcessing({ enabled = true }) {

  if (!enabled) return null;

  return (
    <EffectComposer multisampling={0}>
      {/* ALL POST-PROCESSING DISABLED - Clean gameplay visuals */}

      {/* Bloom - DISABLED (caused visual issues) */}
      {/*
      <Bloom
        intensity={nitroBoost.bloomIntensity}
        luminanceThreshold={config.bloom.luminanceThreshold}
        luminanceSmoothing={config.bloom.luminanceSmoothing}
        mipmapBlur
        blendFunction={BlendFunction.ADD}
      />
      */}

      {/* Depth of Field - DISABLED (causes blur during gameplay) */}
      {/*
      <DepthOfField
        focusDistance={config.depthOfField.focusDistance}
        focalLength={config.depthOfField.focalLength}
        bokehScale={config.depthOfField.bokehScale}
      />
      */}

      {/* Chromatic Aberration - DISABLED (causes rainbow blur) */}
      {/*
      <ChromaticAberration
        offset={[
          config.chromaticAberration.offset[0] * nitroBoost.aberrationMultiplier,
          config.chromaticAberration.offset[1] * nitroBoost.aberrationMultiplier
        ]}
        blendFunction={BlendFunction.NORMAL}
      />
      */}

      {/* Vignette - DISABLED (keeping visuals clean) */}
      {/*
      <Vignette
        offset={config.vignette.offset}
        darkness={config.vignette.darkness}
        blendFunction={BlendFunction.NORMAL}
      />
      */}
    </EffectComposer>
  );
}

/**
 * Performance Tips:
 * - multisampling={0} disables MSAA for better FPS
 * - mipmapBlur on Bloom reduces GPU load
 * - Use BlendFunction wisely (NORMAL < ADD < SCREEN)
 *
 * Mobile Optimization:
 * - Only Bloom and Vignette enabled
 * - Reduced bloom intensity
 * - No blur effects
 */

export function MobileOptimizedPostProcessing({ enabled = true }) {
  if (!enabled) return null;

  return (
    <EffectComposer multisampling={0}>
      {/* Mobile: ALL EFFECTS DISABLED - Clean visuals */}
      {/*
      <Bloom
        intensity={1.0}
        luminanceThreshold={0.9}
        luminanceSmoothing={0.2}
        mipmapBlur
      />

      <Vignette
        offset={0.5}
        darkness={0.6}
      />
      */}
    </EffectComposer>
  );
}
