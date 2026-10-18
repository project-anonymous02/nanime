import { describe, it, expect, beforeEach } from 'vitest';
import { useApp } from '../src/state/app';
import { useSettings } from '../src/state/settings';
import { useLibrary } from '../src/state/library';
import { useAuth } from '../src/state/auth';
import { DEFAULT_SETTINGS } from '../src/lib/remote/types';

const fav = (id: string, title = id) => ({ id, title, poster: '', score: '', type: '', status: '' });

const hist = (animeId: string, episode = '1', watchedAt = Date.now()) => ({
  animeId,
  episode,
  title: animeId,
  poster: '',
  positionSec: 0,
  durationSec: 0,
  percent: 0,
  completed: false,
  watchedAt
});

beforeEach(() => {
  localStorage.clear();
  useAuth.setState({ signedIn: false, user: null, ready: true, configured: false });
  useApp.setState({ onboarded: false, mode: 'multi' });
  useSettings.setState({ ...DEFAULT_SETTINGS });
  useLibrary.setState({ favorites: [], history: [], tombstones: { fav: {}, hist: {} } });
});

describe('useApp — preferensi perangkat', () => {
  it('mode default multi & bisa diganti', () => {
    expect(useApp.getState().mode).toBe('multi');
    useApp.getState().setMode('single');
    expect(useApp.getState().mode).toBe('single');
  });

  it('onboarded tersimpan setelah pengenalan', () => {
    expect(useApp.getState().onboarded).toBe(false);
    useApp.getState().markOnboarded();
    expect(useApp.getState().onboarded).toBe(true);
  });
});

describe('useSettings — pengaturan pemutar', () => {
  it('patch mengubah nilai & persist ke nanime.v2.settings', async () => {
    useSettings.getState().patch({ defaultQuality: '720p', skipIntro: true });
    expect(useSettings.getState().defaultQuality).toBe('720p');
    expect(useSettings.getState().skipIntro).toBe(true);
    await Promise.resolve();
    const raw = localStorage.getItem('nanime.v2.settings') || '';
    expect(raw).toContain('720p');
  });

  it('patch parsial tidak menghapus nilai lain', () => {
    useSettings.getState().patch({ introDuration: 120 });
    expect(useSettings.getState().introDuration).toBe(120);
    expect(useSettings.getState().autoplayNext).toBe(DEFAULT_SETTINGS.autoplayNext);
  });

  it('reset kembali ke default', () => {
    useSettings.getState().patch({ autoplayNext: false, defaultQuality: '1080p' });
    useSettings.getState().reset();
    expect(useSettings.getState().autoplayNext).toBe(DEFAULT_SETTINGS.autoplayNext);
    expect(useSettings.getState().defaultQuality).toBe(DEFAULT_SETTINGS.defaultQuality);
  });
});

describe('useLibrary — favorit & riwayat lokal-first', () => {
  it('toggleFavorite menambah lalu menghapus disertai tombstone', () => {
    useLibrary.getState().toggleFavorite(fav('a', 'Anime A'));
    expect(useLibrary.getState().isFavorite('a')).toBe(true);
    expect(useLibrary.getState().favorites[0].addedAt).toBeGreaterThan(0);

    useLibrary.getState().toggleFavorite(fav('a', 'Anime A'));
    expect(useLibrary.getState().isFavorite('a')).toBe(false);
    expect(useLibrary.getState().tombstones.fav.a).toBeGreaterThan(0);

    useLibrary.getState().toggleFavorite(fav('a', 'Anime A'));
    expect(useLibrary.getState().tombstones.fav.a).toBeUndefined();
  });

  it('addHistory menggantikan entri judul+episode yang sama', () => {
    useLibrary.getState().addHistory(hist('x', '1', 100));
    useLibrary.getState().addHistory(hist('x', '1', 200));
    expect(useLibrary.getState().history).toHaveLength(1);
    expect(useLibrary.getState().history[0].watchedAt).toBe(200);

    useLibrary.getState().addHistory(hist('x', '2', 300));
    expect(useLibrary.getState().history).toHaveLength(2);
  });

  it('riwayat dibatasi 500 entri', () => {
    for (let i = 0; i < 520; i++) useLibrary.getState().addHistory(hist('id' + i, '1', i));
    expect(useLibrary.getState().history).toHaveLength(500);
  });

  it('removeHistory menghapus entri terkait & mencatat tombstone', () => {
    useLibrary.getState().addHistory(hist('x', '1'));
    useLibrary.getState().addHistory(hist('x', '2'));
    useLibrary.getState().removeHistory([{ animeId: 'x', episode: '1' }]);
    expect(useLibrary.getState().history).toHaveLength(1);
    expect(useLibrary.getState().history[0].episode).toBe('2');
    expect(useLibrary.getState().tombstones.hist['x|1']).toBeGreaterThan(0);
  });

  it('clearHistory & purge mengosongkan koleksi', () => {
    useLibrary.getState().addHistory(hist('x'));
    useLibrary.getState().toggleFavorite(fav('a'));
    useLibrary.getState().clearHistory();
    expect(useLibrary.getState().history).toHaveLength(0);
    expect(useLibrary.getState().favorites).toHaveLength(1);

    useLibrary.getState().purge();
    expect(useLibrary.getState().favorites).toHaveLength(0);
    expect(useLibrary.getState().tombstones.fav).toEqual({});
    expect(useLibrary.getState().tombstones.hist).toEqual({});
  });
});
