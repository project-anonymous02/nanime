/**
 * Kebijakan host untuk URL eksternal (iframe, crawling, media).
 * Bukan allowlist penuh — Nanime harus mendukung banyak provider —
 * melainkan denylist untuk tujuan berbahaya (localhost, LAN, link-local,
 * metadata) + validasi skema http/https.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIp(host: string): boolean {
  const ip = host.trim().toLowerCase();
  if (ip === '::1' || ip === '[::1]') return true;
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [, a, b] = m.map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 224) return true;
  return false;
}

function isLocalOrReservedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (isPrivateIp(h)) return true;
  if (h === '::1') return true;
  /** Tag metadata cloud (169.254.169.254 dst.) */
  if (h === '169.254.169.254') return true;
  return false;
}

/** Parse + validasi URL http/https; kembalikan null bila tidak aman. */
export function parseExternalUrl(raw: string | null | undefined): URL | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^(data:|blob:|javascript:|about:)/i.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isLocalOrReservedHostname(url.hostname)) return null;
  return url;
}

/** true bila URL boleh dipakai sebagai sumber iframe eksternal. */
export function isTrustedExternalUrl(raw: string | null | undefined): boolean {
  return parseExternalUrl(raw) !== null;
}

/** true bila URL adalah host publik yang aman untuk di-crawl. */
export function isCrawlableExternalUrl(raw: string | null | undefined): boolean {
  return parseExternalUrl(raw) !== null;
}
