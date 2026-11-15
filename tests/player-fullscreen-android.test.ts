// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const NATIVE_DIR = 'native/android/com/nanime/app';
const PLUGIN = `${NATIVE_DIR}/FullscreenPlugin.java`;
const CHROME_CLIENT = `${NATIVE_DIR}/NanimeWebChromeClient.java`;
const ACTIVITY = `${NATIVE_DIR}/MainActivity.java`;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Ekstrak isi method Java (sampai kurung kurung penutup sejajar). */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`method tidak ditemukan: ${signature}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`method tidak seimbang: ${signature}`);
}

describe('native android fullscreen contract', () => {
  it('documents the upstream Capacitor behaviour that breaks page fullscreen', () => {
    const capacitor = read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java');
    // Root cause: Capacitor membuang setiap permintaan fullscreen halaman.
    const show = methodBody(capacitor, 'public void onShowCustomView(View view, CustomViewCallback callback)');
    expect(show).toContain('callback.onCustomViewHidden()');
    // Dan tidak memasang custom view sama sekali.
    expect(show).not.toContain('addView');
  });

  it('installs a WebChromeClient that really shows the custom view', () => {
    const source = read(CHROME_CLIENT);
    const show = methodBody(source, 'public void onShowCustomView(View view, CustomViewCallback callback)');
    const hide = methodBody(source, 'public void onHideCustomView()');

    // Custom view benar-benar dipasang dan dilepas.
    expect(show).toContain('root.addView');
    expect(show).toContain('setVisibility(View.GONE)');
    expect(hide).toContain('root.removeView(view)');
    expect(hide).toContain('setVisibility(View.VISIBLE)');

    // Permintaan kedua ditolak (tidak ada dua custom view bertumpuk) dan
    // callback dibalas agar halaman tahu permintaannya ditolak.
    expect(show).toContain('customView != null');
    expect(show).toContain('callback.onCustomViewHidden()');
    expect(hide).toContain('callback.onCustomViewHidden()');
  });

  it('releases the custom view when the activity is destroyed', () => {
    const source = read(CHROME_CLIENT);
    const release = methodBody(source, 'public void release()');
    expect(release).toContain('root.removeView(view)');
    expect(release).toContain('setVisibility(View.VISIBLE)');
    expect(release).toContain('FullscreenPlugin.exitNativeFullscreen(activity)');
  });

  it('keeps immersive and orientation alive until every owner is done', () => {
    const source = read(PLUGIN);
    // Dua pemilik fullscreen native: fullscreen visual Nanime (JS) dan custom
    // view provider (iframe). Kunci orientasi/immersive hanya dilepas когда
    // keduanya selesai.
    expect(source).toContain('private boolean jsActive = false;');
    expect(source).toContain('private boolean customViewActive = false;');
    expect(source).toContain('private boolean effectiveActive = false;');
    const effective = methodBody(source, 'private void applyEffectiveState(Activity activity)');
    expect(effective).toContain('wantsImmersive()');
    expect(effective).toContain('wantsOrientationLock()');
    // Event "changed" hanya dipancarkan saat status efektif berubah.
    expect(effective).toMatch(/if \(active == effectiveActive\) return;/);
    expect(effective).toContain('notifyFullscreenChanged(active)');
    const immersive = methodBody(source, 'private boolean wantsImmersive()');
    expect(immersive).toContain('jsActive || customViewActive');
    const orientation = methodBody(source, 'private boolean wantsOrientationLock()');
    expect(orientation).toContain('customViewActive');
    expect(orientation).toContain('jsActive && jsLandscape');
  });

  it('restores the window state when the plugin is destroyed', () => {
    const source = read(PLUGIN);
    const destroy = methodBody(source, 'protected void handleOnDestroy()');
    expect(destroy).toContain('applyWindowImmersive(activity, false)');
    expect(destroy).toContain('applyOrientationLock(activity, false)');
  });

  it('wires the chrome client and the native back handling in MainActivity', () => {
    const source = read(ACTIVITY);
    expect(source).toContain('setWebChromeClient(nanimeChromeClient)');
    expect(source).toContain('registerPlugin(FullscreenPlugin.class)');
    // Tombol BACK menutup custom view provider lebih dulu.
    expect(source).toContain('OnBackPressedCallback');
    expect(source).toContain('nanimeChromeClient.hideCustomView()');
    expect(source).toContain('customViewBackCallback.setEnabled(visible)');
    // Activity dihancurkan → custom view dilepas.
    expect(source).toContain('nanimeChromeClient.release()');
  });

  it('keeps the lifecycle modifiers compatible with the Capacitor activity', () => {
    const capacitor = read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java');
    const activity = read(ACTIVITY);
    // BridgeActivity.onDestroy() adalah public → override wajib public.
    // protected ditolak javac: "attempting to assign weaker access privileges".
    expect(capacitor).toMatch(/public void onDestroy\(\)/);
    expect(activity).toMatch(/public void onDestroy\(\)/);
    expect(activity).not.toMatch(/protected void onDestroy\(\)/);
    // onCreate tetap protected (sesuai BridgeActivity).
    expect(capacitor).toMatch(/protected void onCreate\(Bundle savedInstanceState\)/);
    expect(activity).toMatch(/protected void onCreate\(Bundle savedInstanceState\)/);
  });

  it('copies every native source file into the android project', () => {
    const script = read('scripts/setup-android-pip.sh');
    for (const file of ['MainActivity.java', 'FullscreenPlugin.java', 'NanimeWebChromeClient.java']) {
      expect(script).toContain(`cp "$SOURCE/${file}" "$TARGET/${file}"`);
    }
  });

  it('keeps the native and the shipped android sources in sync', () => {
    const shipped = 'android/app/src/main/java/com/nanime/app';
    // android/ adalah hasil `cap sync` (git-ignore) → hanya dicek bila ada.
    if (!existsSync(shipped)) return;
    for (const file of ['MainActivity.java', 'FullscreenPlugin.java', 'NanimeWebChromeClient.java']) {
      expect(read(`${shipped}/${file}`)).toBe(read(`${NATIVE_DIR}/${file}`));
    }
  });
});
