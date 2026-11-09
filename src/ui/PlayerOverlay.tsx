import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent, type SyntheticEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlayer } from '../state/player';
import type { DownloadLink, StreamBundle } from '../core/types';
import { listenNativePipMode, setNativePipActive } from '../lib/nativePip';
import { setNativeFullscreenActive, listenNativeFullscreen } from '../lib/nativeFullscreen';
import { isTrustedExternalUrl } from '../lib/hostPolicy';
import { AdaptiveVideo } from './AdaptiveVideo';
import { Icon } from './icons';
import { useMaterialize } from './Sheet';
import { restoreNativeBrightness } from '../lib/nativeBrightness';
import { usePlayerGestures } from './usePlayerGestures';
import { VideoGestureSurface } from './VideoGestureSurface';

interface PlayableSource { label: string; provider: string; url: string; kind: 'file' | 'embed'; quality?: string }

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
      kind: source.kind === 'file' ? 'file' : 'embed',
      quality: typeof item.label === 'string' ? item.label : undefined
    }];
  });
  const qualityUrls = new Set(qualitySources.map(source => source.url));
  const serverSources = servers.flatMap((raw): PlayableSource[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as { url?: unknown; label?: unknown; providerRef?: unknown; quality?: unknown };
    if (typeof item.url !== 'string' || !isHttpUrl(item.url) || qualityUrls.has(item.url)) return [];
    return [{
      label: typeof item.label === 'string' && item.label ? item.label : 'Server video',
      provider: typeof item.providerRef === 'string' ? item.providerRef : '',
      url: item.url,
      kind: stream?.sourceKind === 'direct-media' && /\.(?:m3u8|mp4|webm|mov|mpd)(?:[?#]|$)/i.test(item.url) ? 'file' : 'embed',
      quality: typeof item.quality === 'string' ? item.quality : undefined
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
  const stream = session?.stream;
  const sources = useMemo(() => playableSourcesFrom(stream), [stream]);
  /* Lifecycle materialize pemain utama (motion.md §5): close linger 300ms
     dengan data terakhir agar exit path sama; pause saat close. */
  const [displaySession, setDisplaySession] = useState(session);
  useEffect(() => { if (session) setDisplaySession(session); }, [session]);
  const { mounted: playerMounted, visible: playerVisible } = useMaterialize(!!session);
  const onError = useCallback(() => {
    const current = usePlayer.getState().session;
    if (!current) return;
    const nextIndex = sources.findIndex((candidate, index) => index > current.sourceIndex && candidate.url !== sources[current.sourceIndex]?.url);
    if (nextIndex >= 0) update(current.request, { sourceIndex: nextIndex, error: '' });
    else update(current.request, { error: 'Browser tidak dapat memutar sumber ini. Coba server lain atau episode berikutnya.' });
  }, [sources, update]);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragPendingRef = useRef<{ left: number; top: number } | null>(null);
  const didMoveRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [qualitiesOpen, setQualitiesOpen] = useState(false);
  const qualitiesSheet = useMaterialize(qualitiesOpen && mode === 'full');
  const downloadsSheet = useMaterialize(downloadsOpen && mode === 'full');
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const isFullscreenRef = useRef(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [mutedAutoplay, setMutedAutoplay] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [playbackRate, setPlaybackRate] = useState(1);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (!session && playerMounted) mediaRef.current?.pause(); }, [session, playerMounted]);
  const autoplayAttemptRef = useRef(false);
  const boxRef = useRef<HTMLElement | null>(null);
  const gestureContainerRef = useRef<HTMLDivElement | null>(null);
  const togglePlayback = useCallback(() => {
    const video = mediaRef.current;
    if (!video) return;
    if (video.paused) void video.play().then(() => { setPlaying(true); setAutoplayBlocked(false); }).catch(() => setAutoplayBlocked(true));
    else { video.pause(); setPlaying(false); }
  }, []);
  const gesturesEnabled = mode === 'full' && !!session && !session.loading && !session.error
    && (sources[session.sourceIndex] ?? sources[0])?.kind === 'file';
  const gestures = usePlayerGestures({ mediaRef, containerRef: gestureContainerRef, enabled: gesturesEnabled, onTogglePlay: togglePlayback, onSingleTap: togglePlayback });

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
  useEffect(() => { setPlayhead(0); setDuration(0); setPlaying(false); setAutoplayBlocked(false); setMutedAutoplay(false); setPlaybackRate(1); autoplayAttemptRef.current = false; }, [session?.request]);
  const tryLockLandscape = useCallback(async () => {
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape');
      }
    } catch {
      // WebView membatasi orientation lock — native plugin adalah fallback utama.
    }
  }, []);
  const tryUnlockOrientation = useCallback(() => {
    try {
      const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
      if (orientation && typeof orientation.unlock === 'function') orientation.unlock();
    } catch {
      // Abaikan: native plugin memulihkan orientasi.
    }
  }, []);
  const enterPlayerFullscreen = useCallback(async () => {
    const box = boxRef.current;
    if (!box) return;
    // 1) Web Fullscreen API dengan orientasi landscape (Chrome Android).
    try {
      const requestOptions = { screenOrientation: 'landscape' } as FullscreenOptions;
      await box.requestFullscreen(requestOptions);
    } catch {
      try {
        await box.requestFullscreen();
        await tryLockLandscape();
        return;
      } catch {
        // 2) Fallback: fullscreen visual + orientasi native (APK Android).
        // Layout .player-fs sama dengan :fullscreen, perangkat tetap diputar native.
        setFullscreenFallback(true);
        setIsFullscreen(true);
        isFullscreenRef.current = true;
        void setNativeFullscreenActive(true, true);
        await tryLockLandscape();
      }
    }
  }, [tryLockLandscape]);
  const exitPlayerFullscreen = useCallback(async () => {
    // Sengaja tidak menyentuh <video>: src/currentTime/paused/subtitle/audio tetap.
    setFullscreenFallback(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch { /* fullscreenchange menangani cleanup */ }
    }
    // Jika tidak ada Web Fullscreen (fallback), langsung pulihkan native.
    if (!document.fullscreenElement) {
      setIsFullscreen(false);
      isFullscreenRef.current = false;
      void setNativeFullscreenActive(false, true);
      tryUnlockOrientation();
    }
  }, [tryUnlockOrientation]);
  useEffect(() => {
    const applyNative = (active: boolean) => {
      void setNativeFullscreenActive(active, true);
    };
    const sync = () => {
      const el = document.fullscreenElement;
      const isBox = el === boxRef.current;
      const isIframe = el?.tagName === 'IFRAME';
      const active = isBox || isIframe;
      // Direct video fullscreen → landscape. Iframe (embed) → provider owns it.
      if (isBox) {
        setIsFullscreen(true);
        isFullscreenRef.current = true;
        setFullscreenFallback(false);
        applyNative(true);
        void tryLockLandscape();
      } else if (isIframe) {
        applyNative(true);
      } else {
        // Keluar fullscreen (tombol player, tombol Back Android, atau Esc):
        // pulihkan orientasi + system bars tanpa menyentuh playback/video src.
        setIsFullscreen(false);
        isFullscreenRef.current = false;
        setFullscreenFallback(false);
        applyNative(false);
        tryUnlockOrientation();
      }
    };
    document.addEventListener('fullscreenchange', sync);
    const unlistenNative = listenNativeFullscreen(active => {
      // Plugin kini benar-benar memancarkan "changed"; hanya sinkronkan
      // status native tanpa memanggil balik setActive (hindari loop).
      if (!active && isFullscreenRef.current) {
        setIsFullscreen(false);
        isFullscreenRef.current = false;
        setFullscreenFallback(false);
        tryUnlockOrientation();
      }
    });
    // Back button Android: backButton.ts memanggil __nanimeExitFullscreen
    // sebelum navigasi riwayat. Tangani baik Web Fullscreen maupun fallback.
    const w = window as unknown as { __nanimeExitFullscreen?: () => boolean };
    w.__nanimeExitFullscreen = () => {
      if (isFullscreenRef.current || fullscreenFallback) {
        void exitPlayerFullscreen();
        return true;
      }
      return false;
    };
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      unlistenNative();
      if (w.__nanimeExitFullscreen) delete w.__nanimeExitFullscreen;
      // Unmount/close: pulihkan orientasi & bars agar tidak terkunci.
      if (isFullscreenRef.current || fullscreenFallback) {
        isFullscreenRef.current = false;
        applyNative(false);
        tryUnlockOrientation();
      }
    };
  }, []);
  useEffect(() => { setAutoplayBlocked(false); setMutedAutoplay(false); setPlaying(false); autoplayAttemptRef.current = false; }, [session?.sourceIndex]);
  useEffect(() => { if (mediaRef.current) mediaRef.current.playbackRate = playbackRate; }, [session?.request, session?.sourceIndex, playbackRate]);
  useEffect(() => { gestures.resetGestures(); }, [session?.request, session?.sourceIndex]);
  useEffect(() => () => restoreNativeBrightness(), []);

  if (!playerMounted || !displaySession) return null;
  const renderSession = session ?? displaySession;
  // Provider/cache data can contain unusable URLs, and sourceIndex can point
  // past the normalized list. Keep rendering safe and fall back to a usable
  // source when one exists.
  const source = sources[renderSession.sourceIndex] ?? sources[0];
  const downloads = downloadsFrom(renderSession.stream);
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
    dragPendingRef.current = {
      left: Math.max(8, Math.min(window.innerWidth - width - 8, drag.left + event.clientX - drag.x)),
      top: Math.max(8, Math.min(window.innerHeight - height - 8, drag.top + event.clientY - drag.y))
    };
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      const next = dragPendingRef.current;
      if (next) setPosition(next);
    });
  };
  const endDrag = () => { dragRef.current = null; if (dragRafRef.current !== null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; } };
  const enableAutoplayAudio = () => {
    const video = mediaRef.current;
    if (!video) return;
    video.muted = false;
    void video.play().then(() => { setMutedAutoplay(false); setAutoplayBlocked(false); setPlaying(true); }).catch(() => {
      video.muted = true;
      setAutoplayBlocked(true);
    });
  };
  const togglePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (mediaRef.current) mediaRef.current.playbackRate = next;
  };
  const closePlayer = () => {
    if (isFullscreenRef.current || fullscreenFallback || document.fullscreenElement) void exitPlayerFullscreen();
    restoreNativeBrightness();
    close();
  };
  return <div className={`episode-player-backdrop${mode === 'mini' ? ' mini' : ''}${playerVisible ? ' hn-open' : ''}`} role={mode === 'mini' ? undefined : 'presentation'} onMouseDown={event => { if (mode === 'full' && event.target === event.currentTarget) close(); }}>
    <section
      ref={boxRef}
      className={`episode-player${playerVisible ? ' hn-open' : ''}${isFullscreen ? ' player-fs' : ''}`}
      data-lg-role="focus"
      role={mode === 'mini' ? undefined : 'dialog'}
      aria-modal={mode === 'mini' ? undefined : true}
      aria-label={`Episode ${renderSession.episode}`}
      style={mode === 'mini' && position ? { left: position.left, top: position.top } : undefined}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => { if (mode === 'mini' && !didMoveRef.current) setMode('full'); }}
    >
      <header className="episode-player-head"><div><strong>{renderSession.title}</strong><span>Episode {renderSession.episode}</span></div><div className="player-overlay-actions">
        {mode === 'full' && sources.length > 1 ? <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); setQualitiesOpen(true); }} aria-label="Pilihan kualitas"><Icon name="settings" /></button> : null}
        {mode === 'full' && downloads.length ? <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); setDownloadsOpen(true); }} aria-label="Pilihan download"><Icon name="download" /></button> : null}
        {mode === 'mini' ? <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); setMode('full'); }} aria-label="Buka pemutar"><Icon name="expand" /></button> : null}
        <button type="button" className="ibtn" onClick={event => { event.stopPropagation(); closePlayer(); }} aria-label="Tutup pemutar"><Icon name="x" /></button>
      </div></header>
      {renderSession.loading ? <div className="episode-player-state" role="status"><span className="spinner-sm" />Menyiapkan sumber video…</div> : null}
      {!renderSession.loading && renderSession.error ? <div className="episode-player-state error" role="alert">
        <p>{renderSession.error}</p>
        <button type="button" className="hn-ghostbtn" onClick={event => { event.stopPropagation(); renderSession.retry(); }}>Coba lagi</button>
      </div> : null}
      {!renderSession.loading && !renderSession.error && !source ? <div className="episode-player-state error" role="alert">
        <p>Sumber video tidak valid atau tidak tersedia. Coba lagi atau pilih episode lain.</p>
        <button type="button" className="hn-ghostbtn" onClick={event => { event.stopPropagation(); renderSession.retry(); }}>Coba lagi</button>
      </div> : null}
      {!renderSession.loading && !renderSession.error && source ? <>
        <VideoGestureSurface
          containerRef={gestureContainerRef}
          gestures={gestures}
          enabled={gesturesEnabled}
          onSurfaceClick={togglePlayback}
          media={source.kind === 'file' ? <AdaptiveVideo key={source.url} videoElementRef={mediaRef} src={source.url} poster={renderSession.stream?.poster || renderSession.poster} fit={fit} filter={gestures.videoFilter} onTimeUpdate={onTimeUpdate} onPause={event => { setPlaying(false); renderSession.onProgress(event); /* volume gesture: sinkronkan indikator saat autoplay-muted mengatur muted */ }} onPlay={() => { setPlaying(true); setAutoplayBlocked(false); }} onCanPlay={() => {
            if (autoplayAttemptRef.current) return;
            autoplayAttemptRef.current = true;
            const video = mediaRef.current;
            if (video?.paused) void video.play().then(() => { setAutoplayBlocked(false); setMutedAutoplay(false); }).catch(() => {
              if (!video) return;
              video.muted = true;
              void video.play().then(() => { setMutedAutoplay(true); setAutoplayBlocked(false); setPlaying(true); }).catch(() => setAutoplayBlocked(true));
            });
          }} onEnded={event => { setPlaying(false); renderSession.onProgress(event); }} onError={onError} /> : isTrustedExternalUrl(source.url) ? <iframe key={source.url} src={source.url} title={`${renderSession.title} episode ${renderSession.episode}`} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <div className="episode-player-state error" role="alert"><p>Sumber embed tidak tersedia atau tidak dipercaya. Coba server lain.</p></div>}
          controls={<>
          {mutedAutoplay && source.kind === 'file' ? <button type="button" className="player-gesture-status player-status-action" onClick={enableAutoplayAudio}>Aktifkan suara</button> : null}
          {autoplayBlocked && source.kind === 'file' ? <span className="player-gesture-status player-status-blocked" role="status">Autoplay diblokir browser. Ketuk Putar untuk memulai.</span> : null}
          {mode === 'full' && source.kind === 'file' && !gestures.locked && gestures.controlsVisible ? <div className="player-controls" onPointerDown={event => event.stopPropagation()}>
            <div className="player-control-row">
              <button type="button" aria-label="Episode sebelumnya" disabled={!renderSession.onPrevious} onClick={() => renderSession.onPrevious?.()}><Icon name="skipPrev" size={19} /></button>
              <button type="button" aria-label="Mundur 10 detik" onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = Math.max(0, mediaRef.current.currentTime - 10); }}><Icon name="seekBack" size={25} /></button>
              <button type="button" className="player-play" aria-label={playing ? 'Jeda video' : 'Putar video'} onClick={togglePlayback}><Icon name={playing ? 'pause' : 'play'} size={24} /></button>
              <button type="button" aria-label="Maju 10 detik" onClick={() => { if (mediaRef.current) mediaRef.current.currentTime = Math.min(duration || Infinity, mediaRef.current.currentTime + 10); }}><Icon name="seekFwd" size={25} /></button>
              <button type="button" aria-label="Episode berikutnya" disabled={!renderSession.onNext} onClick={() => renderSession.onNext?.()}><Icon name="skipNext" size={19} /></button>
            </div>
            <div className="player-control-meta">
              <span className="player-time">{clockTime(playhead)} / {clockTime(duration)}</span>
              {sources.length > 1 ? <button type="button" onClick={() => setQualitiesOpen(true)} aria-label="Pilih kualitas atau sumber video">{sources[renderSession.sourceIndex]?.label || 'Sumber'}<Icon name="down" size={12} /></button> : null}
              <button type="button" onClick={togglePlaybackRate} aria-label="Kecepatan pemutaran">{playbackRate}x</button>
            </div>
            <input aria-label="Posisi video" type="range" min="0" max={duration || 1} step="1" value={Math.min(playhead, duration || 0)} onChange={event => { const value = Number(event.target.value); setPlayhead(value); if (mediaRef.current) mediaRef.current.currentTime = value; }} />
          </div> : null}
          {mode === 'full' && source.kind === 'file' && !gestures.locked ? <div className="player-video-top-controls" onPointerDown={event => event.stopPropagation()}>
            <button type="button" aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'} aria-pressed={isFullscreen} onClick={() => { void (isFullscreen ? exitPlayerFullscreen() : enterPlayerFullscreen()); }}><Icon name={isFullscreen ? 'collapse' : 'fullscreen'} size={20} /></button>
            <button type="button" aria-label={fit === 'contain' ? 'Penuhi video' : 'Sesuaikan video'} onClick={() => setFit(value => value === 'contain' ? 'cover' : 'contain')}><span className="player-fit-icon" />{fit === 'contain' ? 'Fit' : 'Fill'}</button>
            <button type="button" aria-label={gestures.locked ? 'Buka kunci layar' : 'Kunci layar'} onClick={() => gestures.toggleLock()}><Icon name={gestures.locked ? 'unlock' : 'lock'} size={20} /></button>
          </div> : null}
          </>}
        />
        {source.kind === 'embed' && sources.length === 1 ? <div className="episode-player-source"><span>Pemutar provider</span><strong>{providerName(source.provider)} · {source.label}</strong></div> : null}
        {sources.length > 1 ? <button type="button" className="episode-player-source" onClick={() => setQualitiesOpen(true)}><span>Sumber aktif</span><strong>{providerName(source.provider)} · {source.label}　⌄</strong></button> : null}
        <section className="episode-player-info">
          {renderSession.poster ? <img src={renderSession.poster} alt="" /> : null}
          <div><h1>{renderSession.title}</h1><p>Episode {renderSession.episode}</p>{renderSession.synopsis ? <p className="episode-player-synopsis">{renderSession.synopsis}</p> : null}</div>
        </section>
      </> : null}
      {qualitiesSheet.mounted ? <div className={`player-download-backdrop${qualitiesSheet.visible ? ' hn-open' : ''}`} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setQualitiesOpen(false); }}>
        <section className={`player-download-sheet${qualitiesSheet.visible ? ' hn-open' : ''}`} role="dialog" aria-modal="true" aria-label="Pilihan kualitas video">
          <span className="player-download-handle" /><header><strong>Pilihan Kualitas Video</strong><button type="button" className="ibtn" onClick={() => setQualitiesOpen(false)} aria-label="Tutup pilihan kualitas"><Icon name="x" /></button></header>
          <div className="player-download-list">{qualityGroups(sources).map(group => <div className="player-quality-group" key={group.label}><strong className="player-quality-group-title">{group.label}</strong>{group.items.map(({ item, index }) => <button type="button" className={`player-quality-option ${qualityClass(group.label)}${renderSession.sourceIndex === index ? ' selected' : ''}`} key={`${item.url}-${index}`} onClick={() => { update(renderSession.request, { sourceIndex: index, error: '' }); setQualitiesOpen(false); }}><span><strong>{item.label}</strong><small>{qualityDescription(group.label, item.kind)}</small></span><span>{renderSession.sourceIndex === index ? '✓' : '›'}</span></button>)}</div>)}</div>
        </section>
      </div> : null}
      {downloadsSheet.mounted ? <div className={`player-download-backdrop${downloadsSheet.visible ? ' hn-open' : ''}`} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDownloadsOpen(false); }}>
        <section className={`player-download-sheet${downloadsSheet.visible ? ' hn-open' : ''}`} role="dialog" aria-modal="true" aria-label="Pilihan download">
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
  return isTrustedExternalUrl(value);
}

function clockTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function qualityGroups(sources: PlayableSource[]): { label: string; items: { item: PlayableSource; index: number }[] }[] {
  const groups = new Map<string, { item: PlayableSource; index: number }[]>();
  sources.forEach((item, index) => {
    const label = item.quality || 'Kualitas lain';
    const items = groups.get(label) || [];
    items.push({ item, index });
    groups.set(label, items);
  });
  return Array.from(groups, ([label, items]) => ({ label, items }));
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
