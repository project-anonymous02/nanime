import { useCallback, useEffect, useRef, useState } from 'react';
import { isNativeFullscreenPlatform, listenNativeFullscreen, setNativeFullscreenActive } from '../lib/nativeFullscreen';

/**
 * Batas waktu permintaan Web Fullscreen.
 *
 * Di Android WebView (Capacitor) permintaan fullscreenmanaged oleh
 * `BridgeWebChromeClient.onShowCustomView()` yang langsung memanggil
 * `callback.onCustomViewHidden()`. Dalam kondisi tersebut promise
 * `requestFullscreen()` dapat menggantung tanpa resolve DAN tanpa reject,
 * sehingga `await` tanpa batas akan memblokir jalur fallback selamanya.
 * Timeout memastikan fullscreen visual + immersive native tetap bisa masuk.
 */
export const FULLSCREEN_REQUEST_TIMEOUT_MS = 1500;

export interface UsePlayerFullscreenOptions {
  /** Elemen yang diminta menjadi fullscreen (box player Nanime). */
  targetRef: React.RefObject<HTMLElement | null>;
}

export interface PlayerFullscreenApi {
  /** Nanime sedang dalam fullscreen (Web Fullscreen API ATAU fullscreen visual). */
  isFullscreen: boolean;
  /** Fullscreen visual (kelas `.player-fs`) aktif — dipakai native/CSS. */
  visualFullscreen: boolean;
  /** Permintaan fullscreen sedang berjalan (mencegah request ganda). */
  pending: boolean;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
}

