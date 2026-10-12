export interface ParsedRoute {
  parts: string[];
  q: Record<string, string>;
  path: string;
}

export function parseHash(): ParsedRoute {
  let h = (location.hash || '#/home').replace(/^#/, '');
  let qs = '';
  const qi = h.indexOf('?');
  if (qi > -1) {
    qs = h.slice(qi + 1);
    h = h.slice(0, qi);
  }
  const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  const query: Record<string, string> = {};
  qs.split('&')
    .filter(Boolean)
    .forEach(kv => {
      const i = kv.indexOf('=');
      query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1) || '');
    });
  return { parts, q: query, path: h || '/home' };
}

export function go(path: string, replace?: boolean): void {
  const target = '#' + path;
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) location.replace(target);
  else location.hash = target;
}

export function back(): void {
  if (history.length > 1) history.back();
  else go('/home');
}

export function watchHref(id: string, provider: string, ep: string, eid: string, eslug: string, slug?: string): string {
  return (
    '#/watch/' + encodeURIComponent(id) + '/' + encodeURIComponent(ep) +
    '?provider=' + encodeURIComponent(provider) +
    (eid ? '&eid=' + encodeURIComponent(eid) : '') +
    (eslug ? '&eslug=' + encodeURIComponent(eslug) : '') +
    (slug ? '&slug=' + encodeURIComponent(slug) : '')
  );
}

export function detailHref(id: string, provider: string, slug?: string): string {
  return (
    '#/anime/' + encodeURIComponent(id) + '?provider=' + encodeURIComponent(provider) +
    (slug ? '&slug=' + encodeURIComponent(slug) : '')
  );
}
