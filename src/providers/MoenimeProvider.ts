import { makeHtmlProvider } from './factory';

/**
 * Moenime — KHUSUS SUMBER DOWNLOAD (portal unduh lawas, tema "sparkling").
 * Tidak pernah menjadi sumber pemutaran; link dikumpulkan ke tab Download.
 */
export const moenime = makeHtmlProvider({
  id: 'moenime',
  name: 'Moenime',
  root: 'https://moenime.com',
  priority: 60,
  downloadOnly: true,
  desc: 'Portal unduhan (batch & per episode). Tanpa server streaming.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/' + encodeURIComponent(id) + '/',
  downloadSelector: '.soraddlx, .soraurlx, .post-content, .entry-content, table',
  headers: { Referer: 'https://moenime.com/' }
});
