// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHtml } from '../src/core/scraper';

/* HTML mini: meniru struktur asli otakudesu, oploverz, dan kusonime. */
const ODU_EPISODE = `
<html><body>
<div class="venutama"><h1 class="posttl">Boruto: Naruto Next Generations Episode 293 Subtitle Indonesia</h1></div>
<div class="player-embed"><div class="responsive-embed-stream">
<iframe src="https://desustream.net/dstream/updesu/v5/index.php?id=abc"></iframe></div></div>
<div class="mirrorstream" style="width:100%">
<ul class="m360p" style="width:30%"><span class="dashicons"></span> Mirror 360p
<li><a href="#" data-content="eyJpZCI6MTM4MzY2LCJpIjowLCJxIjoiMzYwcCJ9">odstream</a></li>
<li><a href="#" data-content="eyJpZCI6MTM4MzY2LCJpIjoxLCJxIjoiMzYwcCJ9">ondesuvip</a></li>
</ul>
<ul class="m480p"><span class="dashicons"></span> Mirror 480p
<li><a href="#" data-content="eyJpZCI6MTM4MzY2LCJpIjowLCJxIjoiNDgwcCJ9" data-default="true">updesu</a></li>
<li><a href="#" data-content="eyJpZCI6MTM4MzY2LCJpIjoxLCJxIjoiNDgwcCJ9">odstream</a></li>
</ul>
<ul class="m720p"><span class="dashicons"></span> Mirror 720p
<li><a href="#" data-content="eyJpZCI6MTM4MzY2LCJpIjowLCJxIjoiNzIwcCJ9">odstream </a></li>
</ul>
</div>
</body></html>`;

const OPLZ_EPISODE = `
<html><body>
<h1 class="entry-title">Naruto Episode 220</h1>
<iframe src="https://www.blogger.com/video.g?token=AD6v5d"></iframe>
<div class="item video-nav"><div class="mobius">
<select class="mirror" name="mirror" onchange="loadMi(this);">
  <option value="">Select Video Server</option>
  <option value="PGlmcmFtZSBzcmM9Imh0dHBzOi8vZXhhbXBsZS5jb20vYS5pc3RyZWFtIj48L2lmcmFtZT4=" data-index="1">Server 1 | sd]google-v2</option>
  <option value="PGlmcmFtZSBzcmM9Imh0dHBzOi8vZXhhbXBsZS5jb20vYi5pc3RyZWFtIj48L2lmcmFtZT4=">Server 2 | mirror-mp4</option>
</select></div></div>
</body></html>`;

const KUS_SEARCH = `
<html><body><div class="vezone"><div class="venz">
<div class="kover"><a class="thumb" href="https://kusonime.com/suzume/"><img src="https://i.example/suzume.jpg"></a>
<div class="content"><h2><a href="https://kusonime.com/suzume/">Suzume Batch Subtitle Indonesia</a></h2></div></div>
<div class="kover"><a class="thumb" href="https://kusonime.com/your-name/"><img src="https://i.example/yn.jpg"></a>
<div class="content"><h2><a href="https://kusonime.com/your-name/">Your Name [Movie] Batch</a></h2></div></div>
</div></div></body></html>`;

const KUS_MOVIES = `
<html><body><div class="penzbar"><div class="jdlbar"><ul>
<li><a class="kmz" href="https://kusonime.com/spirited-away/">Spirited Away</a></li>
<li><a class="kmz" href="https://kusonime.com/chihiro/">Chihiro Movie</a></li>
</ul></div></div></body></html>`;

const CF_BEACON = `
<html><head><title>Naruto - Nanime</title></head><body>
<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>
<script>cf_chl_opt={...};</script>
</body></html>`;

describe('parseHtml — daftar server streaming otakudesu', () => {
  it('mengurai .mirrorstream menjadi qualityList dengan mirror & default', () => {
    const r = parseHtml({ provider: 'otakudesu', action: 'episode', id: 'btr-ng-episode-293-sub-indo' }, ODU_EPISODE, 'https://otakudesu.blog/episode/btr-ng-episode-293-sub-indo/');
    const d = r.data.details;
    expect(d.title).toContain('Episode 293');
    expect(d.defaultStreamingUrl).toContain('desustream.net');

    const ql = d.server.qualityList;
    expect(ql.map((q: any) => q.title)).toEqual(['360p', '480p', '720p']);
    expect(ql[0].serverList.map((s: any) => s.title)).toEqual(['odstream', 'ondesuvip']);

    const all = ql.flatMap((q: any) => q.serverList);
    expect(all.length).toBe(5);
    expect(all.some((s: any) => s.default)).toBe(true);
    const def = all.find((s: any) => s.default);
    expect(def.title).toBe('updesu');
    expect(atob(def.serverId)).toBe(JSON.stringify({ id: 138366, i: 0, q: '480p' }));
  });
});

describe('parseHtml — daftar server oploverz', () => {
  it('mengurai select.mirror menjadi qualityList berprefix oplz:', () => {
    const r = parseHtml({ provider: 'oploverz', action: 'episode', id: 'naruto-episode-220' }, OPLZ_EPISODE, 'https://oploverz.am/naruto-episode-220/');
    const d = r.data.details;
    expect(d.streamingUrl).toContain('blogger.com');
    const ql = d.server.qualityList;
    expect(ql.length).toBe(1);
    expect(ql[0].serverList.length).toBe(2);
    expect(ql[0].serverList[0].title).toBe('sd]google-v2');
    expect(ql[0].serverList[0].serverId.startsWith('oplz:')).toBe(true);
    expect(ql[0].serverList[0].default).toBe(true);
  });
});

