import { makeHtmlProvider } from './factory';

/**
 * Doronime — prioritas stream #1.
 * Situs memakai struktur generik (kartu + halaman episode ber-iframe);
 * diblokir Internet Positif pada sebagian jaringan → ditangani fallback.
 */
export const doronime = makeHtmlProvider({
  id: 'doronime',
  name: 'Doronime',
  root: 'https://doronime.id',
  priority: 1,
  desc: 'Prioritas stream #1. Katalog dan server pemutaran utama.',
  searchPath: (q) => '/?s=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://doronime.id/' }
});
