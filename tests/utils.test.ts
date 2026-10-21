import { describe, it, expect } from 'vitest';
import {
  esc,
  epsNum,
  cleanVal,
  seriesSlug,
  normalizeSearchText,
  formatTime,
  formatDuration,
  relTime,
  isVideoUrl
} from '../src/core/utils';

describe('utils', () => {
  it('esc men-escape karakter HTML', () => {
    expect(esc('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('epsNum mengambil angka episode', () => {
    expect(epsNum('Episode 12')).toBe('12');
    expect(epsNum('Eps 3.5')).toBe('3');
    expect(epsNum('')).toBe('');
  });

  it('cleanVal membuang nilai kosong palsu', () => {
    expect(cleanVal('-')).toBe('');
    expect(cleanVal('Rating: 8.5')).toBe('8.5');
    expect(cleanVal('  judul,  ')).toBe('judul');
  });

  it('seriesSlug membentuk slug stabil', () => {
    expect(seriesSlug('One Piece Film: Red')).toBe('one-piece-film-red');
  });

  it('normalizeSearchText menyamakan kapitalisasi & tanda baca', () => {
    expect(normalizeSearchText('SWORD ART  ONLINE!')).toBe('sword art online');
  });

  it('formatTime dan formatDuration', () => {
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3725)).toBe('1j 2m');
  });

  it('relTime memberi label relatif', () => {
    expect(relTime(Date.now())).toBe('baru saja');
    expect(relTime(Date.now() - 3 * 60000)).toBe('3 menit lalu');
    expect(relTime(Date.now() - 2 * 3600000)).toBe('2 jam lalu');
  });

  it('isVideoUrl mengenali stream video', () => {
    expect(isVideoUrl('https://x.test/a.mp4')).toBe(true);
    expect(isVideoUrl('https://x.test/a.m3u8?token=1')).toBe(true);
    expect(isVideoUrl('https://x.test/a.mpd?token=1')).toBe(true);
    expect(isVideoUrl('https://rr2---sn-test.googlevideo.com/videoplayback?mime=video%2Fmp4')).toBe(true);
    expect(isVideoUrl('https://x.test/watch')).toBe(false);
  });
});
