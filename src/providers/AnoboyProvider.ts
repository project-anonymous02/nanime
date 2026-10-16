import { makeHtmlProvider } from './factory';

/**
 * Anoboy — SELALU prioritas paling akhir karena paling lambat.
 * Situs ketat (rate-limit/Cloudflare) → kegagalan dialihkan ke provider lain.
 */
export const anoboy = makeHtmlProvider({
  id: 'anoboy',
  name: 'Anoboy',
  root: 'https://anoboy.be',
  priority: 999,
  desc: 'Cadangan terakhir. Sangat lambat; hanya dipakai bila sumber lain gagal.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://anoboy.be/' }
});
