import { useCallback, useEffect, useRef } from 'react';
import type { Ref } from 'react';

export interface AdaptiveVideoProps {
  src: string;
  poster?: string;
  onTimeUpdate?: React.ReactEventHandler<HTMLVideoElement>;
  onPause?: React.ReactEventHandler<HTMLVideoElement>;
  onEnded?: React.ReactEventHandler<HTMLVideoElement>;
  onPlay?: React.ReactEventHandler<HTMLVideoElement>;
  volume?: number;
  videoElementRef?: Ref<HTMLVideoElement>;
  fit?: 'contain' | 'cover';
  onError: () => void;
}

/** Native MP4 playback with a lazy HLS chunk and browser-native DASH where available. */
export function AdaptiveVideo({ src, poster, onTimeUpdate, onPause, onEnded, onPlay, onError, volume = 1, videoElementRef, fit = 'contain' }: AdaptiveVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hls = /\.m3u8(?:[?#]|$)/i.test(src);
  const dash = /\.mpd(?:[?#]|$)/i.test(src);
  const adaptive = hls || dash;
  const attachRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (typeof videoElementRef === 'function') videoElementRef(node);
    else if (videoElementRef) (videoElementRef as { current: HTMLVideoElement | null }).current = node;
  }, [videoElementRef]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !adaptive) return;
    let disposed = false;
    let player: { destroy?: () => void; reset?: () => void } | null = null;

    const attach = async () => {
      try {
        if (hls) {
          const module = await import('hls.js');
          if (disposed) return;
          const Hls = module.default;
          if (Hls.isSupported()) {
            const instance = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 });
            player = instance;
            instance.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) onError(); });
            instance.loadSource(src);
            instance.attachMedia(video);
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            video.load();
          } else onError();
          return;
        }
        if (video.canPlayType('application/dash+xml')) {
          video.src = src;
          video.load();
        } else onError();
      } catch {
        if (!disposed) onError();
      }
    };
    void attach();

    return () => {
      disposed = true;
      if (player?.destroy) player.destroy();
      else if (player?.reset) player.reset();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, adaptive, hls, onError]);

  return <video
    ref={attachRef}
    src={adaptive ? undefined : src}
    poster={poster}
    controls={false}
    playsInline
    autoPlay
    onTimeUpdate={onTimeUpdate}
    onPause={onPause}
    onEnded={onEnded}
    onPlay={onPlay}
    onError={adaptive ? undefined : onError}
    style={{ objectFit: fit }}
  />;
}
