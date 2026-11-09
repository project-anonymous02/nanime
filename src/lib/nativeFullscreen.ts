import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface NativeFullscreenPlugin {
  setActive(options: { active: boolean; landscape?: boolean }): Promise<{ active: boolean }>;
  setOrientationLock(options: { landscape: boolean }): Promise<{ active: boolean }>;
  addListener(eventName: 'changed', listener: (event: { active: boolean }) => void): Promise<PluginListenerHandle>;
}

const NativeFullscreen = registerPlugin<NativeFullscreenPlugin>('Fullscreen');

/**
 * Mode fullscreen native Android: sembunyikan system bars + keep-screen-on
 * + kunci orientasi landscape native (Activity.setRequestedOrientation).
 * Ini sumber kebenaran orientasi di WebView; Screen Orientation API di JS
 * hanya pelengkap karena sering dibatasi.
 */
export function setNativeFullscreenActive(active: boolean, landscape = true): Promise<{ active: boolean } | null> {
  return NativeFullscreen.setActive({ active, landscape }).catch(() => {
    // Browser / WebView tanpa plugin native: biarkan Web Fullscreen API / CSS fallback.
    return null;
  });
}

export function setNativeOrientationLock(landscape: boolean): Promise<{ active: boolean } | null> {
  return NativeFullscreen.setOrientationLock({ landscape }).catch(() => null);
}

export function listenNativeFullscreen(listener: (active: boolean) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let disposed = false;
  void NativeFullscreen.addListener('changed', event => listener(!!event.active)).then(value => {
    if (disposed) void value.remove();
    else handle = value;
  }).catch(() => {
    // Hanya tersedia di paket Android.
  });
  return () => { disposed = true; if (handle) void handle.remove(); };
}
