package com.nanime.app;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

/**
 * Fullscreen native Android: sembunyikan status/navigation bar + keep-screen-on.
 * Dipakai bersama Web Fullscreen API / CSS fallback di PlayerOverlay.
 * Capacitor 6.2.2 BridgeWebChromeClient tidak menangani onShowCustomView
 * (langsung callback.onCustomViewHidden), jadi WebView requestFullscreen()
 * tidak menghasilkan custom view native — plugin ini menutup celah itu.
 */
@CapacitorPlugin(name = "Fullscreen")
public class FullscreenPlugin extends Plugin {

    @PluginMethod
    public void setActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (window == null) {
                call.resolve();
                return;
            }
            if (active) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    window.getInsetsController().setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    window.getInsetsController().hide(
                        android.view.WindowInsets.Type.systemBars());
                } else {
                    @SuppressWarnings("deprecation")
                    View decor = window.getDecorView();
                    @SuppressWarnings("deprecation")
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
                    window.getInsetsController().show(
                        android.view.WindowInsets.Type.systemBars());
                } else {
                    @SuppressWarnings("deprecation")
                    View decor = window.getDecorView();
                    @SuppressWarnings("deprecation")
                    decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                }
            }
            call.resolve();
        });
    }
}
