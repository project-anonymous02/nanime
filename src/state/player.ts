import { create } from 'zustand';
import type { EpisodeItem, QualityLabel, StreamBundle } from '../core/types';

/**
 * Player global — sesi pemutaran yang TIDAK PERNAH hilang selama aplikasi
 * terbuka. Video hidup di satu elemen DOM persisten (GlobalPlayer) sehingga
 * berpindah halaman hanya mengubah mode tampilan (docked ↔ floating), bukan
 * menghentikan playback.
 */

export interface PlayerSession {
  animeId: string;
  episode: string;
  title: string;
  poster: string;
  stream: StreamBundle;
  episodes: EpisodeItem[];
}
export type QualitySelection = QualityLabel | 'Auto';

/** Geometri awal animasi expand (floating → fullscreen). */
export interface ExpandFrom {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlayerState {
  session: PlayerSession | null;
  quality: QualitySelection;
  serverRef: string | null;
  playUrl: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  /** Pengali CSS brightness (0.02–1.5). */
  brightness: number;
  speed: number;
  closed: boolean;
  floating: boolean;
  pos: { x: number; y: number };
  /** Lebar floating dalam px (160–400). */
  width: number;
  expandFrom: ExpandFrom | null;

  open(s: { session: PlayerSession; quality: QualitySelection }): void;
  patchSession(p: Partial<PlayerSession>): void;
  close(): void;
  setPlayUrl(u: string): void;
  setPlaying(v: boolean): void;
  setProgress(t: number, d: number, b: number): void;
  setVolume(v: number): void;
  setBrightness(v: number): void;
  setSpeed(v: number): void;
  setQuality(q: QualitySelection): void;
  setServerRef(r: string | null): void;
  setFloating(v: boolean): void;
  setPos(x: number, y: number): void;
  setWidth(w: number): void;
  setExpandFrom(g: ExpandFrom | null): void;
}

export const FLOAT_MIN_W = 160;
export const FLOAT_MAX_W = 400;
export const FLOAT_DEFAULT_W = 240;

export const clampFloatWidth = (w: number): number =>
  Math.max(FLOAT_MIN_W, Math.min(FLOAT_MAX_W, Math.round(w)));

/** Episode sebelum/sesudah dari daftar episode. */
export function episodeNeighbors(
  episodes: EpisodeItem[],
  current: string
): { prev?: EpisodeItem; next?: EpisodeItem } {
  const i = episodes.findIndex(e => e.num === String(current));
  if (i < 0) return {};
  return { prev: episodes[i - 1], next: episodes[i + 1] };
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  session: null,
  quality: 'Auto',
  serverRef: null,
  playUrl: '',
  playing: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  brightness: 1,
  speed: 1,
  closed: false,
  floating: false,
  pos: { x: -1, y: -1 },
  width: FLOAT_DEFAULT_W,
  expandFrom: null,

  open({ session, quality }) {
    set({
      session,
      quality,
      serverRef: null,
      playUrl: '',
      playing: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      closed: false,
      expandFrom: null
    });
  },

  patchSession(p) {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, ...p } });
  },

  close() {
    set({
      session: null,
      playUrl: '',
      playing: false,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      serverRef: null,
      floating: false,
      closed: true,
      expandFrom: null
    });
  },

  setPlayUrl(u) {
    set({ playUrl: u });
  },
  setPlaying(v) {
    set({ playing: v });
  },
  setProgress(t, d, b) {
    set({ currentTime: t, duration: d, buffered: b });
  },
  setVolume(v) {
    set({ volume: Math.max(0, Math.min(1, v)) });
  },
  setBrightness(v) {
    set({ brightness: Math.max(0.02, Math.min(1.5, v)) });
  },
  setSpeed(v) {
    set({ speed: Math.max(0.25, Math.min(3, v)) });
  },
  setQuality(q) {
    set({ quality: q });
  },
  setServerRef(r) {
    set({ serverRef: r });
  },
  setFloating(v) {
    set({ floating: v });
  },
  setPos(x, y) {
    set({ pos: { x, y } });
  },
  setWidth(w) {
    set({ width: clampFloatWidth(w) });
  },
  setExpandFrom(g) {
    set({ expandFrom: g });
  }
}));
