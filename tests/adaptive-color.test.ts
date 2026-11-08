import { describe, expect, it } from 'vitest';
import {
  blendLinear,
  contrastRatio,
  createAdaptiveGlass,
  getLuminance,
  linearToSrgb,
  srgbToLinear,
  toHex,
} from '../src/ui/liquid-glass/adaptive-color';

describe('adaptive glass color engine', () => {
  it('converts sRGB channels to linear light and back', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 5);
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBe(255);
    expect(linearToSrgb(srgbToLinear(128))).toBe(128);
  });

  it('computes WCAG relative luminance', () => {
    expect(getLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(getLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(getLuminance({ r: 0, g: 255, b: 0 })).toBeCloseTo(0.7152, 3);
    expect(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 3);
  });

  it('composites alpha in linear-light space', () => {
    const mid = blendLinear({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }, 0.5);
    expect(mid.r).toBe(188);
    expect(mid.g).toBe(188);
    expect(mid.b).toBe(188);
    const solid = blendLinear({ r: 10, g: 20, b: 30 }, { r: 200, g: 210, b: 220 }, 1);
    expect(solid).toEqual({ r: 200, g: 210, b: 220 });
  });

  it('picks a light material with dark foreground over bright backdrops', () => {
    const glass = createAdaptiveGlass({ r: 242, g: 242, b: 247 });
    expect(getLuminance({ r: 242, g: 242, b: 247 })).toBeGreaterThan(0.35);
    expect(glass.mode).toBe('light');
    expect(glass.foreground).toBe(toHex({ r: 28, g: 28, b: 30 }));
    expect(glass.contrast).toBeGreaterThanOrEqual(4.5);
    expect(glass.tint).toMatch(/^rgba\(255, 255, 255, 0\./);
    expect(glass.opacity).toBeGreaterThanOrEqual(0.24);
  });

  it('picks a dark material with white foreground over dark backdrops', () => {
    const glass = createAdaptiveGlass({ r: 18, g: 18, b: 20 });
    expect(glass.mode).toBe('dark');
    expect(glass.foreground).toBe('#FFFFFF');
    expect(glass.contrast).toBeGreaterThanOrEqual(4.5);
    expect(glass.tint).toMatch(/^rgba\(28, 28, 30, 0\./);
  });

  it('raises opacity or flips mode to keep text readable on mid tones', () => {
    const glass = createAdaptiveGlass({ r: 128, g: 128, b: 128 });
    expect(glass.contrast).toBeGreaterThan(2.5);
    expect(glass.opacity).toBeGreaterThan(0.24);
    expect(['light', 'dark']).toContain(glass.mode);
  });

  it('honors a custom mode threshold and contrast target', () => {
    const backdrop = { r: 128, g: 128, b: 128 };
    const lowBar = createAdaptiveGlass(backdrop, { modeThreshold: 0.1, targetContrast: 3 });
    expect(lowBar.mode).toBe('light');
    expect(createAdaptiveGlass(backdrop, { targetContrast: 7 }).opacity).toBeGreaterThanOrEqual(lowBar.opacity);
  });
});
