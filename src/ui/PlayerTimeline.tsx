import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Timeline pemutar dipisah dari PlayerOverlay agar event `timeupdate` hanya
 * merender label waktu dan slider, bukan seluruh overlay pemutar.
 */
function useVideoTimeline(mediaRef: RefObject<HTMLVideoElement | null>) {
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = mediaRef.current;
    if (!video) return;
    const sync = () => {
      const next = video.currentTime || 0;
      setPlayhead(current => (Math.floor(current) === Math.floor(next) ? current : next));
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(current => (current === nextDuration ? current : nextDuration));
    };
    sync();
    video.addEventListener('timeupdate', sync);
    video.addEventListener('durationchange', sync);
    video.addEventListener('loadedmetadata', sync);
    return () => {
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('loadedmetadata', sync);
    };
  }, [mediaRef]);

  const seek = useCallback((value: number) => {
    const video = mediaRef.current;
    if (video) video.currentTime = value;
    setPlayhead(value);
  }, [mediaRef]);

  return { playhead, duration, seek };
}

export function PlayerTimeLabel({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | null> }) {
  const { playhead, duration } = useVideoTimeline(mediaRef);
  return <span className="player-time">{clockTime(playhead)} / {clockTime(duration)}</span>;
}

export function PlayerSeekBar({ mediaRef }: { mediaRef: RefObject<HTMLVideoElement | null> }) {
  const { playhead, duration, seek } = useVideoTimeline(mediaRef);
  return (
    <input
      aria-label="Posisi video"
      type="range"
      min="0"
      max={duration || 1}
      step="1"
      value={Math.min(playhead, duration || 0)}
      onChange={event => seek(Number(event.target.value))}
    />
  );
}

function clockTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
