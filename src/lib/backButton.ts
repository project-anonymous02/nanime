/**
 * Tombol back hardware Android (`backButton`).
 * Di dalam aplikasi: navigasi riwayat. Dari halaman tonton (`/watch`), kembali
 * ke halaman deskripsi animenya (via handler dari App). Di layar paling awal:
 * keluar aplikasi. Pola binding sama dengan `bindNativeDeepLink` (aman di web).
 */
export function bindNativeBackButton(onWatchBack: (animeId: string) => void): () => void {
  let disposed = false;
  let handle: { remove: () => void } | null = null;

  void import('@capacitor/app')
    .then(mod => {
      if (disposed) return;
      void mod.App.addListener('backButton', () => {
        const path = window.location.hash.replace(/^#/, '') || '/';

        // Halaman tonton: selalu kembali ke deskripsi animenya.
        const watch = /^\/watch\/([^/?#]+)/.exec(path);
        if (watch) {
          onWatchBack(decodeURIComponent(watch[1]));
          return;
        }

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
