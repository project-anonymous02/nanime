import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type SyntheticEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlayer } from '../state/player';
import { useSettings } from '../state/settings';
import type { DownloadLink, StreamBundle } from '../core/types';
import { listenNativePipMode, setNativePipActive } from '../lib/nativePip';
import { AdaptiveVideo } from './AdaptiveVideo';
import { Icon } from './icons';

interface PlayableSource { label: string; provider: string; url: string; kind: 'file' | 'embed' }

/** Normalize persisted/provider data before it reaches JSX. Old cache rows can
 * outlive a deploy and may not satisfy the current StreamBundle shape. */
export function playableSourcesFrom(stream?: Partial<StreamBundle> | null): PlayableSource[] {
  const qualities: unknown[] = Array.isArray(stream?.qualities) ? stream.qualities : [];
  const servers: unknown[] = Array.isArray(stream?.servers) ? stream.servers : [];
  const qualitySources = qualities.flatMap((raw): PlayableSource[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as { label?: unknown; source?: unknown };
    if (!item.source || typeof item.source !== 'object') return [];
    const source = item.source as { url?: unknown; providerRef?: unknown; kind?: unknown };
    if (typeof source.url !== 'string' || !isHttpUrl(source.url)) return [];
    return [{
      label: typeof item.label === 'string' && item.label ? item.label : 'Sumber video',
      provider: typeof source.providerRef === 'string' ? source.providerRef : '',
      url: source.url,
      kind: source.kind === 'file' ? 'file' : 'embed'
    }];
  });
  const qualityUrls = new Set(qualitySources.map(source => source.url));
  const serverSources = servers.flatMap((raw): PlayableSource[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as { url?: unknown; label?: unknown; providerRef?: unknown };
    if (typeof item.url !== 'string' || !isHttpUrl(item.url) || qualityUrls.has(item.url)) return [];
    return [{
      label: typeof item.label === 'string' && item.label ? item.label : 'Server video',
      provider: typeof item.providerRef === 'string' ? item.providerRef : '',
      url: item.url,
      kind: stream?.sourceKind === 'direct-media' && /\.(?:m3u8|mp4|webm|mov|mpd)(?:[?#]|$)/i.test(item.url) ? 'file' : 'embed'
    }];
  });
  return [...qualitySources, ...serverSources];
}

function downloadsFrom(stream?: Partial<StreamBundle> | null): (DownloadLink & { group: string })[] {
  const groups: unknown[] = Array.isArray(stream?.downloads) ? stream.downloads : [];
  return groups.flatMap(group => {
    if (!group || typeof group !== 'object') return [];
    const value = group as { quality?: unknown; items?: unknown };
    if (!Array.isArray(value.items)) return [];
    return value.items.flatMap((raw: unknown): (DownloadLink & { group: string })[] => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Partial<DownloadLink>;
      return typeof item.url === 'string' && isHttpUrl(item.url)
        ? [{
            quality: typeof item.quality === 'string' ? item.quality : 'Lainnya',
            name: typeof item.name === 'string' ? item.name : 'Unduhan',
            url: item.url,
            availability: item.availability === 'verified' ? 'verified' : 'unverified',
            group: typeof value.quality === 'string' ? value.quality : 'Lainnya'
          }]
        : [];
    });
  });
}

const PROVIDER_NAMES: Record<string, string> = {
  otakudesu: 'Otakudesu',
  samehadaku: 'Samehadaku',
  animeku: 'Animeku',
  nekopoi: 'Nekopoi'
};

function providerName(id: string): string {
  return PROVIDER_NAMES[id] || id;
}

export function PlayerOverlay() {
  const location = useLocation();
  const session = usePlayer(state => state.session);
  const mode = usePlayer(state => state.mode);
  const update = usePlayer(state => state.update);
  const setMode = usePlayer(state => state.setMode);
  const close = usePlayer(state => state.close);
  const playerControls = useSettings(state => state.playerControls);
  const stream = session?.stream;
  const sources = useMemo(() => playableSourcesFrom(stream), [stream]);
  const onError = useCallback(() => {
    const current = usePlayer.getState().session;
    if (!current) return;
    const nextIndex = sources.findIndex((candidate, index) => index > current.sourceIndex && candidate.url !== sources[current.sourceIndex]?.url);
    if (nextIndex >= 0) update(current.request, { sourceIndex: nextIndex, error: '' });
    else update(current.request, { error: 'Browser tidak dapat memutar sumber ini. Coba server lain atau episode berikutnya.' });
  }, [sources, update]);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const didMoveRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [qualitiesOpen, setQualitiesOpen] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(1);
  const [gestureLabel, setGestureLabel] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [playbackRate, setPlaybackRate] = useState(1);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const gestureRef = useRef<{ pointerId: number; y: number; value: number; kind: 'brightness' | 'volume' } | null>(null);
  const gestureTimer = useRef<number | null>(null);
  const boxRef = useRef<HTMLElement | null>(null);

  const onTimeUpdate = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const nextPosition = event.currentTarget.currentTime || 0;
    const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
    setPlayhead(current => Math.floor(current) === Math.floor(nextPosition) ? current : nextPosition);
    setDuration(current => current === nextDuration ? current : nextDuration);
    session?.onProgress(event);
  }, [session?.onProgress]);

  useEffect(() => {
    if (!session) return;
    setMode(location.pathname.startsWith('/detail/') ? 'full' : 'mini');
  }, [location.pathname, session?.request, setMode]);
  useEffect(() => listenNativePipMode(active => {
    document.documentElement.classList.toggle('nanime-pip-active', active);
    if (active) setMode('full');
    else if (!location.pathname.startsWith('/detail/')) setMode('mini');
  }), [location.pathname, setMode]);
  useEffect(() => {
    const active = !!session && playing && !session.loading && !session.error && session.stream?.sourceKind === 'direct-media';
    setNativePipActive(active, session?.title || '', session?.episode || '');
    return () => setNativePipActive(false);
  }, [session?.request, session?.loading, session?.error, session?.stream?.sourceKind, session?.title, session?.episode, playing]);
  useEffect(() => { if (mode === 'mini') setDownloadsOpen(false); }, [mode]);
  useEffect(() => { setPlayhead(0); setDuration(0); setPlaying(false); setPlaybackRate(1); }, [session?.request]);
  useEffect(() => { if (mediaRef.current) mediaRef.current.playbackRate = playbackRate; }, [session?.request, session?.sourceIndex, playbackRate]);
  useEffect(() => () => { if (gestureTimer.current) window.clearTimeout(gestureTimer.current); }, []);

  if (!session) return null;
  // Provider/cache data can contain unusable URLs, and sourceIndex can point
  // past the normalized list. Keep rendering safe and fall back to a usable
  // source when one exists.
  const source = sources[session.sourceIndex] ?? sources[0];
  const downloads = downloadsFrom(session.stream);
  const beginDrag = (event: PointerEvent<HTMLElement>) => {
    if (mode !== 'mini' || (event.target as HTMLElement).closest('button')) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    didMoveRef.current = false;
    dragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 5) didMoveRef.current = true;
    const box = boxRef.current;
    const width = box?.offsetWidth || 260;
    const height = box?.offsetHeight || 180;
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - width - 8, drag.left + event.clientX - drag.x)),
      top: Math.max(8, Math.min(window.innerHeight - height - 8, drag.top + event.clientY - drag.y))
    });
  };
  const endDrag = () => { dragRef.current = null; };
  const beginControlGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (!playerControls || mode !== 'full' || event.pointerType !== 'touch' || (event.target as HTMLElement).closest('button,input,select')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const kind = event.clientX < rect.left + rect.width / 2 ? 'brightness' : 'volume';
    gestureRef.current = { pointerId: event.pointerId, y: event.clientY, value: kind === 'brightness' ? brightness : volume, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveControlGesture = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const next = Math.max(0, Math.min(1, gesture.value + (gesture.y - event.clientY) / 220));
    if (gesture.kind === 'brightness') setBrightness(next);
    else setVolume(next);
    setGestureLabel(`${gesture.kind === 'brightness' ? 'Brightness' : 'Volume'} ${Math.round(next * 100)}%`);
    if (gestureTimer.current) window.clearTimeout(gestureTimer.current);
    gestureTimer.current = window.setTimeout(() => setGestureLabel(''), 900);
  };
  const endControlGesture = () => { gestureRef.current = null; };
  const togglePlayback = () => {
    const video = mediaRef.current;
    if (!video) return;
    if (video.paused) void video.play().then(() => setPlaying(true)).catch(onError);
    else { video.pause(); setPlaying(false); }
  };
  const togglePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (mediaRef.current) mediaRef.current.playbackRate = next;
  };
  const toggleFullscreen = async () => {
    try {
      const target = boxRef.current;
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (target?.requestFullscreen) await target.requestFullscreen();
      try {
        const orientation = (screen as Screen & { orientation?: { lock?: (value: string) => Promise<void>; unlock?: () => void } }).orientation;
        if (document.fullscreenElement) await orientation?.lock?.('landscape');
        else orientation?.unlock?.();
      } catch { /* orientasi layar tidak didukung browser */ }
    } catch { /* fullscreen tidak tersedia untuk konteks ini */ }
  };
  return <div className={'episode-player-backdrop' + (mode === 'mini' ? ' mini' : '')} role={mode === 'mini' ? undefined : 'presentation'} onMouseDown={event => { if (mode === 'full' && event.target === event.currentTarget) close(); }}>
    <section
      ref={boxRef}
      className="episode-player"
      role={mode === 'mini' ? undefined : 'dialog'}
      aria-modal={mode === 'mini' ? undefined : true}
      aria-label={`Episode ${session.episode}`}
      style={mode === 'mini' && position ? { left: position.left, top: position.top } : undefined}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => { if (mode === 'mini' && !didMoveRef.current) setMode('full'); }}
    >
      <header className="episode-player-head"><div><strong>{session.title}</strong><span>Episode {session.episode}</span></div><div className="player-overlay-actions">
        {mode === 'full' && sources.length > 1 ? <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); setQualitiesOpen(true); }} aria-label="Pilihan kualitas"><Icon name="settings" /></button> : null}
        {mode === 'full' && downloads.length ? <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); setDownloadsOpen(true); }} aria-label="Pilihan download"><Icon name="download" /></button> : null}
        {mode === 'mini' ? <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); setMode('full'); }} aria-label="Buka pemutar"><Icon name="expand" /></button> : null}
        <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); close(); }} aria-label="Tutup pemutar"><Icon name="x" /></button>
      </div></header>
      {session.loading ? <div className="episode-player-state" role="status"><span className="spinner-sm" />Menyiapkan sumber video…</div> : null}
      {!session.loading && session.error ? <div className="episode-player-state error" role="alert">
        <p>{session.error}</p>
        <button type="button" className="hn-ghostbtn" onClick={event => { event.stopPropagation(); session.retry(); }}>Coba lagi</button>
      </div> : null}
      {!session.loading && !session.error && !source ? <div className="episode-player-state error" role="alert">
        <p>Sumber video tidak valid atau tidak tersedia. Coba lagi atau pilih episode lain.</p>
        <button type="button" className="hn-ghostbtn" onClick={event => { event.stopPropagation(); session.retry(); }}>Coba lagi</button>
      </div> : null}
      {!session.loading && !session.error && source ? <>
        <div className="episode-player-video" style={{ filter: `brightness(${brightness})`, touchAction: playerControls ? 'pan-x' : undefined }} onPointerDown={beginControlGesture} onPointerMove={moveControlGesture} onPointerUp={endControlGesture} onPointerCancel={endControlGesture}>
          {source.kind === 'file' ? <AdaptiveVideo key={source.url} videoElementRef={mediaRef} src={source.url} poster={session.stream?.poster || session.poster} volume={volume} fit={fit} onTimeUpdate={onTimeUpdate} onPause={event => { setPlaying(false); session.onProgress(event); }} onPlay={() => setPlaying(true)} onEnded={event => { setPlaying(false); session.onProgress(event); }} onError={onError} /> : <iframe key={source.url} src={source.url} title={`${session.title} episode ${session.episode}`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
          {mode === 'full' && source.kind === 'file' ? <div className="player-controls" onPointerDown={event => event.stopPropagation()}>
            <div className="player-control-row">
              <button type="button" aria-label="Episode sebelumnya" disabled={!session.onPrevious} onClick={() => session.onPrevious?.()}><Icon name="skipPrev" size={19} /></button>
              <button type="button" aria-label="Mundur 10 detik" onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = Math.max(0, mediaRef.current.currentTime - 10); }}><Icon name="seekBack" size={25} /></button>
              <button type="button" className="player-play" aria-label={playing ? 'Jeda video' : 'Putar video'} onClick={togglePlayback}><Icon name={playing ? 'pause' : 'play'} size={24} /></button>
              <button type="button" aria-label="Maju 10 detik" onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = Math.min(duration || Infinity, mediaRef.current.currentTime + 10); }}><Icon name="seekFwd" size={25} /></button>
              <button type="button" aria-label="Episode berikutnya" disabled={!session.onNext} onClick={() => session.onNext?.()}><Icon name="skipNext" size={19} /></button>
            </div>
            <div className="player-control-meta">
              <span className="player-time">{clockTime(playhead)} / {clockTime(duration)}</span>
              {sources.length > 1 ? <button type="button" onClick={() => setQualitiesOpen(true)} aria-label="Pilih kualitas atau sumber video">{sources[session.sourceIndex]?.label || 'Sumber'}<Icon name="down" size={12} /></button> : null}
              <button type="button" onClick={togglePlaybackRate} aria-label="Kecepatan pemutaran">{playbackRate}x</button>
            </div>
            <input aria-label="Posisi video" type="range" min="0" max={duration || 1} step="1" value={Math.min(playhead, duration || 0)} onChange={event => { const value = Number(event.target.value); setPlayhead(value); if (mediaRef.current) mediaRef.current.currentTime = value; }} />
          </div> : null}
          {mode === 'full' && source.kind === 'file' ? <div className="player-video-top-controls" onPointerDown={event => event.stopPropagation()}>
            <button type="button" aria-label={fit === 'contain' ? 'Penuhi video' : 'Sesuaikan video'} onClick={() => setFit(value => value === 'contain' ? 'cover' : 'contain')}><span className="player-fit-icon" />{fit === 'contain' ? 'Fit' : 'Fill'}</button>
            <button type="button" aria-label="Layar penuh" onClick={() => void toggleFullscreen()}><Icon name="expand" size={22} /></button>
          </div> : null}
          {gestureLabel ? <span className="player-gesture-status" role="status">{gestureLabel}</span> : null}
        </div>
        {source.kind === 'embed' && sources.length === 1 ? <div className="episode-player-source"><span>Pemutar provider</span><strong>{providerName(source.provider)} · {source.label}</strong></div> : null}
        {sources.length > 1 ? <button type="button" className="episode-player-source" onClick={() => setQualitiesOpen(true)}><span>Sumber aktif</span><strong>{providerName(source.provider)} · {source.label}　⌄</strong></button> : null}
        <section className="episode-player-info">
          {session.poster ? <img src={session.poster} alt="" /> : null}
          <div><h1>{session.title}</h1><p>Episode {session.episode}</p>{session.synopsis ? <p className="episode-player-synopsis">{session.synopsis}</p> : null}</div>
        </section>
      </> : null}
      {qualitiesOpen && mode === 'full' ? <div className="player-download-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setQualitiesOpen(false); }}>
        <section className="player-download-sheet" role="dialog" aria-modal="true" aria-label="Pilihan kualitas video">
          <span className="player-download-handle" /><header><strong>Pilihan Kualitas Video</strong><button type="button" className="ibtn" onClick={() => setQualitiesOpen(false)} aria-label="Tutup pilihan kualitas"><Icon name="x" /></button></header>
          <div className="player-download-list">{sources.map((item, index) => <button type="button" className={`player-quality-option ${qualityClass(item.label)}${session.sourceIndex === index ? ' selected' : ''}`} key={`${item.url}-${index}`} onClick={() => { update(session.request, { sourceIndex: index, error: '' }); setQualitiesOpen(false); }}><span><strong>{displayQuality(item.label)}</strong><small>{providerName(item.provider)} · {qualityDescription(item.label, item.kind)}</small></span><span>{session.sourceIndex === index ? '✓' : '›'}</span></button>)}</div>
        </section>
      </div> : null}
      {downloadsOpen && mode === 'full' ? <div className="player-download-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDownloadsOpen(false); }}>
        <section className="player-download-sheet" role="dialog" aria-modal="true" aria-label="Pilihan download">
          <span className="player-download-handle" />
          <header><strong>Pilihan Download Video</strong><button type="button" className="ibtn" onClick={() => setDownloadsOpen(false)} aria-label="Tutup pilihan download"><Icon name="x" /></button></header>
          <p>Tautan berasal dari penyedia eksternal; pastikan alamat dan file benar sebelum mengunduh.</p>
          <div className="player-download-list">{downloads.map((item, index) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" onClick={() => setDownloadsOpen(false)}>
            <span><strong>{item.group} · {item.quality}</strong><small>{item.name}{item.availability === 'verified' ? ' · tersedia' : ' · belum diverifikasi'}</small></span><Icon name="download" size={18} />
          </a>)}</div>
        </section>
      </div> : null}
    </section>
  </div>;
}

function isHttpUrl(value: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function clockTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function displayQuality(label: string): string {
  return label.replace(/\s*\(premium\)/ig, '').replace(/\s*·\s*gratis/ig, '').trim() || 'Sumber video';
}

function qualityClass(label: string): string {
  const resolution = Number(label.match(/(\d{3,4})\s*p/i)?.[1] || 0);
  return resolution ? `quality-${resolution}` : 'quality-source';
}

function qualityDescription(label: string, kind: PlayableSource['kind']): string {
  const resolution = Number(label.match(/(\d{3,4})\s*p/i)?.[1] || 0);
  if (resolution >= 1080) return 'Resolusi tertinggi yang tersedia untuk pemutaran tanpa biaya.';
  if (resolution >= 720) return 'Tampilan tajam untuk layar besar dan koneksi stabil.';
  if (resolution >= 480) return 'Pilihan standar dengan penggunaan data lebih hemat.';
  if (resolution > 0) return 'Pilihan ringan untuk koneksi yang tidak stabil.';
  return kind === 'file' ? 'Sumber video langsung.' : 'Sumber video dari server eksternal.';
}
