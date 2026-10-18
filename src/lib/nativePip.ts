import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface NativePipPlugin {
  setActive(options: { active: boolean; title?: string; episode?: string }): Promise<{ active: boolean }>;
  addListener(eventName: 'modeChanged', listener: (event: { active: boolean }) => void): Promise<PluginListenerHandle>;
}

const NativePip = registerPlugin<NativePipPlugin>('PictureInPicture');

/** Enable Android system PiP only while a direct-media video is actively owned by Nanime. */
export function setNativePipActive(active: boolean, title = '', episode = ''): void {
  void NativePip.setActive({ active, title, episode }).catch(() => {
    // Browser builds and devices without native PiP keep using the in-app mini player.
  });
}

export function listenNativePipMode(listener: (active: boolean) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let disposed = false;
  void NativePip.addListener('modeChanged', event => listener(!!event.active)).then(value => {
    if (disposed) void value.remove();
    else handle = value;
  }).catch(() => {
    // Native PiP events only exist in the Android package.
  });
  return () => { disposed = true; if (handle) void handle.remove(); };
}
