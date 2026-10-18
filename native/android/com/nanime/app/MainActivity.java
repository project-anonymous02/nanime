package com.nanime.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;

/** Capacitor host with gated 16:9 system Picture-in-Picture for direct playback. */
public class MainActivity extends BridgeActivity {
    public MainActivity() {
        registerPlugin(PictureInPicturePlugin.class);
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || isFinishing() || isInPictureInPictureMode()) return;
        boolean active = getSharedPreferences("nanime_player", MODE_PRIVATE).getBoolean("pip_active", false);
        if (!active) return;
        try {
            PictureInPictureParams.Builder params = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setSeamlessResizeEnabled(true);
            enterPictureInPictureMode(params.build());
        } catch (RuntimeException ignored) {
            // Device policy or window state may reject PiP; normal playback remains available.
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPictureInPictureMode, newConfig);
        PictureInPicturePlugin.notifyModeChanged(inPictureInPictureMode);
    }
}
