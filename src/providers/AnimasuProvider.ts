import { makeHtmlProvider } from './factory';

/**
 * Animasu exposes a public WordPress-style catalogue. The supplied example
 * resolves through the site's own search result (`/anime/<slug>/`); the sample
 * watch page is never reused as an ID or as a universal episode URL.
 */
export const animasu = makeHtmlProvider({
  id: 'animasu',
  name: 'Animasu',
  root: 'https://animasu.love',
  priority: 1,
  content: 'anime',
  desc: 'Katalog Animasu; halaman detail/episode diambil dari tautan hasil aktual.',
  searchPath: query => '/?s=' + encodeURIComponent(query),
  detailPath: id => '/anime/' + encodeURIComponent(id.replace(/^\/+|\/+$/g, '')) + '/',
  headers: { Referer: 'https://animasu.love/' }
});
