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
  }
};

export default config;
