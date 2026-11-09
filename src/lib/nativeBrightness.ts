/**
 * Native Android screen brightness bridge (Capacitor `Brightness` plugin).
 *
 * Adaptasi perilaku JustPlayer `BrightnessControl`:
 * - Level -1 = auto (BRIGHTNESS_OVERRIDE_NONE) / 0..30 = override manual.
 * - Pemetaan level → WindowManager.LayoutParams.screenBrightness mengikuti
 *   rumus JustPlayer: `d = 0.064 + 0.936/30 * level; value = d * d`
 *   (kurva kuadratik agar langkah manusia terasa linear).
 *
 * Di Web / Android WebView tanpa plugin native, fungsi native mengembalikan
 * `false` dan pemanggil wajib memakai fallback CSS video brightness yang hanya
 * mempengaruhi elemen video, bukan brightness layar. Jangan mengklaim CSS
 * filter sebagai screen brightness.
 */
import { registerPlugin } from '@capacitor/core';

export interface NativeBrightnessPlugin {
  setBrightness(options: { level: number }): Promise<{ level: number }>;
  getBrightness(): Promise<{ level: number }>;
}

const BrightnessNative = registerPlugin<NativeBrightnessPlugin>('Brightness');

export const BRIGHTNESS_AUTO = -1;
export const BRIGHTNESS_MAX_LEVEL = 30;

/** Rumus kurva JustPlayer: level 0..30 → 0..1 (level -1 → null = auto). */
export function levelToBrightness(level: number): number | null {
  if (level <= BRIGHTNESS_AUTO) return null;
  const clamped = Math.max(0, Math.min(BRIGHTNESS_MAX_LEVEL, level));
  const d = 0.064 + (0.936 / BRIGHTNESS_MAX_LEVEL) * clamped;
  return d * d;
}

/** Persen untuk indikator (0..100). Auto (-1) dipetakan ke 100 agar bar tetap utuh. */
export function brightnessLevelToPercent(level: number): number {
  if (level <= BRIGHTNESS_AUTO) return 100;
  return Math.round((Math.max(0, Math.min(BRIGHTNESS_MAX_LEVEL, level)) / BRIGHTNESS_MAX_LEVEL) * 100);
}

/**
 * Fallback CSS hanya untuk elemen `<video>` (bukan layar). Dipakai saat plugin
 * native tidak tersedia. Range sengaja terbatas agar tidak terlihat buruk.
 * Label UI harus menyebut "brightness video (fallback)", bukan screen brightness.
 */
export function videoBrightnessFilter(level: number): string {
  if (level <= BRIGHTNESS_AUTO) return 'none';
  const t = Math.max(0, Math.min(BRIGHTNESS_MAX_LEVEL, level)) / BRIGHTNESS_MAX_LEVEL;
  // level 0 → 0.35 (redup), level 15 → ~0.68, level 30 → 1.0 (+ boost ringan)
  const value = level >= BRIGHTNESS_MAX_LEVEL ? 1.15 : 0.35 + t * 0.65;
  return `brightness(${value.toFixed(2)})`;
}

export async function setNativeBrightness(level: number): Promise<boolean> {
  const next = level <= BRIGHTNESS_AUTO ? BRIGHTNESS_AUTO : Math.max(0, Math.min(BRIGHTNESS_MAX_LEVEL, Math.round(level)));
  try {
    await BrightnessNative.setBrightness({ level: next });
    return true;
  } catch {
    return false;
  }
}

export async function getNativeBrightness(): Promise<number | null> {
  try {
    const result = await BrightnessNative.getBrightness();
    return typeof result.level === 'number' ? result.level : null;
  } catch {
    return null;
  }
}

/** Kembalikan Window ke auto saat sesi player berakhir (lifecycle). */
export function restoreNativeBrightness(): void {
  void setNativeBrightness(BRIGHTNESS_AUTO).catch(() => undefined);
}
