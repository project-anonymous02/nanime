// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseAnimekuDetail, parseSearchCards, parseSeriesCards } from '../src/providers/AnimeKuProvider';
import { parseSoraDownloads } from '../src/providers/shared';
import { parseHtml } from '../src/core/scraper';

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('Animeku custom aku-* theme', () => {
  it('parses search cards from article.aku-sel', () => {
    const cards = parseSeriesCards(
      doc(`
        <article class="aku-sel">
          <a class="aku-bing" href="/one-piece/"><img data-src="https://cdn.animeku.lol/op.jpg"></a>
          <h3><a href="/one-piece/">One Piece</a></h3>
          <div class="aku-eps">Episode 1120</div>
          <div class="aku-nilai">8.7</div>
        </article>
      `),
      'https://ww2.animeku.lol/?s=one'
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'one-piece',
      slug: 'one-piece',
      provider: 'animeku',
      title: 'One Piece',
      poster: 'https://cdn.animeku.lol/op.jpg',
      score: '8.7',
      epLabel: 'Episode 1120',
      sourceUrl: 'https://ww2.animeku.lol/one-piece/'
    });
  });

  it('returns only the search grid and ignores the latest-anime block', () => {
    const cards = parseSearchCards(
      doc(`
        <main class="aku-ruang">
          <div class="aku-tajuk"><h1>Pencarian anime: Overflow</h1></div>
          <div class="aku-petak">
            <article class="aku-sel"><a class="aku-bing" href="/overflow-abc/"><img src="/overflow.jpg"></a><h3><a href="/overflow-abc/">Overflow</a></h3></article>
          </div>
          <div class="aku-tajuk"><h2>Anime Terbaru</h2></div>
          <div class="aku-petak">
            <article class="aku-sel"><a class="aku-bing" href="/unrelated-xyz/"><img src="/u.jpg"></a><h3><a href="/unrelated-xyz/">Unrelated</a></h3></article>
          </div>
        </main>
      `),
      'https://ww2.animeku.lol/?s=Overflow'
    );
    expect(cards.map(card => card.title)).toEqual(['Overflow']);
  });

  it('does not treat the latest-anime fallback as search results when nothing matches', () => {
    const cards = parseSearchCards(
      doc(`
        <body class="search search-no-results">
          <main class="aku-ruang">
            <div class="aku-tajuk"><h1>Pencarian anime: Overflow</h1></div>
            <section class="aku-pengantar"><p>Tidak ada anime dengan kata kunci itu.</p></section>
            <div class="aku-tajuk"><h2>Anime Terbaru</h2></div>
            <div class="aku-petak">
              <article class="aku-sel"><a class="aku-bing" href="/unrelated-xyz/"><img src="/u.jpg"></a><h3><a href="/unrelated-xyz/">Unrelated</a></h3></article>
            </div>
          </main>
        </body>
      `),
      'https://ww2.animeku.lol/?s=Overflow'
    );
    expect(cards).toEqual([]);
  });

  it('parses detail facts, episodes, and play links from the real route shape', () => {
    const detail = parseAnimekuDetail(
      doc(`
        <article class="aku-kepala">
          <img src="https://cdn.animeku.lol/naruto.jpg">
          <h1>Nonton Naruto Sub Indo HD</h1>
          <div class="aku-cap"><span>220 Episode</span><span>Finished Airing</span><span>★ 8.02</span></div>
        </article>
        <div class="aku-fakta">
          <div class="aku-fakta-b"><span class="aku-fakta-k">Genre</span><span class="aku-fakta-v"><a href="/genre/aksi-siacdd4/">Action</a></span></div>
          <div class="aku-fakta-b"><span class="aku-fakta-k">Studio</span><span class="aku-fakta-v">Studio Pierrot</span></div>
          <div class="aku-fakta-b"><span class="aku-fakta-k">Status</span><span class="aku-fakta-v">Finished Airing</span></div>
        </div>
        <div class="aku-eplist">
          <a href="/play/naruto-episode-1-9gzesaa/">Naruto Episode 1</a>
          <a href="/play/naruto-episode-2-abc123/">Naruto Episode 2</a>
        </div>
      `),
      'https://ww2.animeku.lol/naruto/'
    );
    expect(detail.title).toBe('Naruto');
    expect(detail.episodes).toBe('220');
    expect(detail.score).toBe('8.02');
    expect(detail.status).toBe('Finished Airing');
    expect(detail.studio).toBe('Studio Pierrot');
    expect(detail.genres).toEqual([{ t: 'Action', id: 'aksi-siacdd4' }]);
    expect(detail.episodeList.map(episode => episode.num)).toEqual(['1', '2']);
    expect(detail.episodeList[0].id).toBe('https://ww2.animeku.lol/play/naruto-episode-1-9gzesaa/');
  });
});

describe('download blocks', () => {
  it('parses Samehadaku aspd download blocks', () => {
    const links = parseSoraDownloads(
      doc(`
        <div class="aspd-download">
          <div class="aspd-download-title">720p</div>
          <a href="https://pixeldrain.com/u/abc">Pixeldrain</a>
        </div>
      `),
      'https://samehadaku.li/one-piece-episode-1/'
    );
    expect(links).toEqual([{ quality: '720p', name: 'Pixeldrain', url: 'https://pixeldrain.com/u/abc' }]);
  });

  it('parses Otakudesu episode and batch download blocks', () => {
    const episode = parseHtml(
      { provider: 'otakudesu', action: 'episode' },
      `
        <div class="download">
          <h4>480p</h4>
          <ul><li><strong>480p</strong><i>70 MB</i><a href="https://mega.nz/file/abc">Mega</a></li></ul>
        </div>
      `,
      'https://otakudesu.blog/naruto-episode-1-sub-indo/'
    );
    expect(episode.data.details.download.qualityList[0].title).toBe('480p');
    expect(episode.data.details.download.qualityList[0].qualityList[0].urlList[0].url).toBe('https://mega.nz/file/abc');

    const batch = parseHtml(
      { provider: 'otakudesu', action: 'batch' },
      `
        <div class="download2">
          <div class="batchlink">
            <h4>Batch 720p</h4>
            <ul><li><strong>MKV 720p</strong><i>1.2 GB</i><a href="https://drive.google.com/file/d/abc">Drive</a></li></ul>
          </div>
        </div>
      `,
      'https://otakudesu.blog/batch/naruto-batch-sub-indo/'
    );
    expect(batch.data.details.download.formatList[0].title).toBe('Batch 720p');
    expect(batch.data.details.download.formatList[0].qualityList[0].urlList[0].url).toBe('https://drive.google.com/file/d/abc');
  });
});
