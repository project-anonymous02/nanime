import { Icon } from './icons';
import { formatClock, formatSeekDelta } from './playerGestures';

export function BrightnessIndicator({ percent, auto, source }: { percent: number; auto: boolean; source: 'native' | 'css' }) {
  const label = auto ? 'Auto' : `${percent}%`;
  return (
    <div className="player-gesture-indicator player-gesture-indicator--brightness" role="status" aria-label={`Brightness ${auto ? 'auto' : `${percent} persen`}`}>
      <Icon name={auto ? 'brightness' : 'brightness'} size={20} />
      <div className="player-gesture-meter" aria-hidden="true">
        <div className="player-gesture-meter-fill" style={{ height: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <span className="player-gesture-value">{label}</span>
      {source === 'css' && !auto ? <span className="player-gesture-fallback">Video</span> : null}
    </div>
  );
}

export function VolumeIndicator({ percent }: { percent: number }) {
  return (
    <div className="player-gesture-indicator player-gesture-indicator--volume" role="status" aria-label={`Volume ${percent} persen`}>
      <Icon name={percent === 0 ? 'mute' : 'volume'} size={20} />
      <div className="player-gesture-meter" aria-hidden="true">
        <div className="player-gesture-meter-fill" style={{ height: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <span className="player-gesture-value">{percent}%</span>
    </div>
  );
}

export function SeekIndicator({ start, target, delta }: { start: number; target: number; delta: number }) {
  const forward = delta >= 0;
  return (
    <div className="player-gesture-seek" role="status" aria-label={`Seek ke ${formatClock(target)}`}>
      <Icon name={forward ? 'seekFwd' : 'seekBack'} size={34} />
      <span className="player-gesture-seek-delta">{formatSeekDelta(delta)}</span>
      <span className="player-gesture-seek-time">
        {formatClock(start)} → {formatClock(target)}
      </span>
    </div>
  );
}

export function DoubleTapFeedback({ direction, seconds }: { direction: 'forward' | 'rewind'; seconds: number }) {
  return (
    <div className={`player-gesture-doubletap player-gesture-doubletap--${direction}`} role="status" aria-label={`${direction === 'forward' ? 'Maju' : 'Mundur'} ${seconds} detik`}>
      <Icon name={direction === 'forward' ? 'seekFwd' : 'seekBack'} size={48} />
      <span>{seconds}s</span>
    </div>
  );
}
