// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseNontonCards } from '../src/providers/NontonAnimeProvider';

const SEARCH_HTML = `<a href="https://nontonanime.id/anime/one-piece" class="anime-card">
  <div class="anime-poster-wrapper"><img src="https://img.test/onepiece.jpg" alt="One Piece" class="anime-poster"><div class="poster-overlay"></div></div>
  <div class="anime-info"><div class="anime-title-row"><div class="status-dot yellow-green" title="Ongoing"></div><h3 class="anime-title" title="One Piece">One Piece</h3></div>
  <div class="anime-badges"><span class="badge">TV</span><span class="badge">1999</span><span class="badge"><i class="fas fa-closed-captioning"></i> 1181</span></div></div>
</a>`;

const HOME_HTML = `<a href="https://nontonanime.id/anime/ao-no-hako-season-2" class="group anime-card-v1">
  <div class="anime-card-poster-wrapper-v1"><img loading="lazy" src="https://img.test/aohako.jpg" alt="Ao no Hako Season 2" class="anime-card-poster-v1"></div>
  <div class="anime-card-title-v1">Ao no Hako Season 2</div>
  <div class="anime-card-badgebar-v1"><span>TV</span><span>2026</span><span><svg><path></path></svg> 3 / 12</span></div>
  <div class="status-dot green"></div>
</a>`;

describe('NontonAnime card parser', () => {
  it('reads the search card layout with badges and status', () => {
    const doc = new DOMParser().parseFromString(SEARCH_HTML, 'text/html');
    const cards = parseNontonCards(doc);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      provider: 'nontonanime',
      slug: 'one-piece',
      title: 'One Piece',
      poster: 'https://img.test/onepiece.jpg',
      type: 'TV',
      status: 'Ongoing',
      year: '1999',
      epLabel: 'Episode 1181'
    });
  });

  it('reads the home carousel layout and derives status from the dot', () => {
    const doc = new DOMParser().parseFromString(HOME_HTML, 'text/html');
    const cards = parseNontonCards(doc);
    expect(cards[0]).toMatchObject({
      slug: 'ao-no-hako-season-2',
      title: 'Ao no Hako Season 2',
      type: 'TV',
      status: 'Ongoing',
      year: '2026',
      epLabel: 'Episode 3 / 12'
    });
  });
});
