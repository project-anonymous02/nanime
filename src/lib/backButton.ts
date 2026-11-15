/**
 * Tombol back hardware Android (`backButton`).
 * Prioritas: keluar fullscreen player → tutup overlay player bila
 * sesuai → navigasi riwayat → keluar aplikasi di layar paling awal.
 */
export function bindNativeBackButton(): () => void {
  let disposed = false;
  let handle: { remove: () => void } | null = null;

  void import('@capacitor/app')
    .then(mod => {
      if (disposed) return;
      void mod.App.addListener('backButton', () => {
        // 1. Keluar dari fullscreen player. PlayerOverlay yang memegang state
        //    penuh (Web Fullscreen API + fullscreen visual), termasuk restore
        //    orientasi dan system bar.
        const w = window as unknown as { __nanimeExitFullscreen?: () => boolean };
        if (w.__nanimeExitFullscreen?.()) return;
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
          return;
        }

        const path = window.location.hash.replace(/^#/, '') || '/';

        // 2. Layar paling awal (onboarding/beranda tanpa riwayat): keluar.
        if (path === '/' || path === '/home' || window.history.length <= 1) {
          void mod.App.exitApp();
          return;
        }

        window.history.back();
      })
        .then(h => {
          if (disposed) void h.remove();
          else handle = h as { remove: () => void };
        })
        .catch(() => {
          /* plugin tidak tersedia di web */
        });
    })
    .catch(() => {
      /* plugin tidak tersedia di web */
    });

  return () => {
    disposed = true;
    if (handle) void handle.remove();
    handle = null;
  };
}
