import { API_CANDIDATES, type ApiSource } from './config';
import { LS, Store } from './store';

const WIN = (src: ApiSource) => 'apiWin.' + src;

/** Daftar kandidat base URL — override manual > pemenang tersimpan > default. */
export function candidates(src: ApiSource): string[] {
  const out: string[] = [];
  const push = (v: string | undefined | null) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (out.indexOf(s) === -1) out.push(s);
  };
  const override = (Store.cfg.apiBase?.[src] || '').trim();
  if (override) push(override);
  push(LS.get<string>(WIN(src), ''));
  API_CANDIDATES[src].forEach(push);
  return out;
}

export function currentBase(src: ApiSource): string {
  const win = LS.get<string>(WIN(src), '');
  if (win) return win;
  const override = Store.cfg.apiBase?.[src];
  return override ? override.trim() : '';
}

export function setBase(src: ApiSource, base: string): void {
  if (base) LS.set(WIN(src), base);
  else LS.del(WIN(src));
}
