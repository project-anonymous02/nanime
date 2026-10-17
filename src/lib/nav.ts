/** Pembangun tautan rute kanonik. */

export function detailPath(canonicalId: string, title?: string): string {
  const base = '/detail/' + encodeURIComponent(canonicalId);
  return title ? base + '?title=' + encodeURIComponent(title) : base;
}

export function watchPath(canonicalId: string, episode: string, title?: string): string {
  const base = '/watch/' + encodeURIComponent(canonicalId) + '/' + encodeURIComponent(episode);
  return title ? base + '?title=' + encodeURIComponent(title) : base;
}

export function searchPath(query: string): string {
  return '/search?q=' + encodeURIComponent(query);
}

/** Bagikan lewat lembar berbagi sistem; bila tidak ada, salin ke papan klip. */
export async function shareOrCopy(title: string, url: string): Promise<boolean> {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const share = nav ? (nav as Navigator & { share?: (d: ShareData) => Promise<void> }).share : undefined;
  if (nav && share) {
    try {
      await share.call(nav, { title, url });
      return false;
    } catch {
      return false;
    }
  }
  if (!nav) return false;
  try {
    await nav.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
