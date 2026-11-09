/**
 * Helper murni untuk gesture player Nanime.
 *
 * Adaptasi perilaku JustPlayer (CustomStyledPlayerView + YouTubeOverlay /
 * DoubleTapPlayerView + BrightnessControl), bukan porting kode Java:
 * - Brightness: level 0..30 + auto (-1), kurva kuadratik (lihat nativeBrightness).
 * - Volume: system-step AudioManager di JustPlayer → HTMLMediaElement.volume
 *   di Nanime (satu-satunya sumber volume Nanime; tidak ada volume boost).
 * - Seek: JustPlayer stepwise SEEK_STEP 1000ms × distanceDiff (dp/4) dengan
 *   live seekTo dan pause-resume; Nanime memakai preview + commit sekali
 *   (currentTime stabil di WebView/HLS).
 * - Double-tap: 10 detik/tap akumulatif dalam jendela 650ms (YouTubeOverlay).
 * - Pinch: JustPlayer clamp [fit, 2.0] + smoothing; Nanime [1, 3.5] karena
 *   transform CSS tidak memaksa RESIZE_MODE_ZOOM seperti ExoPlayer.
 */
import { BRIGHTNESS_AUTO, BRIGHTNESS_MAX_LEVEL, brightnessLevelToPercent } from '../lib/nativeBrightness';

export { BRIGHTNESS_AUTO, BRIGHTNESS_MAX_LEVEL, brightnessLevelToPercent };

export type GesturePhase = 'idle' | 'pending' | 'brightness' | 'volume' | 'seeking' | 'pinching';
export type GestureZone = 'left' | 'center' | 'right';

export const GESTURE_CONSTANTS = {
  /** Slop px sebelum arah gesture ditentukan (JustPlayer SCROLL_STEP 16dp). */
  slopPx: 10,
  /** Jendela double-tap (JustPlayer/YouTubeOverlay 650ms). */
  doubleTapWindowMs: 650,
  /** Jeda tunggu single-tap sebelum dieksekusi (setelah tap pertama). */
  singleTapDelayMs: 280,
  /** Long-press untuk lock (JustPlayer onLongPress). */
  longPressMs: 500,
  /** Detik per double-tap (YouTubeOverlay seekSeconds = 10). */
  doubleTapSeekSec: 10,
  /** Range seek untuk swipe penuh lebar container (detik). */
  seekFullWidthSec: 120,
  minScale: 1,
  maxScale: 3.5,
  /** Timeout auto-hide kontrol saat lag gesture. */
  controlsHideMs: 2500,
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function zoneForX(x: number, width: number): GestureZone {
  if (width <= 0) return 'center';
  const t = x / width;
  if (t < 0.35) return 'left';
  if (t > 0.65) return 'right';
  return 'center';
}

/** Estimasi target seek preview dari delta pointer horizontal. */
export function seekTargetForDelta(startSec: number, deltaPx: number, widthPx: number, durationSec: number): number {
  if (widthPx <= 0) return startSec;
  const deltaSec = (deltaPx / widthPx) * GESTURE_CONSTANTS.seekFullWidthSec;
  const target = startSec + deltaSec;
  const max = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : Number.POSITIVE_INFINITY;
  return clamp(target, 0, max);
}

/** Format waktu seperti JustPlayer formatMilis (mm:ss / h:mm:ss). */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatSeekDelta(deltaSec: number): string {
  const rounded = Math.round(deltaSec);
  if (rounded === 0) return formatClock(0);
  const sign = rounded < 0 ? '−' : '+';
  return `${sign}${formatClock(Math.abs(rounded))}`;
}

export function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}
