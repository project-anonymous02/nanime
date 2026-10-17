import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Konfigurasi Capacitor untuk APK Android.
 * Tanpa `server.url` — aplikasi memuat aset lokal dari `dist/`,
 * jadi tidak ada base URL backend yang dikodekan.
 */
const config: CapacitorConfig = {
  appId: 'com.nanime.app',
  appName: 'Nanime',
  webDir: 'dist',
  backgroundColor: '#0E0F14',
  android: {
    allowMixedContent: false
  },
  server: {
    // Skema origin WebView normal ('https' = default Capacitor → https://localhost).
    // JANGAN gunakan skema kustom di sini: WebView akan menelan navigasi
    // nanime://auth-callback sehingga deep-link OAuth tidak sampai ke
    // intent-filter Android. Deep-link tetap memakai skema 'nanime' (lihat
    // scripts/setup-android-deeplink.sh yang menyuntikkannya ke AndroidManifest).
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
