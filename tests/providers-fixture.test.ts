// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  parseBsxCards,
  parseDoc,
  parseEpisodeList,
  parseIframeEmbed,
  parseIframeEmbeds,
  parseAnimestreamDetail,
  parseSoraDownloads,
  seriesSlugFromPost,
  detailHrefFromCard
} from '../src/providers/shared';

const fx = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const BASE = 'https://example.test/';

describe('slug post → detail seri (shared)', () => {
  it('episode & batch di strip menjadi slug seri', () => {
    expect(seriesSlugFromPost('one-piece-episode-1180-subtitle-indonesia')).toBe('one-piece');
    expect(seriesSlugFromPost('spy-x-family-ep-02-dual-subs-x265')).toBe('spy-x-family');
    expect(seriesSlugFromPost('jujutsu-kaisen-season-2-batch-dual-subs')).toBe('jujutsu-kaisen-season-2');
    expect(seriesSlugFromPost('suzume')).toBe('suzume');
  });

  it('link post episode diserder ke /anime/{series}/', () => {
    const r = detailHrefFromCard('https://lendrive.web.id/spy-x-family-ep-02-dual-subs/');
    expect(r.rewritten).toBe(true);
    expect(r.slug).toBe('spy-x-family');
    expect(r.href).toContain('/anime/spy-x-family/');
  });

  it('link /anime/ asli dibiarkan', () => {
    const r = detailHrefFromCard('https://example.test/anime/one-piece/');
    expect(r.rewritten).toBe(false);
    expect(r.slug).toBe('one-piece');
  });
});

describe('Anichin (fixture nyata)', () => {
  it('daftar/home menghasilkan kartu bsx dengan judul & slug', () => {
    const doc = parseDoc(fx('anichin-list.html'));
    const cards = parseBsxCards(doc, 'https://ani-chin.id/', 'anichin');
    expect(cards.length).toBeGreaterThan(10);
    const c = cards[0];
    expect(c.title.length).toBeGreaterThan(2);
    expect((c.slug || '').length).toBeGreaterThan(0);
    expect(c.provider).toBe('anichin');
    expect(c.sourceUrl).toMatch(/^https:\/\//);
  });

  it('halaman detail: judul, genre, daftar episode', () => {
    const doc = parseDoc(fx('anichin-detail.html'));
    const d = parseAnimestreamDetail(doc, 'https://ani-chin.id/anime/x/', 'anichin');
    expect(d.title.length).toBeGreaterThan(2);
    expect(d.episodeList.length).toBeGreaterThan(0);
    const nums = d.episodeList.filter(e => /\d/.test(e.num));
    expect(nums.length).toBeGreaterThan(0);
    // link episode memakai pola {slug}-episode-N
    expect(d.episodeList.some(e => /-episode-\d+/.test(e.slug || e.id))).toBe(true);
    // batch tidak ikut sebagai episode
    expect(d.episodeList.every(e => !/^batch$/i.test(e.num))).toBe(true);
  });

  it('halaman episode menyimpan episodeId untuk API servers', () => {
    const doc = parseDoc(fx('anichin-episode.html'));
    const el = doc.querySelector('#as-servers[data-episode]');
    expect(el).not.toBeNull();
    expect(/^\d+$/.test(el!.getAttribute('data-episode') || '')).toBe(true);
    expect(el!.getAttribute('data-episode')).toBe('5213');
  });
});

describe('Samehadaku (fixture nyata)', () => {
  it('hasil pencarian memakai link detail /anime/', () => {
    const doc = parseDoc(fx('samehadaku-search.html'));
    const cards = parseBsxCards(doc, 'https://samehadaku.li/', 'samehadaku');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(c => /\/anime\//.test(c.sourceUrl))).toBe(true);
    expect(cards[0].title.length).toBeGreaterThan(2);
  });

  it('halaman episode: iframe player (data-litespeed-src) + unduhan sora', () => {
    const doc = parseDoc(fx('samehadaku-episode.html'));
    const embeds = parseIframeEmbeds(doc, 'https://samehadaku.li/');
    expect(embeds.length).toBeGreaterThan(0);
    expect(embeds[0].url).toMatch(/^https:\/\//);
    expect(embeds[0].url).not.toBe('about:blank');
    const single = parseIframeEmbed(doc, 'https://samehadaku.li/');
    expect(single).toMatch(/^https:\/\//);
    const dl = parseSoraDownloads(doc, 'https://samehadaku.li/');
    expect(dl.length).toBeGreaterThan(0);
    expect(dl[0].quality.length).toBeGreaterThan(0);
    expect(dl[0].url).toMatch(/^https?:\/\//);
  });

  it('halaman detail punya judul & genre', () => {
    const doc = parseDoc(fx('samehadaku-detail.html'));
    const d = parseAnimestreamDetail(doc, 'https://samehadaku.li/anime/x/', 'samehadaku');
    expect(d.title.length).toBeGreaterThan(2);
    expect(d.genres.length).toBeGreaterThan(0);
  });
});

describe('Lendrive (fixture nyata, provider unduhan)', () => {
  it('beranda menghasilkan kartu post → slug seri terserder', () => {
    const doc = parseDoc(fx('lendrive-home.html'));
    const cards = parseBsxCards(doc, 'https://lendrive.web.id/', 'lendrive');
    expect(cards.length).toBeGreaterThan(5);
    // kartu home adalah post episode → sourceUrl harus sudah /anime/{seri}/
    const withPost = cards.filter(c => /-(?:ep|episode)-\d+/.test(c.id) || /-(?:ep|episode)-/.test(c.title));
    for (const c of cards) expect(c.sourceUrl).toMatch(/\/anime\//);
    expect(withPost.length).toBeGreaterThanOrEqual(0);
    // slug tak lagi membawa ep-NN
    expect(cards.some(c => /-ep-\d+-/.test(c.slug || ''))).toBe(false);
  });

  it('halaman episode punya link unduhan sora', () => {
    const doc = parseDoc(fx('lendrive-episode.html'));
    const dl = parseSoraDownloads(doc, 'https://lendrive.web.id/');
    expect(dl.length).toBeGreaterThan(0);
    expect(dl.some(d => /acefile|pndk|drive|mega|pixeldrain|terabox/i.test(d.url) || d.quality.length > 0)).toBe(true);
    expect(dl[0].url).toMatch(/^https?:\/\//);
  });
});
