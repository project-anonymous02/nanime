package com.nanime.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fullscreen native Android: sembunyikan status/navigation bar + keep-screen-on
 * + kunci orientasi landscape secara native (true landscape fullscreen).
 *
 * Dipakai bersama Web Fullscreen API / CSS fallback di PlayerOverlay.
 * WebView Android membuang permintaan fullscreen dari halaman kecuali
 * WebChromeClient mengimplementasikan onShowCustomView/onHideCustomView
 * (lihat NanimeWebChromeClient) — karena itu immersive + orientasi native
 * adalah sumber kebenaran di APK Android.
 *
 * Screen Orientation API (screen.orientation.lock) tidak diandalkan sebagai
 * satu-satunya mekanisme karena sering dibatasi WebView; orientasi native
 * via Activity.setRequestedOrientation() adalah sumber kebenaran untuk
 * APK Android. Web API tetap dicoba di sisi JS sebagai pelengkap.
 *
 * STATE MULTI-OWNER: fullscreen native bisa dimiliki lebih dari satu sumber
 * pada waktu yang sama —
 *   1. "js"          → fullscreen visual Nanime (tombol fullscreen Nanime).
 *   2. "customView"  → custom view native (video provider di dalam iframe).
 * Immersive + kunci orientasi hanya dilepas setelah SEMUA owner selesai, dan
 * event "changed" hanya dipancarkan ketika status efektif benar-benar berubah.
 * Tanpa ini, provider yang keluar dari fullscreen native akan mematikan
 * immersive + orientasi milik fullscreen visual Nanime yang masih aktif.
 */
@CapacitorPlugin(name = "Fullscreen")
public class FullscreenPlugin extends Plugin {

    private static volatile FullscreenPlugin instance;

    /** Fullscreen visual Nanime (diminta dari JS lewat setActive). */
    private boolean jsActive = false;
    /** Orientasi landscape yang diminta pemilik fullscreen visual. */
    private boolean jsLandscape = true;
    /** Fullscreen native custom view (video provider di dalam iframe). */
    private boolean customViewActive = false;
    /** Kunci orientasi eksplisit (setOrientationLock) di luar fullscreen. */
    private boolean orientationOverride = false;
    /** Status immersive efektif terakhir → "changed" hanya saat berubah. */
    private boolean effectiveActive = false;

    private int previousRequestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean landscapeLocked = false;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
            // Jangan biarkan immersive/orientasi terkunci saat activity hilang.
            Activity activity = getActivity();
            if (activity != null) {
                jsActive = false;
                customViewActive = false;
                effectiveActive = false;
                applyWindowImmersive(activity, false);
                applyOrientationLock(activity, false);
            }
        }
        super.handleOnDestroy();
    }

    public static void notifyFullscreenChanged(boolean active) {
        FullscreenPlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("active", active);
        plugin.notifyListeners("changed", data);
    }

    public static boolean isLandscapeLocked() {
        FullscreenPlugin plugin = instance;
        return plugin != null && plugin.landscapeLocked;
    }

    /**
     * Mode immersive pada window activity (system bars + keep-screen-on).
     * Dipisahkan agar bisa dipakai NanimeWebChromeClient (custom view native)
     * maupun plugin JS.
     */
    @SuppressWarnings("deprecation")
    public static void applyWindowImmersive(Activity activity, boolean active) {
        if (activity == null) return;
        Window window = activity.getWindow();
        if (window == null) return;
        if (active) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.getInsetsController().setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                window.getInsetsController().hide(WindowInsets.Type.systemBars());
            } else {
                View decor = window.getDecorView();
                decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            }
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.getInsetsController().show(WindowInsets.Type.systemBars());
            } else {
                window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        }
    }

    /** Custom view native (provider/iframe fullscreen) masuk: immersive + landscape. */
    public static void enterNativeFullscreen(Activity activity) {
        if (activity == null) return;
        FullscreenPlugin plugin = instance;
        if (plugin != null) {
            plugin.setCustomViewActive(activity, true);
            return;
        }
        // Plugin belum siap (bridge belum memuat plugin) → immersive minimal.
        activity.runOnUiThread(() -> applyWindowImmersive(activity, true));
        notifyFullscreenChanged(true);
    }

    /** Custom view native ditutup: kembalikan system bar + orientasi sebelumnya. */
    public static void exitNativeFullscreen(Activity activity) {
        if (activity == null) return;
        FullscreenPlugin plugin = instance;
        if (plugin != null) {
            plugin.setCustomViewActive(activity, false);
            return;
        }
        activity.runOnUiThread(() -> applyWindowImmersive(activity, false));
        notifyFullscreenChanged(false);
    }

    private void setCustomViewActive(Activity activity, boolean active) {
        activity.runOnUiThread(() -> {
            customViewActive = active;
            applyEffectiveState(activity);
        });
    }

    @PluginMethod
    public void setActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        boolean landscape = call.getBoolean("landscape", active);
        Activity activity = getActivity();
        if (activity == null) {
            JSObject empty = new JSObject();
            empty.put("active", active);
            call.resolve(empty);
            return;
        }
        activity.runOnUiThread(() -> {
            jsActive = active;
            jsLandscape = landscape;
            applyEffectiveState(activity);
            JSObject result = new JSObject();
            result.put("active", active);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void setOrientationLock(PluginCall call) {
        boolean lock = call.getBoolean("landscape", false);
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            orientationOverride = lock;
            applyOrientationLock(activity, wantsOrientationLock());
            JSObject result = new JSObject();
            result.put("active", landscapeLocked);
            call.resolve(result);
        });
    }

    /**
     * Terapkan status efektif (immersive + orientasi) dari seluruh owner.
     * Dipanggil di UI thread.
     */
    private void applyEffectiveState(Activity activity) {
        boolean active = wantsImmersive();
        applyWindowImmersive(activity, active);
        applyOrientationLock(activity, wantsOrientationLock());
        if (active == effectiveActive) return;
        effectiveActive = active;
        notifyFullscreenChanged(active);
    }

    private boolean wantsImmersive() {
        return jsActive || customViewActive;
    }

    private boolean wantsOrientationLock() {
        return orientationOverride || customViewActive || (jsActive && jsLandscape);
    }

    private void applyOrientationLock(Activity activity, boolean lock) {
        if (lock) {
            if (!landscapeLocked) {
                previousRequestedOrientation = activity.getRequestedOrientation();
            }
            landscapeLocked = true;
            activity.setRequestedOrientation(
                ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else {
            if (landscapeLocked) {
                activity.setRequestedOrientation(previousRequestedOrientation);
                landscapeLocked = false;
            }
        }
    }
}
