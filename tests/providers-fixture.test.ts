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
    const r = detailHrefFromCard('https://example.test/spy-x-family-ep-02-dual-subs/');
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
