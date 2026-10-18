package com.nanime.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native activity PiP gate controlled by the active Nanime media session. */
@CapacitorPlugin(name = "PictureInPicture")
public final class PictureInPicturePlugin extends Plugin {
    private static final String PREFS = "nanime_player";
    private static volatile PictureInPicturePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void notifyModeChanged(boolean active) {
        PictureInPicturePlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("active", active);
        plugin.notifyListeners("modeChanged", data);
    }

    @com.getcapacitor.annotation.PluginMethod
    public void setActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean("pip_active", active)
            .putString("title", call.getString("title", ""))
            .putString("episode", call.getString("episode", ""))
            .apply();
        JSObject result = new JSObject();
        result.put("active", active);
        call.resolve(result);
    }
}
