import { makeHtmlProvider } from './factory';

/** Nimegami — stream + download cadangan (Next.js, search `/anime/?q=`). */
export const nimegami = makeHtmlProvider({
  id: 'nimegami',
  name: 'Nimegami',
  root: 'https://nimegami.id',
  priority: 5,
  desc: 'Stream + unduhan cadangan. UI minimalis rapi.',
  searchPath: (q) => '/anime/?q=' + encodeURIComponent(q),
  detailPath: (id) => '/anime/' + encodeURIComponent(id) + '/',
  headers: { Referer: 'https://nimegami.id/' }
});
