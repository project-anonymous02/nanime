import { makeHtmlProvider } from './factory';

/** Sakunime — stream + download cadangan. */
export const sakunime = makeHtmlProvider({
  id: 'sakunime',
  name: 'Sakunime',
  root: 'https://sakunime.com',
  priority: 6,
  desc: 'Stream + unduhan cadangan.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://sakunime.com/' }
});