class FullscreenTimeoutError extends Error {
  constructor() {
    super('fullscreen request timeout');
    this.name = 'FullscreenTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new FullscreenTimeoutError()), ms);
    // WebKit lama mengembalikan `undefined` (bukan promise) → normalisasi dulu.
    Promise.resolve(promise).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

/** `screenOrientation` belum ada di lib.dom TypeScript, jadi didefinisikan manual. */
type NanimeFullscreenOptions = FullscreenOptions & { screenOrientation?: string };

interface FullscreenCapableElement {
  requestFullscreen?: (options?: NanimeFullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: (options?: NanimeFullscreenOptions) => Promise<void>;
}

/**
 * Minta Web Fullscreen API pada elemen player.
 * Mengembalikan true HANYA jika `document.fullscreenElement` benar-benar terisi
 * (promise resolve bukan bukti fullscreen aktif).
 */
export async function requestBrowserFullscreen(target: HTMLElement | null): Promise<boolean> {
  if (!target) return false;
  const capable = target as unknown as FullscreenCapableElement;
  const request = capable.requestFullscreen || capable.webkitRequestFullscreen;
  if (typeof request !== 'function') return false;
  try {
    await withTimeout(request.call(target, { screenOrientation: 'landscape' }), FULLSCREEN_REQUEST_TIMEOUT_MS);
  } catch (error) {
    // Timeout: jangan retry, permintaan sebelumnya mungkin sudah aktif di browser.
    if (error instanceof FullscreenTimeoutError) return false;
    // some browser lama menolak opsi screenOrientation → coba tanpa opsi.
    try {
      await withTimeout(request.call(target), FULLSCREEN_REQUEST_TIMEOUT_MS);
    } catch {
      return false;
    }
  }
  return !!document.fullscreenElement;
}

async function exitBrowserFullscreen(): Promise<void> {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (!exit || !document.fullscreenElement) return;
  try {
    await exit.call(document);
  } catch {
    /* fullscreenchange akan menyinkronkan state */
  }
}

/**
 * Sumber kebenaran fullscreen untuk PlayerOverlay.
 *
 * Dua mekanisme, satu state:
 * 1. `browserFullscreen` — Web Fullscreen API aktif pada box player (web/PWA).
 * 2. `visualFullscreen` — fullscreen visual (CSS `.player-fs`) + immersive
 *    native + orientasi landscape. Jalur utama di Android WebView karena
 *    WebView membuang permintaan fullscreen dari halaman.
 *
 * State tidak pernah "ditebak" dari hasil promise: `document.fullscreenElement`
 * dan event `fullscreenchange` yang menentukan, event native (`changed`)
 * menyinkronkan mode immersive, dan setiap jalur keluar selalu memulihkan
 * orientasi + system bar.
 */
export function usePlayerFullscreen({ targetRef }: UsePlayerFullscreenOptions): PlayerFullscreenApi {
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const [visualFullscreen, setVisualFullscreen] = useState(false);
  const [pending, setPending] = useState(false);

  const browserRef = useRef(false);
  const visualRef = useRef(false);
  const pendingRef = useRef(false);
  /** M incremented setiap kali masuk/keluar fullscreen → membatalkan request basi. */
  const generationRef = useRef(0);
  /** Intent pengguna: true = ingin fullscreen, false = ingin keluar. */
  const desiredRef = useRef(false);

  const isFullscreen = browserFullscreen || visualFullscreen;
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  const applyNative = useCallback((active: boolean) => {
    // Plugin native hanya ada di shell Android; di web panggilan ini hanya
    // menghasilkan error "not implemented" yang diabaikan.
    if (!isNativeFullscreenPlatform()) return;
    void setNativeFullscreenActive(active, true);
  }, []);

  const lockLandscape = useCallback(async () => {
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (orientation && typeof orientation.lock === 'function') await orientation.lock('landscape');
    } catch {
      /* WebView membatasi orientation lock — plugin native adalah fallback utama. */
    }
  }, []);

  const unlockOrientation = useCallback(() => {
    try {
      const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
      if (orientation && typeof orientation.unlock === 'function') orientation.unlock();
    } catch {
      /* Abaikan: plugin native memulihkan orientasi. */
    }
  }, []);

  const enter = useCallback(async () => {
    // Cegah request ganda: klik beruntun tidak boleh membuat state tidak sinkron.
    if (pendingRef.current) return;
    if (browserRef.current || visualRef.current) return;
    pendingRef.current = true;
    desiredRef.current = true;
    setPending(true);
    const generation = ++generationRef.current;
    try {
      // Platform native: WebView memodifikasi permintaan fullscreen, jadi
      // fullscreen visual + immersive + orientasi landscape adalah jalur
      // utama yang deterministik (chrome Nanime tetap terlihat & bisa ditutup).
      if (!isNativeFullscreenPlatform()) {
        const entered = await requestBrowserFullscreen(targetRef.current);
        if (generation !== generationRef.current) return;
        if (entered) {
          applyNative(true);
          await lockLandscape();
          return;
        }
      }
      if (generation !== generationRef.current) return;
      visualRef.current = true;
      setVisualFullscreen(true);
      applyNative(true);
      await lockLandscape();
    } finally {
      if (generation === generationRef.current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }, [applyNative, lockLandscape, targetRef]);

  const exit = useCallback(async () => {
    // Batalkan request yang sedang berjalan agar tidak "hidup kembali" setelah keluar.
    generationRef.current += 1;
    pendingRef.current = false;
    desiredRef.current = false;
    setPending(false);
    browserRef.current = false;
    visualRef.current = false;
    setBrowserFullscreen(false);
    setVisualFullscreen(false);
    await exitBrowserFullscreen();
    // exitFullscreen bisa ditolak browser → samakan lagi state dengan DOM agar
    // tombol tidak menyatakan "keluar" padahal elemen masih fullscreen.
    const stillFullscreen = document.fullscreenElement === targetRef.current;
    if (stillFullscreen) {
      browserRef.current = true;
      setBrowserFullscreen(true);
      applyNative(true);
      return;
    }
    applyNative(false);
    unlockOrientation();
  }, [applyNative, targetRef, unlockOrientation]);

  const toggle = useCallback(async () => {
    // Request yang sedang berjalan bisa dibatalkan user (tap kedua) —
    // tanpa ini klik kedua diabaikan begitu saja dan state menggantung.
    if (isFullscreenRef.current || pendingRef.current) await exit();
    else await enter();
  }, [enter, exit]);

  useEffect(() => {
    const sync = () => {
      const element = document.fullscreenElement as HTMLElement | null;
      const isBox = !!element && element === targetRef.current;
      if (isBox && !desiredRef.current) {
        // Box Nanime masuk fullscreen browser TANPA intent user (request basi
        // yang selesai setelah user keluar) → tutup lagi supaya fullscreen
        // tidak "hidup kembali" dan orientasi tidak terkunci.
        void exitBrowserFullscreen();
        return;
      }
      browserRef.current = isBox;
      setBrowserFullscreen(isBox);
      if (isBox) {
        applyNative(true);
        return;
      }
      if (!element) {
        // Tidak ada elemen fullscreen (keluar dari fullscreen provider/box).
        // Restore immersive hanya bila fullscreen visual Nanime tidak aktif.
        if (!visualRef.current) {
          applyNative(false);
          unlockOrientation();
        }
      } else {
        // Iframe provider yang fullscreen → immersive native tetap menyala.
        applyNative(true);
      }
    };
    const onError = () => {
      // Hanya relevan untuk permintaan fullscreen yang SEDANG berjalan.
      // Event `fullscreenerror` bisa datang terlambat (setelah user keluar) —
      // tanpa penjaga ini fullscreen akan "hidup kembali" tanpa diminta.
      if (!pendingRef.current) return;
      // Permintaan ditolak browser → tetap layani fullscreen visual.
      if (browserRef.current || visualRef.current) return;
      visualRef.current = true;
      setVisualFullscreen(true);
      applyNative(true);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('fullscreenerror', onError);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('fullscreenerror', onError);
    };
  }, [applyNative, targetRef, unlockOrientation]);

  useEffect(() => listenNativeFullscreen(active => {
    // Plugin native melapor immersive dimatikan di luar kendali kita (mis.
    // custom view provider ditutup) → selaraskan state visual.
    if (active || !visualRef.current) return;
    visualRef.current = false;
    setVisualFullscreen(false);
    unlockOrientation();
  }), [unlockOrientation]);

  useEffect(() => {
    const w = window as unknown as { __nanimeExitFullscreen?: () => boolean };
    w.__nanimeExitFullscreen = () => {
      // Request yang masih berjalan juga bisa dibatalkan (mis. BACK Android
      // saat browser/WebView belum selesai memproses permintaan fullscreen).
      if (!isFullscreenRef.current && !pendingRef.current) return false;
      void exit();
      return true;
    };
    return () => {
      if (w.__nanimeExitFullscreen) delete w.__nanimeExitFullscreen;
      // Unmount/close: batalkan request basi, tutup fullscreen browser yang
      // masih aktif, dan pulihkan immersive + orientasi agar tidak terkunci.
      generationRef.current += 1;
      pendingRef.current = false;
      desiredRef.current = false;
      const stillFullscreen = document.fullscreenElement === targetRef.current;
      const wasFullscreen = visualRef.current || browserRef.current || stillFullscreen;
      visualRef.current = false;
      browserRef.current = false;
      if (stillFullscreen) void exitBrowserFullscreen();
      if (wasFullscreen) {
        applyNative(false);
        unlockOrientation();
      }
    };
  }, [applyNative, exit, targetRef, unlockOrientation]);

  return { isFullscreen, visualFullscreen, pending, enter, exit, toggle };
}
