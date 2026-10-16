import { makeHtmlProvider } from './factory';

/**
 * Samehadaku (v2.samehadaku.how) — utamanya sumber unduhan.
 * Bila halaman episode menyediakan iframe, ia juga dipakai sebagai server stream.
 */
export const samehadakuhow = makeHtmlProvider({
  id: 'samehadakuhow',
  name: 'Samehadaku',
  root: 'https://v2.samehadaku.how',
  priority: 31,
  desc: 'Sumber unduhan lengkap; memakai server streaming bila tersedia.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  downloadSelector: '.soraddlx, .soraurlx, table',
  headers: { Referer: 'https://v2.samehadaku.how/' }
});
