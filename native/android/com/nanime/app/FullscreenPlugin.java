package com.nanime.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.view.View;
import android.view.Window;
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
 * Capacitor 6.2.2 BridgeWebChromeClient tidak menangani onShowCustomView
 * (langsung callback.onCustomViewHidden), jadi WebView requestFullscreen()
 * tidak menghasilkan custom view native — plugin ini menutup celah itu.
 *
 * Screen Orientation API (screen.orientation.lock) tidak diandalkan sebagai
 * satu-satunya mekanisme karena sering dibatasi WebView; orientasi native
 * via Activity.setRequestedOrientation() adalah sumber kebenaran untuk
 * APK Android. Web API tetap dicoba di sisi JS sebagai pelengkap.
 */
@CapacitorPlugin(name = "Fullscreen")
public class FullscreenPlugin extends Plugin {

    private static volatile FullscreenPlugin instance;
    private int previousRequestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private boolean landscapeLocked = false;

    @Override
    public void load() {
        super.load();
        instance = this;
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

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void setActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        boolean landscape = call.getBoolean("landscape", active);
        applyFullscreen(active, landscape);
        JSObject result = new JSObject();
        result.put("active", active);
        call.resolve(result);
        notifyFullscreenChanged(active);
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
            applyOrientationLock(activity, lock);
            JSObject result = new JSObject();
            result.put("active", landscapeLocked);
            call.resolve(result);
        });
    }

    @SuppressWarnings("deprecation")
    private void applyFullscreen(boolean active, boolean landscape) {
        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (window == null) return;
            if (active) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (landscape) applyOrientationLock(activity, true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    window.getInsetsController().setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    window.getInsetsController().hide(
                        android.view.WindowInsets.Type.systemBars());
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
                applyOrientationLock(activity, false);
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    window.getInsetsController().show(
                        android.view.WindowInsets.Type.systemBars());
                } else {
                    View decor = window.getDecorView();
                    decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                }
            }
        });
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
