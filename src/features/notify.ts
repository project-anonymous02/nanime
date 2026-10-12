import { API } from '../core/api';
import { Store } from '../core/store';
import { epsNum } from '../core/utils';

let newCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let toastFn: ((m: string, k?: 'ok' | 'err' | 'info', title?: string) => void) | null = null;

export function setNotifier(fn: (m: string, k?: 'ok' | 'err' | 'info', title?: string) => void): void {
  toastFn = fn;
}

/** Jumlah judul dengan episode baru sejak kunjungan terakhir. */
export function newEpisodeCount(): number {
  return newCount;
}

export function clearNewEpisodes(): void {
  newCount = 0;
}

/** Bandingkan daftar ongoing terbaru dengan angka episode terakhir yang diketahui. */
export async function checkNewEpisodes(userVisible = false): Promise<number> {
  const provider = Store.getProvider();
  try {
    const { ongoing } = await API.home();
    let count = 0;
    ongoing.forEach(a => {
      const num = parseInt(epsNum(a.epLabel) || epsNum(a.title) || '', 10);
      if (!num) return;
      const key = provider + ':' + a.id;
      const last = Store.seen[key] || 0;
      if (last > 0 && num > last) count++;
      Store.setSeen(key, Math.max(num, last));
    });
    newCount = count;
    if (userVisible && count > 0 && toastFn) {
      toastFn(count + ' judul punya episode baru sejak terakhir kamu buka.', 'info', 'Episode Baru');
    }
    return count;
  } catch (e) {
    console.warn('checkNewEpisodes failed', e);
    return 0;
  }
}

export function startNotifyLoop(): void {
  stopNotifyLoop();
  if (!Store.cfg.notify) return;
  const ms = Math.max(5, Store.cfg.notifyInterval || 15) * 60000;
  timer = setInterval(() => {
    if (document.hidden) checkNewEpisodes(false);
  }, ms);
}

export function stopNotifyLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Perbarui interval/aktif-notifikasi setelah pengaturan berubah. */
export function syncNotifySetting(): void {
  startNotifyLoop();
  if (Store.cfg.notify && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}
