import { makeHtmlProvider } from './factory';

/** AnimeKU (animeku.online) — KHUSUS SUMBER DOWNLOAD (Next.js, katalog film & donghua). */
export const animekuonline = makeHtmlProvider({
  id: 'animekuonline',
  name: 'AnimeKU',
  root: 'https://animeku.online',
  priority: 62,
  downloadOnly: true,
  content: 'donghua',
  desc: 'Anime & donghua — hanya tautan unduh.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  downloadSelector: '.dl-grp, .download, table, a[href*="gofile"], a[href*="pixeldrain"]',
  headers: { Referer: 'https://animeku.online/' }
});
