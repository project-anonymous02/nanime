import {
  DEFAULT_SUPERSAMPLE,
  clamp,
  clearAdaptiveLiquidGlass,
  createAdaptiveLiquidGlassController,
  createLiquidGlassDisplacementPixels,
  numberOption,
  syncAdaptiveLiquidGlass,
  supportsLiquidGlassSvgFilter,
  type AdaptiveController,
  type AdaptiveSampleOptions,
} from './liquid-glass-core';

export interface DisplacementMapResult { url: string; scale: number; key: string }

export function createLiquidGlassDisplacementMap(options: {
  width?: number; height?: number; radius?: number; magnify?: number;
  bend?: number; spread?: number; bezelRatio?: number; profile?: string; supersample?: number;
} = {}): DisplacementMapResult {
  if (typeof document === 'undefined') return { url: '', scale: 0, key: '' };
  const width = Math.max(24, Math.round(numberOption(options.width, 400, 24, 4096)));
  const height = Math.max(24, Math.round(numberOption(options.height, 96, 24, 4096)));
  const radius = clamp(Math.round(numberOption(options.radius, Math.min(width, height) / 2, 0, 2048)), 0, Math.min(width, height) / 2);
  const magnify = numberOption(options.magnify, 1, 0.2, 2);
  const bend = numberOption(options.bend, 0.06, 0, 0.3);
  const spread = numberOption(options.spread, 0.58, 0.4, 1);
  const bezelRatio = numberOption(options.bezelRatio, 0.62, 0.2, 1);
  const profile = String(options.profile || 'standard');
  const supersample = numberOption(options.supersample, DEFAULT_SUPERSAMPLE, 1, 3);
  const w = Math.max(160, Math.round(width * supersample));
  const h = Math.max(96, Math.round(height * supersample));
  const r = Math.max(4, Math.round(radius * supersample));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) return { url: '', scale: 0, key: '' };
  const image = context.createImageData(w, h);
  const pixels = createLiquidGlassDisplacementPixels({ width: w, height: h, radius: r, magnify, bend, spread, bezelRatio, profile });
  image.data.set(pixels.data);
  context.putImageData(image, 0, 0);
  return {
    url: canvas.toDataURL('image/png'),
    scale: pixels.scale / supersample,
    key: `${w}x${h}:${r}:${magnify}:${bend}:${spread}:${bezelRatio}:${profile}:${supersample}`,
  };
}

export { clearAdaptiveLiquidGlass, createAdaptiveLiquidGlassController, syncAdaptiveLiquidGlass, supportsLiquidGlassSvgFilter };
export type { AdaptiveController, AdaptiveSampleOptions };
