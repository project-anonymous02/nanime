import { makeHtmlProvider } from './factory';

/** Animekuindo (s2.anime-kuindo.com) — stream + download cadangan (tema animestream). */
export const animekuindo = makeHtmlProvider({
  id: 'animekuindo',
  name: 'Animekuindo',
  root: 'https://s2.anime-kuindo.com',
  priority: 7,
  desc: 'Stream + unduhan cadangan (tema animestream).',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://s2.anime-kuindo.com/' }
});