describe('parseHtml — kusonime', () => {
  it('mengurai daftar movie', () => {
    const r = parseHtml({ provider: 'kusonime', action: 'movies' }, KUS_MOVIES, 'https://kusonime.com/anime-movie-list/');
    expect(r.data.length).toBe(2);
    expect(r.data[0].endpoint).toBe('spirited-away');
  });

  it('mengurai hasil search dengan url & thumbnail', () => {
    const r = parseHtml({ provider: 'kusonime', action: 'search', query: 'suzume' }, KUS_SEARCH, 'https://kusonime.com/?s=suzume&post_type=post');
    const list = r.data.listAnime;
    expect(list.length).toBe(2);
    expect(list[0].title).toContain('Suzume');
    expect(list[0].thumbnail).toContain('suzume.jpg');
    expect(list[0].url).toContain('kusonime.com/suzume');
    expect(list[0].endpoint).toBe('suzume');
  });
});

describe('parseHtml — daftar episode otakudesu', () => {
  it('memecah nomor episode dari judul & slug, menangkap tanggal, dan menyingkirkan tautan batch', () => {
    const html = `
      <html><body>
      <div class="infozingle"><p><span><b>Judul</b>: Boruto</span></p><p><span><b>Skor</b>: 6.15</span></p>
      <p><span><b>Status</b>: Drop</span></p><p><span><b>Total Episode</b>: ?</span></p></div>
      <div class="episodelist"><div class="smokelister"><span class="monktit">Boruto Batch</span></div>
      <ul><li><span><a href="https://otakudesu.blog/batch/btr-nng-batch-sub-indo/">[BATCH] Subtitle Indonesia</a></span>
      <span class="zeebr">29 Mei,2020</span></li></ul></div>
      <div class="episodelist"><ul>
      <li><span><a href="https://otakudesu.blog/episode/btr-ng-episode-293-sub-indo/">Boruto: Naruto Next Generations Episode 293 Subtitle Indonesia</a></span>
      <span class="zeebr">26 Maret,2023</span></li>
      <li><span><a href="https://otakudesu.blog/episode/brt-ng-episode-1-sub-indo/">Boruto: Naruto Next Generations Episode 1 Subtitle Indonesia</a></span>
      <span class="zeebr">29 Mei,2020</span></li>
      </ul></div></body></html>`;
    const r = parseHtml({ provider: 'otakudesu', action: 'detail', id: 'borot-sub-indo' }, html, 'https://otakudesu.blog/anime/borot-sub-indo/');
    const d = r.data.details;
    expect(d.batch.batchId).toBe('btr-nng-batch-sub-indo');
    expect(d.episodeList).toHaveLength(2);
    expect(d.episodeList[0].num).toBe('293');
    expect(d.episodeList[0].episodeId).toBe('btr-ng-episode-293-sub-indo');
    expect(d.episodeList[0].date).toBe('26 Maret,2023');
    expect(d.episodeList[1].num).toBe('1');
  });
});

describe('parseHtml — kartu otakudesu (ongoing vs complete)', () => {
  it('membedakan hari rilis dan rating dari .epztipe', () => {
    const ongoing = `
      <html><body><div class="venz"><ul><li><div class="detpost">
      <div class="epz"><span></span> Episode 2</div>
      <div class="epztipe"><i></i> Senin</div><div class="newnime">12 Okt</div>
      <div class="thumb"><a href="https://otakudesu.blog/anime/kanata-kara-sub-indo/">
      <div class="thumbz"><img src="https://otakudesu.blog/x.jpg"></div><h2 class="jdlflm">Kanata kara</h2></a></div>
      </div></li></ul></div></body></html>`;
    const c = parseHtml({ provider: 'otakudesu', action: 'ongoing' }, ongoing, 'https://otakudesu.blog/ongoing-anime/').data.animeList[0];
    expect(c.score).toBe('');
    expect(c.releaseDay).toBe('Senin');

    const complete = `
      <html><body><div class="venz"><ul><li><div class="detpost">
      <div class="epz"><span></span>12 Episode</div>
      <div class="epztipe"><i></i> 7.65</div><div class="newnime">12 Okt</div>
      <div class="thumb"><a href="https://otakudesu.blog/anime/sayonara-lara-sub-indo/">
      <div class="thumbz"><img src="https://otakudesu.blog/y.jpg"></div><h2 class="jdlflm">Sayonara Lara</h2></a></div>
      </div></li></ul></div></body></html>`;
    const d = parseHtml({ provider: 'otakudesu', action: 'completed' }, complete, 'https://otakudesu.blog/complete-anime/').data.animeList[0];
    expect(d.score).toBe('7.65');
    expect(d.releaseDay).toBe('');
  });
});

describe('parseHtml — false positive Cloudflare', () => {
  it('halaman normal yang memuat beacon challenge-platform tidak dibuang', () => {
    expect(() =>
      parseHtml({ provider: 'otakudesu', action: 'search', query: 'naruto' }, CF_BEACON, 'https://otakudesu.blog/?s=naruto')
    ).not.toThrow();
  });
});
