import { useCallback, useEffect, useRef } from 'react';
import type { Ref } from 'react';

export const MEDIA_LOAD_TIMEOUT_MS = 15_000;
export const ADAPTIVE_LOAD_TIMEOUT_MS = 30_000;
export const PLAYBACK_STALL_TIMEOUT_MS = 15_000;
export const ADAPTIVE_STALL_TIMEOUT_MS = 30_000;

export interface AdaptiveVideoProps {
  src: string;
  poster?: string;
  onTimeUpdate?: React.ReactEventHandler<HTMLVideoElement>;
  onPause?: React.ReactEventHandler<HTMLVideoElement>;
  onEnded?: React.ReactEventHandler<HTMLVideoElement>;
  onPlay?: React.ReactEventHandler<HTMLVideoElement>;
  onCanPlay?: React.ReactEventHandler<HTMLVideoElement>;
  volume?: number;
  videoElementRef?: Ref<HTMLVideoElement>;
  fit?: 'contain' | 'cover';
  onError: () => void;
}

/** Native MP4 playback with a lazy HLS chunk and browser-native DASH where available. */
export function AdaptiveVideo({ src, poster, onTimeUpdate, onPause, onEnded, onPlay, onCanPlay, onError, volume = 1, videoElementRef, fit = 'contain' }: AdaptiveVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const erroredRef = useRef(false);
  const resetPlaybackWatchdogRef = useRef<() => void>(() => undefined);
  const reportError = useCallback(() => {
    if (erroredRef.current) return;
    erroredRef.current = true;
    onError();
  }, [onError]);
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
    let recoveredMediaError = false;
    let player: { destroy?: () => void; reset?: () => void; recoverMediaError?: () => void } | null = null;

    const attach = async () => {
      try {
        if (hls) {
          const module = await import('hls.js');
          if (disposed) return;
          const Hls = module.default;
          if (Hls.isSupported()) {
            const instance = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30 });
            player = instance;
            const noteHlsData = () => resetPlaybackWatchdogRef.current();
            instance.on(Hls.Events.ERROR, (_event, data) => {
              if (!data.fatal) {
                resetPlaybackWatchdogRef.current();
                return;
              }
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError && typeof instance.recoverMediaError === 'function') {
                recoveredMediaError = true;
                try {
                  instance.recoverMediaError();
                  resetPlaybackWatchdogRef.current();
                  return;
                } catch {
                  reportError();
                  return;
                }
              }
              reportError();
            });
            [Hls.Events.FRAG_LOADING, Hls.Events.FRAG_LOADED, Hls.Events.FRAG_BUFFERED, Hls.Events.LEVEL_LOADED]
              .forEach(event => instance.on(event, noteHlsData));
            instance.loadSource(src);
            instance.attachMedia(video);
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            video.load();
          } else reportError();
          return;
        }
        if (video.canPlayType('application/dash+xml')) {
          video.src = src;
          video.load();
        } else reportError();
      } catch {
        if (!disposed) reportError();
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
  }, [src, adaptive, hls, reportError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const timeout = adaptive ? ADAPTIVE_LOAD_TIMEOUT_MS : MEDIA_LOAD_TIMEOUT_MS;
    let ready = video.readyState >= 2;
    let disposed = false;
    let timer: number | null = null;
    const clear = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };
    const arm = () => {
      clear();
      timer = window.setTimeout(() => {
        timer = null;
        if (!ready && !disposed) reportError();
      }, timeout);
    };
    const markReady = () => {
      ready = true;
      clear();
    };
    const markProgress = () => {
      if (!ready && !disposed) arm();
    };
    const readyEvents = ['loadeddata', 'canplay', 'playing'];
    readyEvents.forEach(event => video.addEventListener(event, markReady));
    video.addEventListener('progress', markProgress);
    if (ready) markReady();
    else arm();
    return () => {
      disposed = true;
      clear();
      readyEvents.forEach(event => video.removeEventListener(event, markReady));
      video.removeEventListener('progress', markProgress);
    };
  }, [src, adaptive, reportError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const timeout = adaptive ? ADAPTIVE_STALL_TIMEOUT_MS : PLAYBACK_STALL_TIMEOUT_MS;
    let active = false;
    let seeking = false;
    let disposed = false;
    let lastTime = video.currentTime;
    let timer: number | null = null;
    const clear = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };
    const arm = () => {
      clear();
      timer = window.setTimeout(() => {
        timer = null;
        if (disposed || !active || seeking || video.paused || video.ended) return;
        if (video.currentTime > lastTime + 0.01) {
          lastTime = video.currentTime;
          arm();
          return;
        }
        reportError();
      }, timeout);
    };
    const reset = () => {
      if (!active || seeking) return;
      lastTime = video.currentTime;
      arm();
    };
    const start = () => {
      active = true;
      reset();
    };
    const stop = () => {
      active = false;
      clear();
    };
    const noteAdvance = () => {
      if (!active || seeking || video.paused || video.ended || video.currentTime <= lastTime + 0.01) return;
      lastTime = video.currentTime;
      arm();
    };
    const noteData = () => {
      if (active && !seeking && !video.paused && !video.ended) arm();
    };
    const noteWaiting = () => {
      if (active && !seeking && !video.paused && !video.ended) arm();
    };
    const beginSeeking = () => {
      seeking = true;
      clear();
    };
    const endSeeking = () => {
      seeking = false;
      reset();
    };
    resetPlaybackWatchdogRef.current = reset;
    video.addEventListener('play', start);
    video.addEventListener('playing', start);
    video.addEventListener('pause', stop);
    video.addEventListener('ended', stop);
    video.addEventListener('timeupdate', noteAdvance);
    video.addEventListener('progress', noteData);
    video.addEventListener('seeking', beginSeeking);
    video.addEventListener('seeked', endSeeking);
    video.addEventListener('waiting', noteWaiting);
    video.addEventListener('stalled', noteWaiting);
    video.addEventListener('emptied', stop);
    return () => {
      disposed = true;
      clear();
      resetPlaybackWatchdogRef.current = () => undefined;
      video.removeEventListener('play', start);
      video.removeEventListener('playing', start);
      video.removeEventListener('pause', stop);
      video.removeEventListener('ended', stop);
      video.removeEventListener('timeupdate', noteAdvance);
      video.removeEventListener('progress', noteData);
      video.removeEventListener('seeking', beginSeeking);
      video.removeEventListener('seeked', endSeeking);
      video.removeEventListener('waiting', noteWaiting);
      video.removeEventListener('stalled', noteWaiting);
      video.removeEventListener('emptied', stop);
    };
  }, [src, adaptive, reportError]);

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
    onCanPlay={onCanPlay}
    onError={adaptive ? undefined : reportError}
    style={{ objectFit: fit }}
  />;
}
