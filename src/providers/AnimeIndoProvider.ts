import { makeHtmlProvider } from './factory';

/** AnimeIndo — prioritas stream #3 (Nuxt, search `/search?q=`). */
export const animeindo = makeHtmlProvider({
  id: 'animeindo',
  name: 'AnimeIndo',
  root: 'https://animeindo.cloud',
  priority: 3,
  desc: 'Prioritas stream #3. Katalog Nuxt dengan kartu `.anime-card`.',
  searchPath: (q) => '/search?q=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://animeindo.cloud/' }
});
