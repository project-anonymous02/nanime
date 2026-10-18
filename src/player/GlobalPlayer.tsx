import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Catalog, GENERIC_ERROR } from '../core/services/Catalog';
import type { QualityLabel } from '../core/types';
import { isVideoUrl } from '../core/utils';
import { useAuth } from '../state/auth';
import { useLibrary } from '../state/library';
import { clampFloatWidth, episodeNeighbors, usePlayer } from '../state/player';
import { useSettings } from '../state/settings';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { Sheet, SheetItem } from '../ui/Sheet';
import { watchPath } from '../lib/nav';

/**
 * GlobalPlayer — SATU elemen `<video>` persisten untuk seluruh aplikasi.
 *
 * • Di `/watch/:id/:episode` tampil docked penuh di atas halaman.
 * • Di halaman lain otomatis menjadi Floating Mini Player yang bisa di-drag,
 *   di-tap (kembali fullscreen), dan ditutup lewat tombol X. Playback TIDAK
 *   PERNAH terputus saat pindah halaman — komponen ini hidup di luar `<Routes>`.
 * • Pemutar kustom SELALU menang: URL embed provider di-scrape menjadi URL
 *   video langsung; `<video controls>` (native) dan iframe provider tidak
 *   pernah dirender kecuali sebagai jalan terakhir.
 */

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Jarak aman di bawah mini player agar navigasi bawah tidak tertutup. */
function floatBottomGuard(): number {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return 20;
  const top = nav.getBoundingClientRect().top;
  return Math.max(20, window.innerHeight - top + 12);
}

/** Animasi FLIP aman di lingkungan tanpa Web Animations API (jsdom). */
function playFlip(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
  if (typeof el.animate !== 'function') return;
  el.animate(frames, options);
}

const QUALITY_HEIGHT: Record<QualityLabel, number> = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };

function autoQualityLimit(): number {
  const connection = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string } }).connection;
  const downlink = connection?.downlink;
  if (typeof downlink === 'number' && Number.isFinite(downlink)) {
    if (downlink < 1.5) return 480;
    if (downlink < 4) return 720;
  } else if (connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return 360;
  return Math.min(1080, Math.max(360, window.screen?.height || 1080));
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

function VSlider({
  value,
  min,
  max,
  onChange,
  label
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef(false);
  const apply = useCallback(
    (clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pct = 1 - Math.min(1, Math.max(0, (clientY - r.top) / Math.max(1, r.height)));
      onChange(min + pct * (max - min));
    },
    [min, max, onChange]
  );
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <div
      ref={ref}
      className="gp-vslider"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onPointerDown={e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        apply(e.clientY);
      }}
      onPointerMove={e => {
        if (dragRef.current) apply(e.clientY);
      }}
      onPointerUp={() => {
        dragRef.current = false;
      }}
      onPointerCancel={() => {
        dragRef.current = false;
      }}
    >
      <span className="gp-vtrack">
        <span className="gp-vfill" style={{ transform: `scaleY(${pct})` }} />
      </span>
    </div>
  );
}

