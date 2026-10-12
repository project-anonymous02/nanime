import { describe, it, expect, beforeEach } from 'vitest';
import { parseHash, detailHref, watchHref, go } from '../src/core/router';

describe('router', () => {
  beforeEach(() => {
    (globalThis as any).location.hash = '#/home';
  });

  it('parseHash memecah path dan query', () => {
    (globalThis as any).location.hash = '#/anime/abc?provider=otakudesu&slug=abc';
    const r = parseHash();
    expect(r.parts).toEqual(['anime', 'abc']);
    expect(r.q.provider).toBe('otakudesu');
    expect(r.q.slug).toBe('abc');
    expect(r.path).toBe('/anime/abc');
  });

  it('parseHash mendecode bagian path', () => {
    (globalThis as any).location.hash = '#/genre/genre-28?title=Action';
    const r = parseHash();
    expect(r.parts[1]).toBe('genre-28');
    expect(r.q.title).toBe('Action');
  });

  it('hash kosong jatuh ke /home', () => {
    (globalThis as any).location.hash = '';
    expect(parseHash().path).toBe('/home');
  });

  it('detailHref dan watchHref membentuk tautan lengkap', () => {
    expect(detailHref('abc', 'otakudesu', 'abc')).toBe('#/anime/abc?provider=otakudesu&slug=abc');
    expect(watchHref('abc', 'otakudesu', '3', 'ep3', '', 'abc')).toContain('#/watch/abc/3?provider=otakudesu');
  });

  it('go menyetel location.hash', () => {
    go('/schedule');
    expect((globalThis as any).location.hash).toBe('#/schedule');
  });
});
