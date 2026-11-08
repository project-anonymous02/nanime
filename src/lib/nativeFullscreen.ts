import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface NativeFullscreenPlugin {
  setActive(options: { active: boolean }): Promise<{ active: boolean }>;
  addListener(eventName: 'changed', listener: (event: { active: boolean }) => void): Promise<PluginListenerHandle>;
}

const NativeFullscreen = registerPlugin<NativeFullscreenPlugin>('Fullscreen');

/** Mode fullscreen native Android: sembunyikan system bars + keep-screen-on. */
export function setNativeFullscreenActive(active: boolean): void {
  void NativeFullscreen.setActive({ active }).catch(() => {
    // Browser / WebView tanpa plugin native: biarkan Web Fullscreen API / CSS fallback.
  });
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
