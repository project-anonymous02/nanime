import { useCallback, useEffect, useRef, useState } from 'react';
import { BRIGHTNESS_AUTO, BRIGHTNESS_MAX_LEVEL, setNativeBrightness, videoBrightnessFilter } from '../lib/nativeBrightness';
import { GESTURE_CONSTANTS, clamp, distance, seekTargetForDelta, zoneForX, type GesturePhase } from './playerGestures';

export type BrightnessSource = 'native' | 'css';
export type DoubleTapFeedback = { direction: 'forward' | 'rewind'; seconds: number; key: number } | null;
export type SeekPreview = { start: number; target: number; delta: number } | null;

interface PointerPoint {
  x: number;
  y: number;
  id: number;
}

interface UsePlayerGesturesOptions {
  mediaRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  /** Hanya aktif untuk file source + mode full (bukan mini/iframe). */
  enabled: boolean;
  /** Single-tap (setelah jeda double-tap) → toggle kontrol. */
  onSingleTap?: () => void;
  /** Double-tap zona tengah → toggle play/pause (JustPlayer). */
  onTogglePlay?: () => void;
}

const C = GESTURE_CONSTANTS;

export function usePlayerGestures({ mediaRef, containerRef, enabled, onSingleTap, onTogglePlay }: UsePlayerGesturesOptions) {
  const [phase, setPhase] = useState<GesturePhase>('idle');
  const [locked, setLocked] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(BRIGHTNESS_AUTO);
  const [brightnessSource, setBrightnessSource] = useState<BrightnessSource>('native');
  const [volume, setVolume] = useState(100);
  const [seekPreview, setSeekPreview] = useState<SeekPreview>(null);
  const [doubleTap, setDoubleTap] = useState<DoubleTapFeedback>(null);
  const [scale, setScale] = useState(1);
  const [pinchOrigin, setPinchOrigin] = useState({ x: 50, y: 50 });
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsVisibleRef = useRef(true);
  const setControlsVisibleBoth = useCallback((next: boolean) => {
    controlsVisibleRef.current = next;
    setControlsVisible(next);
  }, []);

  const pointsRef = useRef<Map<number, PointerPoint>>(new Map());
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startTime: number;
    wasPlaying: boolean;
    startSec: number;
    startBrightnessLevel: number;
    startVolume: number;
    moved: boolean;
    longPressTimer: number | null;
    singleTapTimer: number | null;
    lastTap: { x: number; y: number; t: number } | null;
    doubleTapTimer: number | null;
    doubleSeconds: number;
    doubleDirection: 'forward' | 'rewind' | null;
    wasDoubleTap: boolean;
  }>({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startTime: 0,
    wasPlaying: false,
    startSec: 0,
    startBrightnessLevel: BRIGHTNESS_AUTO,
    startVolume: 100,
    moved: false,
    longPressTimer: null,
    singleTapTimer: null,
    lastTap: null,
    doubleTapTimer: null,
    doubleSeconds: 0,
    doubleDirection: null,
    wasDoubleTap: false,
  });

  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ dx: number; dy: number; x: number; y: number } | null>(null);
  const hideControlsTimerRef = useRef<number | null>(null);
  const lastTapHandledAtRef = useRef(0);
  const brightnessLevelRef = useRef(BRIGHTNESS_AUTO);
  const volumeRef = useRef(100);
  const scaleRef = useRef(1);
  const lockedRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const callbacksRef = useRef({ onSingleTap, onTogglePlay });
  callbacksRef.current = { onSingleTap, onTogglePlay };

  const phaseRef = useRef<GesturePhase>('idle');
  const setPhaseBoth = useCallback((next: GesturePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearLongPress = useCallback(() => {
    if (gestureRef.current.longPressTimer !== null) {
      window.clearTimeout(gestureRef.current.longPressTimer);
      gestureRef.current.longPressTimer = null;
    }
  }, []);

  const clearSingleTap = useCallback(() => {
    if (gestureRef.current.singleTapTimer !== null) {
      window.clearTimeout(gestureRef.current.singleTapTimer);
      gestureRef.current.singleTapTimer = null;
    }
  }, []);

  const clearDoubleTap = useCallback(() => {
    if (gestureRef.current.doubleTapTimer !== null) {
      window.clearTimeout(gestureRef.current.doubleTapTimer);
      gestureRef.current.doubleTapTimer = null;
    }
    gestureRef.current.doubleDirection = null;
    gestureRef.current.doubleSeconds = 0;
  }, []);

  const showControls = useCallback(() => {
    setControlsVisibleBoth(true);
  }, [setControlsVisibleBoth]);

  const hideControls = useCallback(() => {
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    setControlsVisibleBoth(false);
  }, [setControlsVisibleBoth]);

  const armControlsAutoHide = useCallback(() => {
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    const video = mediaRef.current;
    if (video && !video.paused && !video.ended && !lockedRef.current) {
      hideControlsTimerRef.current = window.setTimeout(() => {
        if (!lockedRef.current) setControlsVisibleBoth(false);
      }, C.controlsHideMs);
    } else {
      setControlsVisibleBoth(true);
    }
  }, [mediaRef, setControlsVisibleBoth]);

  const toggleControls = useCallback(() => {
    if (controlsVisibleRef.current) {
      if (hideControlsTimerRef.current !== null) {
        window.clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
      setControlsVisibleBoth(false);
    } else {
      setControlsVisibleBoth(true);
    }
  }, [setControlsVisibleBoth]);

  useEffect(() => {
    const video = mediaRef.current;
    if (!video) return;
    const onPlay = () => armControlsAutoHide();
    const onPause = () => {
      if (hideControlsTimerRef.current !== null) {
        window.clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
      setControlsVisibleBoth(true);
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
    // Re-arm saat elemen berganti (source switch) via mediaRef.
  }, [mediaRef, armControlsAutoHide, setControlsVisibleBoth]);

  const applyBrightness = useCallback((level: number) => {
    brightnessLevelRef.current = level;
    setBrightnessLevel(level);
    void setNativeBrightness(level).then(ok => {
      if (!ok) setBrightnessSource('css');
    });
  }, []);

  const applyVolume = useCallback((percent: number) => {
    const next = clamp(Math.round(percent), 0, 100);
    volumeRef.current = next;
    setVolume(next);
    const video = mediaRef.current;
    if (video) {
      video.volume = next / 100;
      video.muted = next === 0;
    }
  }, [mediaRef]);

  const setScaleBoth = useCallback((next: number) => {
    scaleRef.current = next;
    setScale(next);
  }, []);

  const applyTransform = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const mediaWrap = container.querySelector<HTMLElement>('[data-nanime-media]');
    if (mediaWrap) {
      mediaWrap.style.transform = `scale(${scaleRef.current})`;
    }
  }, [containerRef]);

  const resetZoom = useCallback(() => {
    setScaleBoth(1);
    setPinchOrigin({ x: 50, y: 50 });
    requestAnimationFrame(() => applyTransform());
  }, [applyTransform, setScaleBoth]);

  const toggleLock = useCallback(() => {
    setLocked(current => {
      const next = !current;
      lockedRef.current = next;
      if (next) {
        clearLongPress();
        clearSingleTap();
        clearDoubleTap();
        setSeekPreview(null);
        setDoubleTap(null);
        pinchRef.current = null;
        pointsRef.current.clear();
        setPhaseBoth('idle');
        setControlsVisibleBoth(false);
      } else {
        setControlsVisibleBoth(true);
      }
      return next;
    });
  }, [clearDoubleTap, clearLongPress, clearSingleTap, setControlsVisibleBoth, setPhaseBoth]);

  const unlock = useCallback(() => {
    if (lockedRef.current) toggleLock();
  }, [toggleLock]);

  /** Reset saat ganti episode/sumber: zoom, preview, akumulasi double-tap. */
  const resetGestures = useCallback(() => {
    clearLongPress();
    clearSingleTap();
    clearDoubleTap();
    pointsRef.current.clear();
    pinchRef.current = null;
    setSeekPreview(null);
    setDoubleTap(null);
    setScaleBoth(1);
    setPhaseBoth('idle');
    requestAnimationFrame(() => applyTransform());
  }, [applyTransform, clearDoubleTap, clearLongPress, clearSingleTap, setPhaseBoth, setScaleBoth]);

  const seekBy = useCallback((deltaSec: number) => {
    const video = mediaRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
    const target = clamp(video.currentTime + deltaSec, 0, duration);
    video.currentTime = target;
  }, [mediaRef]);

  const handleDoubleTap = useCallback((x: number, y: number, width: number) => {
    const zone = zoneForX(x, width);
    if (zone === 'center') {
      callbacksRef.current.onTogglePlay?.();
      clearDoubleTap();
      setDoubleTap(null);
      return;
    }
    const direction: 'forward' | 'rewind' = zone === 'right' ? 'forward' : 'rewind';
    const g = gestureRef.current;
    if (g.doubleDirection !== direction) {
      g.doubleDirection = direction;
      g.doubleSeconds = 0;
    }
    g.doubleSeconds += C.doubleTapSeekSec;
    seekBy(direction === 'forward' ? C.doubleTapSeekSec : -C.doubleTapSeekSec);
    setDoubleTap({ direction, seconds: g.doubleSeconds, key: Date.now() });
    if (g.doubleTapTimer !== null) window.clearTimeout(g.doubleTapTimer);
    g.doubleTapTimer = window.setTimeout(() => {
      g.doubleDirection = null;
      g.doubleSeconds = 0;
      g.doubleTapTimer = null;
      setDoubleTap(null);
    }, C.doubleTapWindowMs + 400);
    gestureRef.current.wasDoubleTap = true;
  }, [clearDoubleTap, seekBy]);

  const processMove = useCallback((dxTotal: number, dyTotal: number, x: number, y: number) => {
    const container = containerRef.current;
    const video = mediaRef.current;
    if (!container || !video) return;
    const rect = container.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const g = gestureRef.current;

    // Pinch sudah ditangani terpisah.
    if (pointsRef.current.size >= 2) return;

    const adx = Math.abs(dxTotal);
    const ady = Math.abs(dyTotal);
    if (!g.moved) {
      if (adx < C.slopPx && ady < C.slopPx) return;
      g.moved = true;
      clearLongPress();

      if (adx > ady) {
        setPhaseBoth('seeking');
        g.startSec = video.currentTime;
        g.wasPlaying = !video.paused && !video.ended;
        if (g.wasPlaying) {
          try {
            video.pause();
          } catch {
            /* abaikan */
          }
        }
      } else {
        const zone = zoneForX(x, width);
        const isLeft = zone === 'left';
        setPhaseBoth(isLeft ? 'brightness' : 'volume');
        g.startBrightnessLevel = brightnessLevelRef.current;
        g.startVolume = volumeRef.current;
      }
      showControls();
    }

    const currentPhase = phaseRef.current;
    if (currentPhase === 'seeking') {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = seekTargetForDelta(g.startSec, dxTotal, width, duration);
      setSeekPreview({ start: g.startSec, target, delta: target - g.startSec });
    } else if (currentPhase === 'brightness') {
      const range = BRIGHTNESS_MAX_LEVEL + 1; // termasuk auto
      const startLevel = g.startBrightnessLevel <= BRIGHTNESS_AUTO ? 15 : g.startBrightnessLevel;
      const deltaLevels = (-dyTotal / height) * range;
      const next = g.startBrightnessLevel <= BRIGHTNESS_AUTO && dyTotal >= 0
        ? BRIGHTNESS_AUTO
        : clamp(Math.round(startLevel + deltaLevels), 0, BRIGHTNESS_MAX_LEVEL);
      if (next !== brightnessLevelRef.current) applyBrightness(next);
    } else if (currentPhase === 'volume') {
      const deltaPercent = (-dyTotal / height) * 100;
      applyVolume(g.startVolume + deltaPercent);
    }
    void x;
    void y;
  }, [applyBrightness, applyVolume, clearLongPress, containerRef, mediaRef, setPhaseBoth, showControls]);

  const scheduleMove = useCallback((dxTotal: number, dyTotal: number, x: number, y: number) => {
    pendingMoveRef.current = { dx: dxTotal, dy: dyTotal, x, y };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (pending) processMove(pending.dx, pending.dy, pending.x, pending.y);
    });
  }, [processMove]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current || lockedRef.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a, label, [data-nanime-no-gesture]')) return;

    const container = containerRef.current;
    if (!container) return;
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      /* capture tidak tersedia (mouse di sebagian WebView) */
    }
    pointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY, id: event.pointerId });
    const g = gestureRef.current;
    g.startX = event.clientX;
    g.startY = event.clientY;
    g.lastX = event.clientX;
    g.lastY = event.clientY;
    g.startTime = event.timeStamp;
    g.moved = false;
    g.wasDoubleTap = false;

    if (pointsRef.current.size >= 2) {
      // Masuk pinch: batalkan seek/brightness/volume yang sedang berjalan.
      clearLongPress();
      setSeekPreview(null);
      const pts = Array.from(pointsRef.current.values());
      if (pts.length === 2) {
        pinchRef.current = { startDist: distance(pts[0], pts[1]), startScale: scaleRef.current };
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const rect = container.getBoundingClientRect();
        const ox = rect.width > 0 ? clamp(((midX - rect.left) / rect.width) * 100, 0, 100) : 50;
        const oy = rect.height > 0 ? clamp(((midY - rect.top) / rect.height) * 100, 0, 100) : 50;
        setPinchOrigin({ x: ox, y: oy });
        const mediaWrap = container.querySelector<HTMLElement>('[data-nanime-media]');
        if (mediaWrap) {
          mediaWrap.style.transformOrigin = `${ox}% ${oy}%`;
          mediaWrap.style.transform = `scale(${scaleRef.current})`;
        }
      }
      setPhaseBoth('pinching');
      event.preventDefault();
      return;
    }

    setPhaseBoth('pending');
    clearLongPress();
    const startX = event.clientX;
    const startY = event.clientY;
    g.longPressTimer = window.setTimeout(() => {
      g.longPressTimer = null;
      if (pointsRef.current.size === 1 && !gestureRef.current.moved) {
        toggleLock();
      }
    }, C.longPressMs);
    void startX;
    void startY;
  }, [clearLongPress, containerRef, setPhaseBoth, toggleLock]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current || lockedRef.current) return;
    if (!pointsRef.current.has(event.pointerId)) return;
    pointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY, id: event.pointerId });
    const g = gestureRef.current;

    if (pointsRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointsRef.current.values());
      if (pts.length === 2 && pinchRef.current.startDist > 0) {
        const nextDist = distance(pts[0], pts[1]);
        const ratio = nextDist / pinchRef.current.startDist;
        const nextScale = clamp(pinchRef.current.startScale * ratio, C.minScale, C.maxScale);
        scaleRef.current = nextScale;
        setScale(nextScale);
        const container = containerRef.current;
        const mediaWrap = container?.querySelector<HTMLElement>('[data-nanime-media]');
        if (mediaWrap) mediaWrap.style.transform = `scale(${nextScale})`;
      }
      event.preventDefault();
      return;
    }

    if (pointsRef.current.size !== 1) return;
    const dxTotal = event.clientX - g.startX;
    const dyTotal = event.clientY - g.startY;
    if (Math.abs(dxTotal) + Math.abs(dyTotal) > 2) {
      scheduleMove(dxTotal, dyTotal, event.clientX, event.clientY);
    }
  }, [containerRef, scheduleMove]);

  const finishGesture = useCallback((cancelled: boolean) => {
    const g = gestureRef.current;
    clearLongPress();

    if (phaseRef.current === 'seeking' && !cancelled) {
      setSeekPreview(current => {
        if (current) {
          const video = mediaRef.current;
          if (video) {
            video.currentTime = clamp(current.target, 0, Number.isFinite(video.duration) ? video.duration : current.target);
          }
        }
        return null;
      });
      const video = mediaRef.current;
      if (video && g.wasPlaying && !cancelled) {
        void video.play().catch(() => undefined);
      }
      g.wasPlaying = false;
    } else if (phaseRef.current === 'seeking' && cancelled) {
      setSeekPreview(null);
      g.wasPlaying = false;
    }

    if (pointsRef.current.size <= 1) {
      pinchRef.current = null;
    }
    setPhaseBoth('idle');
    pendingMoveRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    armControlsAutoHide();
  }, [armControlsAutoHide, clearLongPress, mediaRef, setPhaseBoth]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabledRef.current || lockedRef.current) {
      pointsRef.current.delete(event.pointerId);
      return;
    }
    const wasTracked = pointsRef.current.has(event.pointerId);
    pointsRef.current.delete(event.pointerId);
    if (!wasTracked) return;

    const g = gestureRef.current;
    const totalMove = Math.hypot(event.clientX - g.startX, event.clientY - g.startY);
    const durationMs = event.timeStamp - g.startTime;
    const wasPinching = phaseRef.current === 'pinching' || (pointsRef.current.size >= 1 && pinchRef.current !== null);

    if (wasPinching) {
      finishGesture(false);
      return;
    }

    if (!g.moved && totalMove < C.slopPx && durationMs < 500) {
      // Tap.
      lastTapHandledAtRef.current = Date.now();
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const tapX = rect ? event.clientX - rect.left : 0;
      const tapWidth = rect?.width ?? 0;
      const last = g.lastTap;
      const now = event.timeStamp;
      const isDouble = last !== null && now - last.t <= C.doubleTapWindowMs;

      if (isDouble) {
        clearSingleTap();
        g.lastTap = null;
        handleDoubleTap(tapX, event.clientY, tapWidth);
        finishGesture(false);
        return;
      }

      g.lastTap = { x: tapX, y: event.clientY, t: now };
      clearSingleTap();
      g.singleTapTimer = window.setTimeout(() => {
        g.singleTapTimer = null;
        g.lastTap = null;
        callbacksRef.current.onSingleTap?.();
        // Fallback: jika tidak ada handler, toggle langsung.
        if (!callbacksRef.current.onSingleTap) toggleControls();
      }, C.singleTapDelayMs);
    }

    finishGesture(false);
  }, [clearSingleTap, containerRef, finishGesture, handleDoubleTap, toggleControls]);

  const onPointerCancel = useCallback((event: React.PointerEvent<HTMLElement>) => {
    pointsRef.current.delete(event.pointerId);
    g_cancel();
    function g_cancel() {
      finishGesture(true);
    }
  }, [finishGesture]);

  useEffect(() => {
    void onPointerCancel;
  }, [onPointerCancel]);

  useEffect(() => () => {
    clearLongPress();
    clearSingleTap();
    clearDoubleTap();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (hideControlsTimerRef.current !== null) window.clearTimeout(hideControlsTimerRef.current);
  },
  [clearDoubleTap, clearLongPress, clearSingleTap]);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      lockedRef.current = false;
      resetGestures();
    }
  }, [enabled, resetGestures]);

  const wasRecentTap = useCallback(() => Date.now() - lastTapHandledAtRef.current < 700, []);

  const brightnessPercent = brightnessLevel <= BRIGHTNESS_AUTO
    ? 100
    : Math.round((Math.min(BRIGHTNESS_MAX_LEVEL, Math.max(0, brightnessLevel)) / BRIGHTNESS_MAX_LEVEL) * 100);

  return {
    phase,
    locked,
    brightnessLevel,
    brightnessPercent,
    brightnessSource,
    videoFilter: brightnessSource === 'css' ? videoBrightnessFilter(brightnessLevel) : 'none',
    volume,
    muted: volume === 0,
    seekPreview,
    doubleTap,
    scale,
    pinchOrigin,
    controlsVisible,
    setControlsVisible,
    showControls,
    hideControls,
    toggleControls,
    toggleLock,
    unlock,
    resetZoom,
    resetGestures,
    armControlsAutoHide,
    wasRecentTap,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}

export type PlayerGesturesApi = ReturnType<typeof usePlayerGestures>;
