package com.nanime.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native Android screen brightness (Window override) untuk video player.
 *
 * Adaptasi perilaku JustPlayer BrightnessControl:
 * - level -1 → BRIGHTNESS_OVERRIDE_NONE (auto, mengikuti sistem).
 * - level 0..30 → WindowManager.LayoutParams.screenBrightness
 *   dengan kurva kuadratik d*d, d = 0.064 + 0.936/30 * level.
 *
 * Nilai terakhir disimpan di SharedPreferences "nanime_player"
 * (key "brightness_level") agar hidup selama sesi aplikasi; Web layer
 * bertanggung jawab memulihkan ke auto saat player ditutup.
 * Tanpa izin khusus: Window override tidak memerlukan permission runtime.
 */
@CapacitorPlugin(name = "Brightness")
public class BrightnessPlugin extends Plugin {
    private static final String PREFS = "nanime_player";
    private static final String KEY_LEVEL = "brightness_level";
    private static final int MAX_LEVEL = 30;

    @PluginMethod
    public void setBrightness(PluginCall call) {
        int level = call.getInt("level", -1);
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity tidak tersedia");
            return;
        }
        final int clamped = level < 0 ? -1 : Math.max(0, Math.min(MAX_LEVEL, level));
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (window == null) {
                call.reject("Window tidak tersedia");
                return;
            }
            WindowManager.LayoutParams lp = window.getAttributes();
            if (clamped < 0) {
                lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            } else {
                double d = 0.064 + 0.936 / (double) MAX_LEVEL * (double) clamped;
                float value = (float) (d * d);
                lp.screenBrightness = value;
            }
            window.setAttributes(lp);
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putInt(KEY_LEVEL, clamped).apply();
            call.resolve();
        });
    }

    @PluginMethod
    public void getBrightness(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity tidak tersedia");
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            int level = -1;
            if (window != null) {
                float brightness = window.getAttributes().screenBrightness;
                if (brightness >= 0 && brightness <= 1 && brightness != WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE) {
                    double d = Math.sqrt(brightness);
                    int mapped = (int) Math.round(((d - 0.064) / 0.936) * MAX_LEVEL);
                    level = Math.max(0, Math.min(MAX_LEVEL, mapped));
                } else {
                    SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                    level = prefs.getInt(KEY_LEVEL, -1);
                }
            }
            com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
            result.put("level", level);
            call.resolve(result);
        });
    }
}
