import { makeHtmlProvider } from './factory';

/** Alqanime — KHUSUS SUMBER DOWNLOAD (anime batch, tema "animebatch"). */
export const alqanime = makeHtmlProvider({
  id: 'alqanime',
  name: 'Alqanime',
  root: 'https://alqanime.net',
  priority: 61,
  downloadOnly: true,
  desc: 'Anime batch subtitle Indonesia — hanya tautan unduh.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/' + encodeURIComponent(id) + '/',
  downloadSelector: '.soraddlx, .soraurlx, table, .entry-content',
  headers: { Referer: 'https://alqanime.net/' }
});
