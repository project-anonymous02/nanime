// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseBsxCards, parseIframeEmbeds } from '../src/providers/shared';
import {
  allProviders,
  officialProviders,
  orderedProviders,
  searchProviders,
  streamingPriority,
  streamingProviders
} from '../src/providers/registry';
import fs from 'node:fs';

const fixture = (name: string) => fs.readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');

describe('provider priority and verified page structure', () => {
  it('orders the official catalog as Otakudesu → Samehadaku → Animeku', () => {
    expect(officialProviders().map(provider => provider.id)).toEqual(['otakudesu', 'samehadaku', 'animeku']);
    expect(orderedProviders('otakudesu').map(provider => provider.id)).toEqual(['otakudesu', 'samehadaku', 'animeku']);
    expect(streamingProviders().map(provider => provider.id)).toEqual(['otakudesu', 'samehadaku', 'animeku']);
    expect(streamingPriority('otakudesu')).toBeLessThan(streamingPriority('samehadaku'));
    expect(streamingPriority('samehadaku')).toBeLessThan(streamingPriority('animeku'));
  });

  it('does not register the removed Nekopoi provider', () => {
    const ids = allProviders().map(provider => provider.id);
    expect(ids).toEqual(['otakudesu', 'samehadaku', 'animeku']);
    expect(searchProviders().map(provider => provider.id)).not.toContain('nekopoi');
    expect(streamingProviders().some(provider => provider.id === 'nekopoi')).toBe(false);
    expect(orderedProviders('otakudesu').some(provider => provider.id === 'nekopoi')).toBe(false);
  });

  it('parses the captured Samehadaku search page using its actual bsx result link', () => {
    const doc = new DOMParser().parseFromString(fixture('samehadaku-search.html'), 'text/html');
    const cards = parseBsxCards(doc, 'https://samehadaku.li/', 'samehadaku');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(card => card.provider === 'samehadaku')).toBe(true);
    expect(cards.every(card => card.sourceUrl.startsWith('https://'))).toBe(true);
    expect(new Set(cards.map(card => card.sourceUrl)).size).toBe(cards.length);
  });

  it('keeps Samehadaku iframe servers as embed references, not as direct video URLs', () => {
    const doc = new DOMParser().parseFromString(fixture('samehadaku-episode.html'), 'text/html');
    const embeds = parseIframeEmbeds(doc, 'https://samehadaku.li/one-piece-episode-1000/');
    expect(embeds.length).toBeGreaterThan(0);
    expect(embeds.every(embed => embed.url.startsWith('https://'))).toBe(true);
  });
});
