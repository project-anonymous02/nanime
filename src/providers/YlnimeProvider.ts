import { makeHtmlProvider } from './factory';

/** Ylnime — prioritas stream #2 (tema Bootstrap WordPress, kartu `.card`). */
export const ylnime = makeHtmlProvider({
  id: 'ylnime',
  name: 'Ylnime',
  root: 'https://ylnime.com',
  priority: 2,
  desc: 'Prioritas stream #2. Katalog besar dengan pemutaran embed.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://ylnime.com/' }
});
