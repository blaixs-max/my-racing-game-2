import React, { useMemo } from 'react';
import { EffectComposer, Bloom, DepthOfField, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

/**
 * PostProcessing - Professional cinematic effects
 *
 * Effects Stack:
 * - Bloom: Glowing lights (headlights, neon, coins)
 * - Depth of Field: Cinematic focus effect
 * - Chromatic Aberration: Speed-based color separation
 * - Vignette: Edge darkening for focus
 *
 * Performance: ~5-10% GPU overhead (optimized)
 *
 * @param {boolean} enabled - Toggle all effects (default: true)
 * @param {number} speed - Current game speed for dynamic effects
 * @param {boolean} isNitroActive - Nitro boost state for enhanced effects
 * @param {Object} settings - Effect intensity settings
 */
export default function PostProcessing({ enabled = true, speed = 0, isNitroActive = false, settings = {} }) {

  // Default settings with overrides
  const config = useMemo(() => ({
    bloom: {
      intensity: 1.5,
      luminanceThreshold: 0.8, // Only bright objects bloom
      luminanceSmoothing: 0.3,
      ...settings.bloom
    },
    depthOfField: {
      focusDistance: 0.02,
      focalLength: 0.05,
      bokehScale: 3,
      ...settings.depthOfField
    },
    chromaticAberration: {
      // Speed-based intensity (faster = more aberration)
      offset: [
        Math.min(0.002 + (speed / 200) * 0.001, 0.004),
        Math.min(0.002 + (speed / 200) * 0.001, 0.004)
      ],
      ...settings.chromaticAberration
    },
    vignette: {
      offset: 0.3,
      darkness: 0.5,
      ...settings.vignette
    }
  }), [speed, settings]);

  // Nitro boost effect - increase bloom and aberration
  const nitroBoost = useMemo(() => ({
    bloomIntensity: isNitroActive ? config.bloom.intensity * 1.5 : config.bloom.intensity,
    aberrationMultiplier: isNitroActive ? 1.5 : 1.0
  }), [isNitroActive, config.bloom.intensity]);

  if (!enabled) return null;

  return (
    <EffectComposer multisampling={0}>
      {/* Bloom Effect - Glowing lights */}
      <Bloom
        intensity={nitroBoost.bloomIntensity}
        luminanceThreshold={config.bloom.luminanceThreshold}
        luminanceSmoothing={config.bloom.luminanceSmoothing}
        mipmapBlur
        blendFunction={BlendFunction.ADD}
      />

      {/* Depth of Field - Cinematic focus */}
      <DepthOfField
        focusDistance={config.depthOfField.focusDistance}
        focalLength={config.depthOfField.focalLength}
        bokehScale={config.depthOfField.bokehScale}
      />

      {/* Chromatic Aberration - Speed effect */}
      <ChromaticAberration
        offset={[
          config.chromaticAberration.offset[0] * nitroBoost.aberrationMultiplier,
          config.chromaticAberration.offset[1] * nitroBoost.aberrationMultiplier
        ]}
        blendFunction={BlendFunction.NORMAL}
      />

      {/* Vignette - Edge darkening */}
      <Vignette
        offset={config.vignette.offset}
        darkness={config.vignette.darkness}
        blendFunction={BlendFunction.NORMAL}
      />
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
 * - Disable Depth of Field on mobile (expensive)
 * - Reduce bloom intensity
 * - Lower bokehScale
 */

export function MobileOptimizedPostProcessing({ enabled = true, speed = 0 }) {
  if (!enabled) return null;

  return (
    <EffectComposer multisampling={0}>
      {/* Mobile: Only Bloom and Vignette */}
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

      {/* Light chromatic aberration only at high speeds */}
      {speed > 100 && (
        <ChromaticAberration
          offset={[0.001, 0.001]}
        />
      )}
    </EffectComposer>
  );
}
