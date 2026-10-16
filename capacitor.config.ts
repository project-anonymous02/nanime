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
  backgroundColor: '#05060A',
  android: {
    allowMixedContent: false
  },
  server: {
    // Skema khusus untuk deep-link OAuth (nanime://auth-callback).
    // Disuntik ke AndroidManifest oleh scripts/setup-android-deeplink.sh saat CI.
    androidScheme: 'nanime'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
