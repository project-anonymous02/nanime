import { makeHtmlProvider } from './factory';

/** AnimeKu (ww2.animeku.lol) — stream + download cadangan. */
export const animekulol = makeHtmlProvider({
  id: 'animekulol',
  name: 'AnimeKu',
  root: 'https://ww2.animeku.lol',
  priority: 4,
  desc: 'Stream + unduhan cadangan (tema AnimeKuLol).',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://ww2.animeku.lol/' }
});
