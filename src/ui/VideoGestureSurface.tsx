import type { ReactNode, RefObject } from 'react';
import type { PlayerGesturesApi } from './usePlayerGestures';
import { BrightnessIndicator, DoubleTapFeedback, SeekIndicator, VolumeIndicator } from './PlayerGestureIndicators';
import { Icon } from './icons';

interface VideoGestureSurfaceProps {
  containerRef: RefObject<HTMLDivElement | null>;
  gestures: PlayerGesturesApi;
  enabled: boolean;
  media: ReactNode;
  controls?: ReactNode;
  /** Klik sintetis tanpa pointer events (mis. mouse/WebView lama, test). */
  onSurfaceClick?: () => void;
}

/**
 * Permukaan gesture video (adaptasi perilaku JustPlayer, bukan UI JustPlayer).
 * - Kiri: brightness vertikal (native Window override, fallback CSS video-only).
 * - Kanan: volume vertikal (HTMLMediaElement.volume, satu-satunya sumber).
 * - Horizontal: seek dengan preview + commit saat lepas (pause-resume).
 * - Double-tap kiri/kanan: ±10s akumulatif (YouTubeOverlay), tengah: play/pause.
 * - Long-press: lock (JustPlayer onLongPress). Pinch: zoom 1..3.5.
 * - Single-tap: toggle kontrol (bukan play/pause, agar tidak konflik double-tap).
 * UI indikator memakai Liquid Glass (glass hanya di lapisan overlay).
 */
export function VideoGestureSurface({ containerRef, gestures, enabled, media, controls, onSurfaceClick }: VideoGestureSurfaceProps) {
  return (
    <div
      ref={containerRef}
      className={`episode-player-video player-gesture-surface${gestures.locked ? ' player-gesture-surface--locked' : ''}`}
      {...gestures.handlers}
      onClick={event => {
        // Klik yang mengikuti pointer-tap sudah ditangani jalur gesture
        // (koordinasi wasRecentTap); hanya klik tanpa pointer yang diproses.
        if (gestures.locked || !enabled) return;
        if (gestures.wasRecentTap()) return;
        if ((event.target as HTMLElement | null)?.closest('button, input, select, textarea, a, label')) return;
        onSurfaceClick?.();
      }}
      data-phase={gestures.phase}
      data-locked={gestures.locked ? 'true' : 'false'}
    >
      <div
        data-nanime-media
        className="player-gesture-media"
        style={{
          transform: `scale(${gestures.scale})`,
          transformOrigin: `${gestures.pinchOrigin.x}% ${gestures.pinchOrigin.y}%`,
        }}
      >
        {media}
      </div>

      {enabled && !gestures.locked && gestures.phase === 'brightness' ? (
        <BrightnessIndicator
          percent={gestures.brightnessPercent}
          auto={gestures.brightnessLevel <= -1}
          source={gestures.brightnessSource}
        />
      ) : null}
      {enabled && !gestures.locked && gestures.phase === 'volume' ? (
        <VolumeIndicator percent={gestures.volume} />
      ) : null}
      {enabled && !gestures.locked && gestures.phase === 'seeking' && gestures.seekPreview ? (
        <SeekIndicator start={gestures.seekPreview.start} target={gestures.seekPreview.target} delta={gestures.seekPreview.delta} />
      ) : null}
      {enabled && !gestures.locked && gestures.doubleTap ? (
        <DoubleTapFeedback key={gestures.doubleTap.key} direction={gestures.doubleTap.direction} seconds={gestures.doubleTap.seconds} />
      ) : null}

      {enabled && gestures.scale > 1.01 && !gestures.locked ? (
        <button
          type="button"
          className="player-gesture-resetzoom"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            gestures.resetZoom();
            gestures.showControls();
          }}
          aria-label={`Reset zoom ${Math.round(gestures.scale * 100)} persen`}
        >
          <Icon name="collapse" size={16} />
          {Math.round(gestures.scale * 100)}%
        </button>
      ) : null}

      {enabled && gestures.locked ? (
        <button
          type="button"
          className="player-gesture-unlock"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            gestures.unlock();
          }}
          aria-label="Buka kunci layar"
        >
          <Icon name="unlock" size={18} />
          <span>Unlock</span>
        </button>
      ) : null}

      {controls}
    </div>
  );
}
