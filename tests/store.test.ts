import { describe, it, expect, beforeEach } from 'vitest';
import { useApp } from '../src/state/app';
import { useSettings } from '../src/state/settings';
import { useLibrary } from '../src/state/library';
import { useAuth } from '../src/state/auth';
import { clampFloatWidth, episodeNeighbors, usePlayer } from '../src/state/player';
import { DEFAULT_SETTINGS } from '../src/lib/remote/types';
import type { EpisodeItem, StreamBundle } from '../src/core/types';

const fav = (id: string, title = id) => ({ id, title, poster: '', score: '', type: '', status: '' });

const streamBundle = (id: string, episode = '1'): StreamBundle => ({
  id,
  title: 'Anime ' + id,
  poster: '',
  episode,
  qualities: [],
  defaultQuality: '480p',
  servers: [],
  downloads: [],
  synopsis: '',
  sourceCount: 0
});

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
  usePlayer.setState({ session: null, quality: '480p', serverRef: null, playUrl: '', closed: false, floating: false });
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

describe('usePlayer — sesi pemutaran global', () => {
  it('open membuka sesi & close menutup paksa', () => {
    usePlayer.getState().open({
      session: {
        animeId: 'a1',
        episode: '3',
        title: 'Anime a1',
        poster: '',
        stream: streamBundle('a1', '3'),
        episodes: []
      },
      quality: '720p'
    });
    expect(usePlayer.getState().session?.animeId).toBe('a1');
    expect(usePlayer.getState().quality).toBe('720p');
    expect(usePlayer.getState().closed).toBe(false);

    usePlayer.getState().close();
    expect(usePlayer.getState().session).toBeNull();
    expect(usePlayer.getState().closed).toBe(true);
  });

  it('patchSession hanya berlaku saat ada sesi', () => {
    usePlayer.getState().patchSession({ title: 'X' });
    expect(usePlayer.getState().session).toBeNull();

    usePlayer.getState().open({
      session: {
        animeId: 'a1',
        episode: '1',
        title: 'Awal',
        poster: '',
        stream: streamBundle('a1'),
        episodes: []
      },
      quality: '480p'
    });
    const eps: EpisodeItem[] = [{ num: '1', id: '1', slug: '', date: '' }];
    usePlayer.getState().patchSession({ title: 'Baru', episodes: eps });
    expect(usePlayer.getState().session?.title).toBe('Baru');
    expect(usePlayer.getState().session?.episodes).toHaveLength(1);
  });

  it('volume, brightness, dan lebar floating selalu dijepit ke rentang aman', () => {
    usePlayer.getState().setVolume(2);
    expect(usePlayer.getState().volume).toBe(1);
    usePlayer.getState().setVolume(-1);
    expect(usePlayer.getState().volume).toBe(0);

    usePlayer.getState().setBrightness(0);
    expect(usePlayer.getState().brightness).toBe(0.02);
    usePlayer.getState().setBrightness(9);
    expect(usePlayer.getState().brightness).toBe(1.5);

    usePlayer.getState().setWidth(80);
    expect(usePlayer.getState().width).toBe(160);
    usePlayer.getState().setWidth(999);
    expect(usePlayer.getState().width).toBe(400);
  });

  it('clampFloatWidth membatasi 160–400 px & membulatkan', () => {
    expect(clampFloatWidth(100)).toBe(160);
    expect(clampFloatWidth(1000)).toBe(400);
    expect(clampFloatWidth(247.6)).toBe(248);
  });

  it('episodeNeighbors menemukan episode sebelum/sesudah', () => {
    const eps: EpisodeItem[] = ['1', '2', '3'].map(n => ({ num: n, id: n, slug: '', date: '' }));
    expect(episodeNeighbors(eps, '2').prev?.num).toBe('1');
    expect(episodeNeighbors(eps, '2').next?.num).toBe('3');
    expect(episodeNeighbors(eps, '1').prev).toBeUndefined();
    expect(episodeNeighbors(eps, '3').next).toBeUndefined();
    expect(episodeNeighbors(eps, 'x').next).toBeUndefined();
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
