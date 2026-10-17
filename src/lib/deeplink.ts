/**
 * Deep-link native Android (`nanime://auth-callback`).
 * Menangkap URL saat aplikasi dingin (getLaunchUrl) maupun saat berjalan (appUrlOpen),
 * lalu menyerahkannya ke penukar kode OAuth.
 */
export function bindNativeDeepLink(onUrl: (url: string) => void): () => void {
  let disposed = false;
  let handle: { remove: () => void } | null = null;

  void import('@capacitor/app')
    .then(mod => {
      if (disposed) return;
      const App = mod.App;
      void App.getLaunchUrl()
        .then(res => {
          if (res && res.url) onUrl(res.url);
        })
        .catch(() => {
          /* plugin tidak tersedia di web */
        });
      void App.addListener('appUrlOpen', (data: { url?: string }) => {
        if (data && data.url) onUrl(data.url);
      })
        .then(h => {
          if (disposed) void h.remove();
          else handle = h as { remove: () => void };
        })
        .catch(() => {
          /* noop */
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
