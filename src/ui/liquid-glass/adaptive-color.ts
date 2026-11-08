// Adaptive color engine for Liquid Glass (per Nanime color spec).
//
// The material is NOT a permanent white sheet: it samples the backdrop,
// analyzes luminance in linear-light RGB, picks a light or dark tint mode,
// and raises tint opacity until foreground text meets a contrast target
// (WCAG 4.5:1 by default) — or flips mode when that reads better.
//
// Color math follows the spec: sRGB <-> linear conversion, relative
// luminance (0.2126R + 0.7152G + 0.0722B on linear channels), and
// linear-light alpha compositing. The CSS layer still paints an rgba tint
// (browser compositing is sRGB), so `tintRgb`/`tintHex` are analysis /
// QA values; adjust `opacity` (not pre-multiplied color) to intensify.

export interface RGB { r: number; g: number; b: number }

export type GlassMode = 'light' | 'dark';

export interface AdaptiveGlassOptions {
  /** WCAG target for foreground vs material. Default 4.5 (normal text). */
  targetContrast?: number;
  /** Luminance split. Default 0.35 (design parameter, not Apple-internal). */
  modeThreshold?: number;
  /** Starting / minimum tint alpha for each mode. */
  lightOpacity?: number;
  darkOpacity?: number;
  /** Upper bound while boosting opacity for contrast. */
  maxOpacity?: number;
  /** Step used when boosting opacity. */
  opacityStep?: number;
}

export interface AdaptiveGlassResult {
  mode: GlassMode;
  luminance: number;
  opacity: number;
  /** rgba() string for CSS background-color. */
  tint: string;
  /** Material color after compositing (analysis / debug). */
  tintRgb: RGB;
  tintHex: string;
  foreground: string;
  border: string;
  highlight: string;
  shadow: string;
  /** Achieved foreground-vs-material contrast ratio. */
  contrast: number;
}

const LIGHT_TINT: RGB = { r: 255, g: 255, b: 255 };
const DARK_TINT: RGB = { r: 28, g: 28, b: 30 };
const LIGHT_FOREGROUND: RGB = { r: 28, g: 28, b: 30 };
const DARK_FOREGROUND: RGB = { r: 255, g: 255, b: 255 };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function srgbToLinear(value: number): number {
  const c = clamp01(value / 255);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value: number): number {
  const c = clamp01(value);
  const result = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(result * 255);
}

export function getLuminance({ r, g, b }: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Alpha compositing in linear-light space (spec §3B). */
export function blendLinear(background: RGB, foreground: RGB, alpha: number): RGB {
  const a = clamp01(alpha);
  const mix = (bg: number, fg: number) =>
    linearToSrgb((1 - a) * srgbToLinear(bg) + a * srgbToLinear(fg));
  return {
    r: mix(background.r, foreground.r),
    g: mix(background.g, foreground.g),
    b: mix(background.b, foreground.b),
  };
}

export function toHex(color: RGB): string {
  const hex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`.toUpperCase();
}

/** WCAG contrast ratio between two sRGB colors. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = getLuminance(a);
  const lb = getLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgba(color: RGB, alpha: number): string {
  const a = Math.round(clamp01(alpha) * 1000) / 1000;
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${a})`;
}

function materialFor(background: RGB, mode: GlassMode, opacity: number) {
  const tint = mode === 'dark' ? DARK_TINT : LIGHT_TINT;
  const foreground = mode === 'dark' ? DARK_FOREGROUND : LIGHT_FOREGROUND;
  const mixed = blendLinear(background, tint, opacity);
  return { tint, foreground, mixed, contrast: contrastRatio(foreground, mixed) };
}

/**
 * Pick the glass material for a backdrop color.
 * Light mode = white tint + dark foreground; dark mode = dark neutral tint +
 * white foreground. Opacity is raised until contrast target, then mode flips
 * if still insufficient and the other mode wins.
 */
export function createAdaptiveGlass(background: RGB, options: AdaptiveGlassOptions = {}): AdaptiveGlassResult {
  const target = options.targetContrast ?? 4.5;
  const threshold = options.modeThreshold ?? 0.35;
  const lightStart = clamp01(options.lightOpacity ?? 0.24);
  const darkStart = clamp01(options.darkOpacity ?? 0.32);
  const maxOpacity = clamp01(options.maxOpacity ?? 0.72);
  const step = Math.max(0.01, options.opacityStep ?? 0.04);
  const luminance = getLuminance(background);
  const preferred: GlassMode = luminance < threshold ? 'dark' : 'light';

  const attempt = (mode: GlassMode, start: number) => {
    let opacity = start;
    let result = materialFor(background, mode, opacity);
    while (result.contrast < target && opacity < maxOpacity) {
      opacity = Math.min(maxOpacity, opacity + step);
      result = materialFor(background, mode, opacity);
    }
    return { ...result, opacity, mode };
  };

  let chosen = attempt(preferred, preferred === 'dark' ? darkStart : lightStart);
  if (chosen.contrast < target) {
    const other: GlassMode = preferred === 'dark' ? 'light' : 'dark';
    const fallback = attempt(other, other === 'dark' ? darkStart : lightStart);
    if (fallback.contrast > chosen.contrast) chosen = fallback;
  }
  const actualMode = chosen.mode;

  return {
    mode: actualMode,
    luminance,
    opacity: chosen.opacity,
    tint: rgba(chosen.tint, chosen.opacity),
    tintRgb: chosen.mixed,
    tintHex: toHex(chosen.mixed),
    foreground: toHex(chosen.foreground),
    border: actualMode === 'dark' ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.48)',
    highlight: actualMode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.55)',
    shadow: actualMode === 'dark' ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.12)',
    contrast: chosen.contrast,
  };
}
