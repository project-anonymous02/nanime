import { describe, it, expect } from 'vitest';
import { buildForcedQualities, guessQuality } from '../src/core/services/QualityNormalizer';
import type { EpisodeStream } from '../src/core/types';

const stream = (over: Partial<EpisodeStream> = {}): EpisodeStream => ({
  provider: 'p',
  title: 'Server Utama',
  playerUrl: 'https://cdn.test/720p.mp4',
  qualities: [],
  servers: [],
  downloads: [],
  info: null,
  ...over
});

describe('guessQuality — menebak label dari teks apa pun', () => {
  it('mengenali angka kualitas, HD/SD, dan 4K', () => {
    expect(guessQuality('1080p x265')).toBe('1080p');
    expect(guessQuality('HD 720p')).toBe('720p');
    expect(guessQuality('HD')).toBe('720p');
    expect(guessQuality('SD')).toBe('360p');
    expect(guessQuality('4K HDR')).toBe('1080p');
    expect(guessQuality('server cadangan')).toBeNull();
  });
});

describe('buildForcedQualities — 4 kualitas SELALU ada', () => {
  it('tidak memberi label resolusi pada sumber yang kualitasnya tidak diketahui', () => {
    const out = buildForcedQualities({
      streams: [{ provider: 'a', stream: stream({ playerUrl: 'https://cdn.test/watch?id=1', title: 'Episode 1' }) }],
      downloads: []
    });
    expect(out.qualities.every(q => q.source === null)).toBe(true);
    expect(out.servers[0].quality).toBeUndefined();
    expect(out.servers[0].url).toContain('watch?id=1');
  });

  it('slot kosong meminjam sumber kualitas terdekat (approx)', () => {
    const out = buildForcedQualities({
      streams: [
        { provider: 'a', stream: stream({ playerUrl: 'https://cdn.test/1080p.mp4', title: 'Full HD' }) },
        { provider: 'b', stream: stream({ playerUrl: 'https://cdn.test/720p.mp4', title: '720p' }) }
      ],
      downloads: []
    });
    expect(out.qualities.map(q => q.label)).toEqual(['1080p', '720p', '480p', '360p']);
    expect(out.qualities.map(q => q.approx)).toEqual([false, false, true, true]);
    const q480 = out.qualities.find(q => q.label === '480p')!;
    expect(q480.source?.providerRef).toBe('b');
    const q360 = out.qualities.find(q => q.label === '360p')!;
    expect(q360.source?.providerRef).toBe('b');
    expect(out.defaultQuality).toBe('720p');
  });

  it('keempat kualitas eksplisit tidak ditandai approx', () => {
    const out = buildForcedQualities({
      streams: (['1080p', '720p', '480p', '360p'] as const).map((q, i) => ({
        provider: 'p' + i,
        stream: stream({ playerUrl: `https://cdn.test/${q}.mp4`, title: q })
      })),
      downloads: []
    });
    expect(out.qualities.every(q => !q.approx)).toBe(true);
    expect(out.qualities.every(q => q.source?.exact === true)).toBe(true);
    expect(out.defaultQuality).toBe('480p');
  });

  it('tanpa sumber: empat slot kosong tanpa pinjaman', () => {
    const out = buildForcedQualities({ streams: [], downloads: [] });
    expect(out.qualities).toHaveLength(4);
    expect(out.qualities.every(q => q.source === null && !q.approx)).toBe(true);
    expect(out.defaultQuality).toBe('480p');
    expect(out.servers).toEqual([]);
  });

  it('unduhan file ikut mengisi kualitas & server utama ditandai default', () => {
    const out = buildForcedQualities({
      streams: [
        {
          provider: 'a',
          stream: stream({
            playerUrl: 'https://cdn.test/embed/abc',
            title: 'Main',
            servers: [{ name: 'Mirror', id: 'srv-1', quality: '480p' }]
          })
        }
      ],
      downloads: [{ quality: '1080p', name: 'Google Drive', url: 'https://cdn.test/dl/bleach-1080p.mp4' }]
    });
    const q1080 = out.qualities.find(q => q.label === '1080p')!;
    expect(q1080.approx).toBe(false);
    expect(q1080.source?.providerRef).toBe('download');
    expect(q1080.source?.kind).toBe('file');

    expect(out.servers[0].isDefault).toBe(true);
    expect(out.servers[0].label).toBe('Main');
    expect(out.servers[1].label).toBe('Mirror');
    expect(out.servers[1].providerRef).toBe('a');
    expect(out.servers[1].quality).toBe('480p');
  });
});