export function GlobalPlayer() {
  const signedIn = useAuth(s => s.signedIn);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const session = usePlayer(s => s.session);
  const quality = usePlayer(s => s.quality);
  const playUrl = usePlayer(s => s.playUrl);
  const playing = usePlayer(s => s.playing);
  const currentTime = usePlayer(s => s.currentTime);
  const duration = usePlayer(s => s.duration);
  const buffered = usePlayer(s => s.buffered);
  const volume = usePlayer(s => s.volume);
  const brightness = usePlayer(s => s.brightness);
  const speed = usePlayer(s => s.speed);
  const closed = usePlayer(s => s.closed);
  const floating = usePlayer(s => s.floating);
  const pos = usePlayer(s => s.pos);
  const width = usePlayer(s => s.width);

  const settings = useSettings();
  const addHistory = useLibrary(s => s.addHistory);

  const [visible, setVisible] = useState(true);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [sheet, setSheet] = useState<'quality' | 'speed' | null>(null);
  const [drag, setDrag] = useState(false);
  const [seekPct, setSeekPct] = useState(0);
  const [hint, setHint] = useState<{ side: 'left' | 'right'; key: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [overClose, setOverClose] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<{ destroy(): void } | null>(null);
  const hideTimer = useRef(0);
  const tapTimer = useRef(0);
  const lastSave = useRef(0);
  const lastTick = useRef(0);
  const lastTap = useRef(0);
  const lastSrcSession = useRef('');
  const resumed = useRef(false);
  const pendingSeek = useRef(0);
  const resumeAfterSwitch = useRef<boolean | null>(null);
  const fallbackUrls = useRef<string[]>([]);
  const fallbackIndex = useRef(0);
  const mediaErrorHandler = useRef<() => void>(() => undefined);
  const live = useRef({ pos: 0, dur: 0 });
  const dockedRect = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const prevFloating = useRef(false);
  const overCloseRef = useRef(false);
  const pressRef = useRef<{
    id: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ d0: number; w0: number } | null>(null);

  useEffect(() => {
    let wasFullscreen = false;
    const sync = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const video = videoRef.current as (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }) | null;
      const active = !!(doc.fullscreenElement || doc.webkitFullscreenElement || video?.webkitDisplayingFullscreen);
      setFullscreen(active);
      if (wasFullscreen && !active) (screen.orientation as ScreenOrientation & { unlock?: () => void } | undefined)?.unlock?.();
      wasFullscreen = active;
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync as EventListener);
    window.addEventListener('resize', sync);
    const video = videoRef.current;
    video?.addEventListener('webkitbeginfullscreen', sync);
    video?.addEventListener('webkitendfullscreen', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync as EventListener);
      window.removeEventListener('resize', sync);
      video?.removeEventListener('webkitbeginfullscreen', sync);
      video?.removeEventListener('webkitendfullscreen', sync);
    };
  }, []);

  const sessionKey = session ? session.animeId + '|' + session.episode : '';
  const stream = session?.stream || null;
  const isVideo = !!playUrl && isVideoUrl(playUrl);
  const title = session?.title || '';

  const neighbors = useMemo(
    () => (session ? episodeNeighbors(session.episodes, session.episode) : {}),
    [session]
  );

  /* ── Geometri floating (tidak boleh menutupi navigasi bawah) ── */
  const fh = Math.round((width * 9) / 16);
  const defaultPos = () => ({
    x: Math.max(16, window.innerWidth - width - 16),
    y: Math.max(16, window.innerHeight - fh - floatBottomGuard())
  });
  const effPos = (() => {
    const d = pos.x < 0 ? defaultPos() : pos;
    const maxY = Math.max(16, window.innerHeight - fh - floatBottomGuard());
    return {
      x: Math.max(8, Math.min(d.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(d.y, maxY))
    };
  })();

  const isWatch = pathname.startsWith('/watch/');
  const show = !!signedIn && !!session && !closed;
  const shouldFloat = show && !isWatch;

  /* ── Sinkron mode floating dengan route ── */
  useEffect(() => {
    if (!show) return;
    usePlayer.getState().setFloating(shouldFloat);
    if (shouldFloat) {
      const p = usePlayer.getState().pos;
      if (p.x < 0) {
        const d = defaultPos();
        usePlayer.getState().setPos(d.x, d.y);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFloat, show]);

  /* ── Pengguna keluar → tutup paksa ── */
  useEffect(() => {
    if (!signedIn && usePlayer.getState().session) usePlayer.getState().close();
  }, [signedIn]);

  /* ── Jaga posisi tetap di dalam viewport saat ukuran layar berubah ── */
  useEffect(() => {
    if (!floating) return;
    const onResize = () => {
      const st = usePlayer.getState();
      const w = st.width;
      const h = (w * 9) / 16;
      const p = st.pos;
      if (p.x < 0) return;
      st.setPos(
        Math.max(8, Math.min(p.x, window.innerWidth - w - 8)),
        Math.max(8, Math.min(p.y, window.innerHeight - h - floatBottomGuard()))
      );
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [floating]);

  /* ── Posisi & ukuran terukur saat docked (untuk animasi FLIP) ── */
  useEffect(() => {
    if (floating || !show) return;
    const measure = () => {
      const el = rootRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        dockedRect.current = { x: r.left, y: r.top, width: r.width, height: r.height };
      }
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, [floating, show]);

  /* ── Animasi Fullscreen ⇄ Floating ── */
  useEffect(() => {
    const el = rootRef.current;
    const wasFloating = prevFloating.current;
    prevFloating.current = floating;
    if (!el) return;
    if (floating && !wasFloating) {
      const d = dockedRect.current;
      if (!d) return;
      const r = el.getBoundingClientRect();
      const sx = d.width / Math.max(1, r.width);
      const sy = d.height / Math.max(1, r.height);
      const dx = d.x - r.left;
      const dy = d.y - r.top;
      playFlip(
        el,
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, borderRadius: '0px' },
          { transform: `translate3d(${r.left}px, ${r.top}px, 0) scale(1, 1)`, borderRadius: '12px' }
        ],
        { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    } else if (!floating && wasFloating) {
      const f = usePlayer.getState().expandFrom;
      usePlayer.getState().setExpandFrom(null);
      if (!f) return;
      const d = el.getBoundingClientRect();
      const sx = f.width / Math.max(1, d.width);
      const sy = f.height / Math.max(1, d.height);
      const dx = f.x - d.left;
      const dy = f.y - d.top;
      playFlip(
        el,
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, borderRadius: '12px' },
          { transform: 'none', borderRadius: '0px' }
        ],
        { duration: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }, [floating]);

  /* ── Resolusi URL putar: kualitas/server → media langsung (tanpa pemutar provider) ── */
  useEffect(() => {
    if (!session) return;
    let alive = true;
    if (lastSrcSession.current !== sessionKey) {
      pendingSeek.current = 0;
      resumeAfterSwitch.current = null;
      resumed.current = false;
    }
    const pick = async () => {
      const st = usePlayer.getState();
      const video = videoRef.current;
      if (video && lastSrcSession.current === sessionKey) {
        if (video.currentTime > 0.5) pendingSeek.current = video.currentTime;
        resumeAfterSwitch.current = !video.paused;
      }
      // Lepas URL lama sebelum resolve sumber baru agar gambar/audio lama
      // tidak tetap tampil sebagai lapisan di bawah pilihan sumber terbaru.
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {
          /* noop */
        }
      }
      try {
        hlsRef.current?.destroy();
      } catch {
        /* noop */
      }
      hlsRef.current = null;
      usePlayer.getState().setPlaying(false);
      usePlayer.getState().setPlayUrl('');
      const raw: string[] = [];

      /* Pilih otomatis di antara varian nyata. HLS manifest didahulukan agar
         ABR milik Hls.js dapat mengatur level sendiri. */
      const available = session.stream.qualities.filter(q => q.source?.url && q.source.exact);
      const limit = quality === 'Auto' ? autoQualityLimit() : QUALITY_HEIGHT[quality];
      const ordered = available.slice().sort((a, b) => {
        const ah = QUALITY_HEIGHT[a.label], bh = QUALITY_HEIGHT[b.label];
        const aHls = /\.m3u8(?:$|[?#])/i.test(a.source?.url || '');
        const bHls = /\.m3u8(?:$|[?#])/i.test(b.source?.url || '');
        if (aHls !== bHls) return aHls ? -1 : 1;
        if (quality === 'Auto') return (bh <= limit ? bh : 0) - (ah <= limit ? ah : 0) || bh - ah;
        return Math.abs(ah - limit) - Math.abs(bh - limit) || bh - ah;
      });
      ordered.forEach(q => { if (q.source?.url) raw.push(q.source.url); });

      /* Server URL dipakai sebagai cadangan internal, tidak pernah dipaparkan
         sebagai pilihan pengguna. Satu kali resolve per server, maksimal lima. */
      for (const s of session.stream.servers) {
        if (raw.length >= 5) break;
        const serverQuality = s.quality && s.quality in QUALITY_HEIGHT ? s.quality as QualityLabel : null;
        if (quality !== 'Auto' && serverQuality && Math.abs(QUALITY_HEIGHT[serverQuality] - limit) > 360) continue;
        const url = s.url || await Catalog.resolveServerUrl(s.providerRef, s.ref.includes(':srv:') ? s.ref.slice(s.ref.indexOf(':srv:') + 5) : s.ref);
        if (url) raw.push(url);
      }

      /* Cadangan terakhir: tautan unduhan berupa file langsung. */
      (session.stream.downloads || []).forEach(g => {
        g.items.forEach(d => {
          if (d.url && isVideoUrl(d.url)) raw.push(d.url);
        });
      });

      const seen = new Set<string>();
      const candidates = raw.filter(u => {
        if (!u || seen.has(u)) return false;
        seen.add(u);
        return true;
      }).slice(0, 5);

      /* Cari URL yang benar-benar bisa diputar `<video>`; embed provider
         di-scrape menjadi file. Bila semuanya gagal, pakai embed sebagai
         jalan terakhir (bukan pemutar yang dipilih pengguna). */
      let embed = '';
      const playable: string[] = [];
      for (const u of candidates) {
        if (!alive || usePlayer.getState().session !== st.session) return;
        let media: Awaited<ReturnType<typeof Catalog.resolvePlayable>>;
        try {
          media = await Catalog.resolvePlayable(u);
        } catch {
          continue;
        }
        if (media.kind === 'file' && media.url) {
          if (!playable.includes(media.url)) playable.push(media.url);
          continue;
        }
        if (!embed && media.url) embed = media.url;
      }
      if (alive && usePlayer.getState().session === st.session) {
        fallbackUrls.current = playable;
        fallbackIndex.current = 0;
        usePlayer.getState().setPlayUrl(playable[0] || embed);
      }
    };
    void pick();
    return () => {
      alive = false;
    };
  }, [session, quality]);

  const onMediaError = useCallback(() => {
    const video = videoRef.current;
    if (video) resumeAfterSwitch.current = !video.paused;
    const next = fallbackIndex.current + 1;
    if (next < fallbackUrls.current.length) {
      fallbackIndex.current = next;
      usePlayer.getState().setPlayUrl(fallbackUrls.current[next]);
      return;
    }
    toast(GENERIC_ERROR, 'err');
  }, []);
  mediaErrorHandler.current = onMediaError;

  /* ── Catat riwayat saat sesi baru dibuka ── */
  const addHistoryRef = useRef(addHistory);
  addHistoryRef.current = addHistory;
  const history = useLibrary(s => s.history);
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    if (!session) return;
    const existing = historyRef.current.find(
      h => h.animeId === session.animeId && h.episode === String(session.episode)
    );
    addHistoryRef.current({
      animeId: session.animeId,
      episode: String(session.episode),
      title: session.title,
      poster: session.poster,
      positionSec: existing?.positionSec || 0,
      durationSec: existing?.durationSec || 0,
      percent: existing?.percent || 0,
      completed: existing?.completed || false,
      watchedAt: Date.now()
    });
    resumed.current = false;
    lastSave.current = 0;
  }, [session]);

  /* ── Simpan progres ── */
  const saveProgress = useCallback((force = false) => {
    const s = usePlayer.getState().session;
    if (!s) return;
    const now = Date.now();
    if (!force && now - lastSave.current < 4000) return;
    const { pos: p, dur } = live.current;
    if (!(p > 0)) return;
    lastSave.current = now;
    const pct = dur ? Math.min(100, (p / dur) * 100) : 0;
    const completed = pct >= 92 || (dur > 0 && dur - p < 45);
    addHistoryRef.current({
      animeId: s.animeId,
      episode: String(s.episode),
      title: s.title,
      poster: s.poster,
      positionSec: p,
      durationSec: dur,
      percent: pct,
      completed,
      watchedAt: Date.now()
    });
  }, []);

  useEffect(() => {
    const onHide = () => saveProgress(true);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      saveProgress(true);
    };
  }, [saveProgress]);

  /* ── Sumber video / HLS ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    /* URL kosong/embed baru: hentikan video lama, termasuk pergantian sumber
       dalam sesi yang sama. */
    if (!playUrl || !isVideo) {
      if (video.hasAttribute('src') || lastSrcSession.current !== sessionKey) {
        lastSrcSession.current = sessionKey;
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {
          /* noop */
        }
        usePlayer.getState().setPlaying(false);
      }
      return;
    }
    let disposed = false;

    /* Ganti kualitas/server pada sesi yang sama → lanjutkan dari posisi kini. */
    if (lastSrcSession.current === sessionKey && video.currentTime > 0.5) {
      pendingSeek.current = video.currentTime;
    }
    lastSrcSession.current = sessionKey;

    /* Anime lama tidak boleh tetap berbunyi saat sumber baru dimuat. */
    try {
      video.pause();
    } catch {
      /* noop */
    }
    usePlayer.getState().setPlaying(false);

    if (/\.m3u8/i.test(playUrl)) {
      void import('hls.js')
        .then(mod => {
          if (disposed) return;
          const Hls = mod.default;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
            hlsRef.current = hls;
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal) mediaErrorHandler.current();
            });
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              const selected = usePlayer.getState().quality;
              if (selected !== 'Auto' && hls.levels.length) {
                const target = QUALITY_HEIGHT[selected];
                let nearest = 0;
                for (let i = 1; i < hls.levels.length; i++) {
                  if (Math.abs(hls.levels[i].height - target) < Math.abs(hls.levels[nearest].height - target)) nearest = i;
                }
                hls.currentLevel = nearest;
              }
            });
            hls.loadSource(playUrl);
            hls.attachMedia(video);
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = playUrl;
          }
        })
        .catch(() => {
          video.src = playUrl;
        });
      return () => {
        disposed = true;
        try {
          hlsRef.current?.destroy();
        } catch {
          /* noop */
        }
        hlsRef.current = null;
      };
    }
    video.src = playUrl;
    return () => {
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        /* noop */
      }
    };
  }, [playUrl, isVideo, sessionKey]);

  /* ── Volume & kecepatan ── */
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
    else {
      const t = window.setTimeout(() => {
        if (videoRef.current) videoRef.current.volume = volume;
      }, 60);
      return () => window.clearTimeout(t);
    }
  }, [volume, playUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed, playUrl]);

  /* ── Kontrol tampil-sembunyi (auto hide 3 detik) ── */
  const poke = useCallback(() => {
    setVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    window.clearTimeout(hideTimer.current);
    if (!floating) {
      if (playing) hideTimer.current = window.setTimeout(() => setVisible(false), 3000);
      else setVisible(true);
    }
    return () => window.clearTimeout(hideTimer.current);
  }, [playing, floating, currentTime]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const closePlayer = useCallback(() => {
    saveProgress(true);
    usePlayer.getState().close();
  }, [saveProgress]);

  /* ── Handler elemen video ── */
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    const s = usePlayer.getState().session;
    if (!v || !s) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    live.current = { pos: v.currentTime || 0, dur };
    usePlayer.getState().setProgress(v.currentTime || 0, dur, 0);
    v.volume = usePlayer.getState().volume;
    v.playbackRate = usePlayer.getState().speed;
    if (pendingSeek.current > 0) {
      try {
        v.currentTime = pendingSeek.current;
      } catch {
        /* noop */
      }
      pendingSeek.current = 0;
    } else if (!resumed.current) {
      resumed.current = true;
      const existing = historyRef.current.find(
        h => h.animeId === s.animeId && h.episode === String(s.episode)
      );
      if (existing && !existing.completed && existing.percent < 95 && existing.positionSec > 5) {
        try {
          v.currentTime = existing.positionSec;
        } catch {
          /* noop */
        }
      }
    }
    const shouldResume = resumeAfterSwitch.current;
    resumeAfterSwitch.current = null;
    if (shouldResume === false) return;
    void v.play().catch(() => usePlayer.getState().setPlaying(false));
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.currentTime || 0;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    live.current = { pos: p, dur };
    saveProgress(false);
    const now = performance.now();
    if (now - lastTick.current > 500) {
      lastTick.current = now;
      const buf = v.buffered.length && dur ? Math.min(1, v.buffered.end(v.buffered.length - 1) / dur) : 0;
      usePlayer.getState().setProgress(p, dur, buf);
    }
  };

  const onProgress = () => {
    const v = videoRef.current;
    if (!v || !v.buffered.length || !v.duration) return;
    usePlayer
      .getState()
      .setProgress(v.currentTime || 0, v.duration, Math.min(1, v.buffered.end(v.buffered.length - 1) / v.duration));
  };

  const onEnded = () => {
    saveProgress(true);
    usePlayer.getState().setPlaying(false);
    const s = usePlayer.getState().session;
    if (!s || usePlayer.getState().floating) return;
    if (settings.autoplayNext && neighbors.next) {
      navigate(watchPath(s.animeId, neighbors.next.num, s.title), { replace: true });
    }
  };

  /* ── PiP OS saat app diminimalkan (best-effort) ── */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      const v = videoRef.current;
      if (!v || v.paused) return;
      try {
        const anyV = v as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
        void anyV.requestPictureInPicture?.().catch(() => undefined);
      } catch {
        /* tidak didukung */
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ── Interaksi permukaan docked: tap tampil kontrol, double-tap ±10s ── */
  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || Number.MAX_SAFE_INTEGER, v.currentTime + delta));
  };

  const onSurfaceTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (isVideo) {
        const v = videoRef.current;
        if (v) {
          const side: 'left' | 'right' = x < rect.width / 2 ? 'left' : 'right';
          v.currentTime = Math.max(0, v.currentTime + (side === 'left' ? -10 : 10));
          setHint({ side, key: now });
          window.setTimeout(() => setHint(h => (h && h.key === now ? null : h)), 520);
        }
      }
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setVisible(v => {
      const next = !v;
      window.clearTimeout(hideTimer.current);
      if (next) hideTimer.current = window.setTimeout(() => setVisible(false), 3000);
      return next;
    });
  };

  /* ── Seek bar ── */
  const pctFrom = (clientX: number) => {
    const el = seekRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
  };
  const seekDown = (e: React.PointerEvent) => {
    if (!isVideo) return;
    setDrag(true);
    setSeekPct(pctFrom(e.clientX));
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const seekMove = (e: React.PointerEvent) => {
    if (drag) setSeekPct(pctFrom(e.clientX));
  };
  const seekUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pctFrom(e.clientX);
    const v = videoRef.current;
    if (v && duration) {
      try {
        v.currentTime = p * duration;
      } catch {
        /* noop */
      }
      usePlayer.getState().setProgress(p * duration, duration, buffered);
    }
    setDrag(false);
  };

  /* ── Native fullscreen; feature detect each runtime and handle rejection. ── */
  const toggleFs = async () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    const video = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
      webkitExitFullscreen?: () => void;
    }) | null;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement || video?.webkitDisplayingFullscreen;
    try {
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (video?.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
        (screen.orientation as ScreenOrientation & { unlock?: () => void } | undefined)?.unlock?.();
        return;
      }
      const root = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
      if (root?.requestFullscreen) await root.requestFullscreen();
      else if (root?.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else {
        toast('Layar penuh tidak didukung pada pemutar ini', 'err');
        return;
      }
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
      if (orientation?.lock) void orientation.lock('landscape').catch(() => undefined);
    } catch (error) {
      console.warn('[player] fullscreen request failed', error);
      toast('Tidak dapat membuka layar penuh', 'err');
    }
  };

  /* ── Interaksi floating ── */
  const expandToWatch = useCallback(() => {
    const el = rootRef.current;
    const s = usePlayer.getState().session;
    if (!s) return;
    if (el) {
      const r = el.getBoundingClientRect();
      usePlayer.getState().setExpandFrom({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
    navigate(watchPath(s.animeId, s.episode, s.title));
  }, [navigate]);

  const onFloatDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = { d0: Math.hypot(a.x - b.x, a.y - b.y), w0: usePlayer.getState().width };
      pressRef.current = null;
      return;
    }
    const st = usePlayer.getState();
    pressRef.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: st.pos.x < 0 ? defaultPos().x : st.pos.x,
      oy: st.pos.y < 0 ? defaultPos().y : st.pos.y,
      moved: false
    };
  };

  const onFloatMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const w = clampFloatWidth(pinchRef.current.w0 * (d / Math.max(1, pinchRef.current.d0)));
      usePlayer.getState().setWidth(w);
      return;
    }
    const p = pressRef.current;
    if (!p) return;
    const dx = e.clientX - p.sx;
    const dy = e.clientY - p.sy;
    if (!p.moved && Math.hypot(dx, dy) > 5) {
      p.moved = true;
      window.clearTimeout(tapTimer.current);
    }
    if (!p.moved) return;
    const st = usePlayer.getState();
    const w = st.width;
    const h = (w * 9) / 16;
    const nx = Math.max(8, Math.min(p.ox + dx, window.innerWidth - w - 8));
    const ny = Math.max(8, Math.min(p.oy + dy, window.innerHeight - h - floatBottomGuard()));
    st.setPos(nx, ny);
    const inZone = ny + h > window.innerHeight - 100;
    overCloseRef.current = inZone;
    setOverClose(inZone);
  };

  const onFloatUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    const p = pressRef.current;
    pressRef.current = null;
    const inZone = overCloseRef.current;
    overCloseRef.current = false;
    setOverClose(false);
    if (!p) return;
    if (p.moved) {
      if (inZone) closePlayer();
      return;
    }
    /* Tap video → kembali ke pemutar layar penuh. */
    expandToWatch();
  };

  /* ── Render ── */
  if (!show || !session) return null;

  const progress = duration ? currentTime / duration : 0;
  const shown = drag ? seekPct : progress;
  const brightnessPct = Math.round(brightness * 100);
  const volumePct = Math.round(volume * 100);

  return (
    <>
      <div
        ref={rootRef}
        className={
          'gp-root ' +
          (floating ? 'gp-floating' : 'gp-docked') +
          (visible || floating ? '' : ' gp-hidden') +
          (floating && !visible ? ' gp-dim' : '')
        }
        style={
          floating
            ? { width, height: fh, transform: `translate3d(${Math.round(effPos.x)}px, ${Math.round(effPos.y)}px, 0)` }
            : undefined
        }
        onPointerDown={floating ? onFloatDown : undefined}
        onPointerMove={floating ? onFloatMove : undefined}
        onPointerUp={floating ? onFloatUp : undefined}
        onPointerCancel={floating ? onFloatUp : undefined}
      >
        <div className="gp-media" style={{ filter: `brightness(${brightness})` }}>
          {isVideo ? (
            <video
              ref={videoRef}
              playsInline
              autoPlay
              preload="auto"
              poster={session.poster}
              style={{ objectFit: fit }}
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onProgress={onProgress}
              onPlay={() => usePlayer.getState().setPlaying(true)}
              onPause={() => usePlayer.getState().setPlaying(false)}
              onEnded={onEnded}
              onError={onMediaError}
            />
          ) : playUrl ? (
            <iframe
              src={playUrl}
              title={title}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="gp-loading">
              <span className="spinner-sm" role="status" aria-label="Memuat video" />
            </div>
          )}
        </div>

        {floating ? (
          <>
            <div className="gp-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${shown})` }} />
            </div>
            <button
              type="button"
              className="gp-closex"
              aria-label="Tutup pemutar"
              onClick={e => {
                e.stopPropagation();
                closePlayer();
              }}
            >
              <Icon name="x" size={14} strokeWidth={2.6} />
            </button>
            <div className="gp-mini-footer">
              <button
                type="button"
                className="gp-mini-play"
                aria-label={playing ? 'Jeda' : 'Putar'}
                onClick={e => {
                  e.stopPropagation();
                  togglePlay();
                }}
              >
                <Icon name={playing ? 'pause' : 'play'} size={16} strokeWidth={0} />
              </button>
              <span className="gp-mini-body">
                <span className="gp-mini-title ellipsis">{title}</span>
                <span className="gp-mini-sub">Episode {session.episode}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className="gp-shade"
              aria-hidden="true"
              style={{ opacity: visible ? 1 : 0 }}
              onPointerUp={onSurfaceTap}
            />

            {stream ? (
              <div className={'gp-controls' + (visible && !locked ? '' : ' gp-hidden')}>
                {/* Top bar */}
                <div className="gp-top">
                  <button type="button" className="gp-ibtn" aria-label="Kembali" onClick={() => navigate(-1)}>
                    <Icon name="back" size={26} />
                  </button>
                  <div className="gp-titles">
                    <span className="gp-title ellipsis">{title}</span>
                    <span className="gp-sub">Episode {session.episode}</span>
                  </div>
                  <button
                    type="button"
                    className="gp-chip"
                    aria-label="Ubah rasio tampilan"
                    onClick={() => setFit(f => (f === 'contain' ? 'cover' : 'contain'))}
                  >
                    <Icon name={fit === 'contain' ? 'expand' : 'collapse'} size={15} />
                    <span>{fit === 'contain' ? 'Fit' : 'Fill'}</span>
                  </button>
                  <button type="button" className="gp-ibtn" aria-label="Kunci layar" onClick={() => setLocked(true)}>
                    <Icon name="lock" size={20} strokeWidth={2.2} />
                  </button>
                  <button type="button" className="gp-ibtn" aria-label={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'} aria-pressed={fullscreen} onClick={() => void toggleFs()}>
                    <Icon name={fullscreen ? 'collapse' : 'fullscreen'} size={24} />
                  </button>
                </div>

                {/* Sisi kiri: brightness (opsional, sesuai pengaturan) */}
                {settings.playerControls ? (
                  <div className="gp-side left">
                    <VSlider
                      value={brightnessPct}
                      min={2}
                      max={150}
                      onChange={v => usePlayer.getState().setBrightness(v / 100)}
                      label="Kecerahan"
                    />
                    <span className="gp-side-val">{brightnessPct}%</span>
                    <Icon name="settings" size={17} />
                  </div>
                ) : null}

                {/* Sisi kanan: volume (opsional, sesuai pengaturan) */}
                {settings.playerControls ? (
                  <div className="gp-side right">
                    <VSlider
                      value={volumePct}
                      min={0}
                      max={100}
                      onChange={v => usePlayer.getState().setVolume(v / 100)}
                      label="Volume"
                    />
                    <span className="gp-side-val">{volumePct}%</span>
                    <Icon name={volume === 0 ? 'mute' : 'volume'} size={17} />
                  </div>
                ) : null}

                {/* Tengah */}
                <div className="gp-center" onPointerUp={onSurfaceTap}>
                  <button
                    type="button"
                    className="gp-skip"
                    aria-label="Episode sebelumnya"
                    disabled={!neighbors.prev}
                    onPointerUp={e => e.stopPropagation()}
                    onClick={() => {
                      if (neighbors.prev) navigate(watchPath(session.animeId, neighbors.prev.num, title));
                    }}
                  >
                    <Icon name="skipPrev" size={24} />
                  </button>
                  <button
                    type="button"
                    className="gp-skip sm"
                    aria-label="Mundur 10 detik"
                    onPointerUp={e => e.stopPropagation()}
                    onClick={() => seekBy(-10)}
                  >
                    <Icon name="seekBack" size={22} />
                  </button>
                  <button
                    type="button"
                    className="gp-play"
                    aria-label={playing ? 'Jeda' : 'Putar'}
                    onPointerUp={e => e.stopPropagation()}
                    onClick={togglePlay}
                  >
                    <Icon name={playing ? 'pause' : 'play'} size={30} />
                  </button>
                  <button
                    type="button"
                    className="gp-skip sm"
                    aria-label="Maju 10 detik"
                    onPointerUp={e => e.stopPropagation()}
                    onClick={() => seekBy(10)}
                  >
                    <Icon name="seekFwd" size={22} />
                  </button>
                  <button
                    type="button"
                    className="gp-skip"
                    aria-label="Episode berikutnya"
                    disabled={!neighbors.next}
                    onPointerUp={e => e.stopPropagation()}
                    onClick={() => {
                      if (neighbors.next) navigate(watchPath(session.animeId, neighbors.next.num, title));
                    }}
                  >
                    <Icon name="skipNext" size={24} />
                  </button>
                </div>

                {hint ? (
                  <div className={'double-tap-hint ' + hint.side} key={hint.key} style={{ pointerEvents: 'none' }}>
                    {hint.side === 'left' ? '−10s' : '+10s'}
                  </div>
                ) : null}

                {/* Bawah */}
                <div className="gp-bottom">
                  <div className="gp-seekrow">
                    <span className="gp-time">
                      {fmtTime(shown * duration)} <em>/</em> {fmtTime(duration)}
                    </span>
                    <div
                      className={'gp-seek' + (drag ? ' dragging' : '')}
                      ref={seekRef}
                      onPointerDown={seekDown}
                      onPointerMove={seekMove}
                      onPointerUp={seekUp}
                      onPointerCancel={seekUp}
                    >
                      <div className="gp-track">
                        <div className="gp-buffer" style={{ transform: `scaleX(${buffered})` }} />
                        <div className="gp-fill" style={{ transform: `scaleX(${shown})` }} />
                        <div className="gp-thumb" style={{ left: shown * 100 + '%' }} />
                        {settings.skipIntro && duration > 0 ? (
                          <div
                            className="gp-marker"
                            style={{ left: (settings.introDuration / duration) * 100 + '%' }}
                          />
                        ) : null}
                      </div>
                      {drag ? (
                        <div className="gp-bubble" style={{ left: seekPct * 100 + '%' }}>
                          {fmtTime(seekPct * duration)}
                        </div>
                      ) : null}
                    </div>
                    <button type="button" className="gp-chip" aria-label="Kualitas" onClick={() => setSheet('quality')}>
                      {quality}
                    </button>
                    <button type="button" className="gp-chip" aria-label="Kecepatan" onClick={() => setSheet('speed')}>
                      {speed}x
                    </button>
                  </div>
                  {settings.skipIntro && currentTime < settings.introDuration && currentTime >= 0 ? (
                    <div className="gp-extra">
                      <button
                        type="button"
                        className="gp-chip"
                        onClick={() => {
                          const v = videoRef.current;
                          if (v) v.currentTime = settings.introDuration;
                        }}
                      >
                        <Icon name="seekFwd" size={14} />
                        Lewati Intro
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Embed jalan terakhir: top bar ringkas (tanpa pemutar provider) */}
            {!stream && playUrl && !locked ? (
              <div className="gp-top minimal">
                <button type="button" className="gp-ibtn" aria-label="Kembali" onClick={() => navigate(-1)}>
                  <Icon name="back" size={26} />
                </button>
                <div className="gp-titles">
                  <span className="gp-title ellipsis">{title}</span>
                  <span className="gp-sub">Episode {session.episode}</span>
                </div>
              </div>
            ) : null}

            {locked ? (
              <div className="gp-locklayer" onPointerUp={e => e.stopPropagation()}>
                <button
                  type="button"
                  className="gp-lockbtn"
                  aria-label="Buka kunci layar"
                  onClick={() => setLocked(false)}
                >
                  <Icon name="lock" size={22} strokeWidth={2.2} />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {overClose ? (
        <div className="gp-closezone" aria-hidden="true">
          <Icon name="x" size={18} strokeWidth={2.4} />
          <span>Lepaskan untuk Tutup</span>
        </div>
      ) : null}

      <Sheet open={sheet === 'quality'} onClose={() => setSheet(null)} title="Kualitas Video">
        <SheetItem onClick={() => { usePlayer.getState().setQuality('Auto'); setSheet(null); }}>
          <span className="qs-row">
            <span className="qs-check">{quality === 'Auto' ? <Icon name="check" size={15} strokeWidth={3} /> : null}</span>
            <span className="qs-body"><span className="qs-title green">Auto</span><span className="qs-desc">Pilih sumber dan kualitas yang sesuai secara otomatis.</span></span>
          </span>
        </SheetItem>
        {(stream?.qualities || []).filter(q => q.source?.exact).map(q => {
          const tier: Record<string, { name: string; tone: string; desc: string }> = {
            '1080p': { name: 'Premium', tone: 'gold', desc: 'Kualitas paling tinggi untuk tampilan maksimal, terbaik di jaringan cepat.' },
            '720p': { name: 'Bagus', tone: 'orange', desc: 'Gambar lebih tajam dan nyaman ditonton jika internet kamu cukup stabil.' },
            '480p': { name: 'Standar', tone: 'green', desc: 'Pilihan aman untuk harian, cukup jernih dan tetap hemat data.' },
            '360p': { name: 'Hemat', tone: 'gray', desc: 'Ringan untuk kuota dan cepat diputar di koneksi yang tidak stabil.' }
          };
          const t = tier[q.label];
          const selected = quality === q.label;
          return (
            <SheetItem
              key={q.label}
              onClick={() => {
                if (!q.source?.exact) return;
                usePlayer.getState().setServerRef(null);
                usePlayer.getState().setQuality(q.label as QualityLabel);
                setSheet(null);
              }}
            >
              <span className="qs-row">
                <span className="qs-check">{selected ? <Icon name="check" size={15} strokeWidth={3} /> : null}</span>
                <span className="qs-body">
                  <span className={'qs-title ' + (t?.tone || 'gray')}>
                    {q.label}
                    {t ? ` (${t.name})` : ''}
                  </span>
                  <span className="qs-desc">{t?.desc || 'Kualitas video dari sumber.'}</span>
                </span>
              </span>
            </SheetItem>
          );
        })}
      </Sheet>

      <Sheet open={sheet === 'speed'} onClose={() => setSheet(null)} title="Kecepatan Putar">
        {SPEEDS.map(s => (
          <SheetItem
            key={s}
            onClick={() => {
              usePlayer.getState().setSpeed(s);
              setSheet(null);
            }}
          >
            <span style={{ flex: 1 }}>{s}x</span>
            {speed === s ? <Icon name="check" size={16} /> : null}
          </SheetItem>
        ))}
      </Sheet>
    </>
  );
}
