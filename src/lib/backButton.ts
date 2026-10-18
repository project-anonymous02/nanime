/**
 * Tombol back hardware Android (`backButton`).
 * Di dalam aplikasi: navigasi riwayat. Di layar paling awal:
 * keluar aplikasi. Pola binding sama dengan `bindNativeDeepLink` (aman di web).
 */
export function bindNativeBackButton(): () => void {
  let disposed = false;
  let handle: { remove: () => void } | null = null;

  void import('@capacitor/app')
    .then(mod => {
      if (disposed) return;
      void mod.App.addListener('backButton', () => {
        const path = window.location.hash.replace(/^#/, '') || '/';

        // Layar paling awal (onboarding/beranda tanpa riwayat): keluar.
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
