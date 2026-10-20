// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDoc, parseBsxCards } from '../src/providers/shared';
import { parseMoenimeCards } from '../src/providers/MoenimeProvider';
import { parseGomunimeCards } from '../src/providers/GomunimeProvider';
import { allProviders, downloadProviders, searchProviders, streamingPriority, streamingProviders } from '../src/providers/registry';
import { parseIframeEmbeds } from '../src/providers/shared';
import fs from 'node:fs';

const fixture = (name: string) => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');

describe('provider priority and verified page structure', () => {
  it('places Animasu first and Moenime last among download fallbacks', () => {
    expect(searchProviders()[0]?.id).toBe('animasu');
    expect(streamingProviders()[0]?.id).toBe('animasu');
    expect(streamingProviders()[1]?.id).toBe('anitoki');
    expect(streamingPriority('gomunime')).toBeLessThan(streamingPriority('doronime'));
    const downloadable = downloadProviders();
    expect(downloadable[downloadable.length - 1]?.id).toBe('moenime');
    expect(allProviders().some(provider => provider.id === 'nekopoi')).toBe(true);
    expect(downloadable.some(provider => provider.content === 'hentai')).toBe(false);
  });

  it('parses the captured Animasu search page using its actual bsx result link', () => {
    const doc = new DOMParser().parseFromString(fixture('animasu-search.html'), 'text/html');
    const cards = parseBsxCards(doc, 'https://animasu.love/?s=tenki+no+ko', 'animasu');
    const tenki = cards.find(card => /weathering with you/i.test(card.title));
    expect(tenki).toBeDefined();
    expect(tenki?.sourceUrl).toBe('https://animasu.love/anime/tenki-no-ko-indonesia/');
    expect(tenki?.poster).toMatch(/^https:\/\//);
  });

  it('parses Moenime article cards, separates film type, and preserves source URL', () => {
    const cards = parseMoenimeCards(new DOMParser().parseFromString(fixture('moenime-home.html'), 'text/html'));
    const blackClover = cards.find(card => /black clover season 2/i.test(card.title));
    const movie = cards.find(card => card.type === 'Movie');
    expect(blackClover?.provider).toBe('moenime');
    expect(blackClover?.sourceUrl).toMatch(/^https:\/\/moenime\.com\//);
    expect(movie?.sourceUrl).toMatch(/^https:\/\/moenime\.com\//);
    expect(movie?.type).toBe('Movie');
  });

  it('parses Gomunime movie/search cards and only retains page episode references with explicit numbers', () => {
    const searchDoc = new DOMParser().parseFromString(fixture('gomunime-search.html'), 'text/html');
    const cards = parseGomunimeCards(searchDoc, 'https://gomunime.top/search?q=one+piece');
    expect(cards.some(card => card.title === 'One Piece')).toBe(true);
    expect(cards.some(card => card.type === 'Movie')).toBe(true);

    const detailDoc = new DOMParser().parseFromString(fixture('gomunime-detail.html'), 'text/html');
    const episodeLinks = [...detailDoc.querySelectorAll('a.ept[data-n]')];
    expect(episodeLinks.length).toBeGreaterThan(0);
    expect(episodeLinks[0].getAttribute('data-n')).toMatch(/^\d+$/);
  });

  it('keeps Gomunime iframe servers as embed references, not as direct video URLs', () => {
    const doc = new DOMParser().parseFromString(fixture('gomunime-episode.html'), 'text/html');
    const embeds = parseIframeEmbeds(doc, 'https://gomunime.top/one-piece-episode-1180');
    expect(embeds.length).toBe(3);
    expect(embeds.every(embed => embed.url.startsWith('https://'))).toBe(true);
    expect(allProviders().some(provider => provider.id === 'gomunime' && provider.downloadOnly !== true)).toBe(true);
  });
});
