export const $ = <T extends Element = HTMLElement>(s: string, root?: ParentNode): T | null =>
  (root || document).querySelector<T>(s);

export const $$ = <T extends Element = HTMLElement>(s: string, root?: ParentNode): T[] =>
  [...(root || document).querySelectorAll<T>(s)];

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const debounce = <T extends (...a: any[]) => void>(fn: T, ms: number) => {
  let t: ReturnType<typeof setTimeout>;
  return function (this: unknown, ...a: Parameters<T>) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), ms);
  };
};

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const cleanVal = (v: unknown): string => {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === '-' || s === '?' || s === 'null' || s === 'undefined' || /^unknown$/i.test(s)) return '';
  return s.replace(/^\s*(Rating|Status|Score)\s*:\s*/i, '').replace(/,+$/, '').trim();
};

export const epsNum = (v: unknown): string => {
  const m = String(v == null ? '' : v).match(/\d+/);
  return m ? m[0] : '';
};

export const seriesSlug = (v: unknown): string =>
  String(v == null ? '' : v)
    .split('\t')[0]
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

export function normalizeSearchText(s: unknown): string {
  if (!s) return '';
  return String(s)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const isVideoUrl = (u: string): boolean => /\.(mp4|m3u8|mpd|webm|mkv|mov)(\?|#|$)/i.test(String(u || ''));

export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return h + 'j ' + m + 'm';
  if (m) return m + 'm';
  return Math.floor(sec) + 'd';
}

export function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

export const relTime = (ts: number): string => {
  const d = Date.now() - ts;
  const mins = Math.floor(d / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return mins + ' menit lalu';
  const h = Math.floor(mins / 60);
  if (h < 24) return h + ' jam lalu';
  const days = Math.floor(h / 24);
  if (days < 30) return days + ' hari lalu';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function downloadJSON(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
