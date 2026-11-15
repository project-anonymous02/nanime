package com.nanime.app;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/** Capacitor host with gated 16:9 system Picture-in-Picture for direct playback. */
public class MainActivity extends BridgeActivity {
    private NanimeWebChromeClient nanimeChromeClient;
    private OnBackPressedCallback customViewBackCallback;

    public MainActivity() {
        registerPlugin(PictureInPicturePlugin.class);
        registerPlugin(FullscreenPlugin.class);
        registerPlugin(BrightnessPlugin.class);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // BACK saat custom view provider (video fullscreen di dalam iframe)
        // sedang tampil → tutup custom view dulu, bukan navigasi JS.
        // Callback ini didaftarkan setelah plugin Capacitor (App) sehingga
        // diprioritaskan selama custom view aktif.
        customViewBackCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (nanimeChromeClient != null) nanimeChromeClient.hideCustomView();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, customViewBackCallback);

        // BridgeWebChromeClient Capacitor membuang setiap permintaan fullscreen
        // (onShowCustomView → onCustomViewHidden). Ganti dengan implementasi
        // Nanime agar fullscreen provider di dalam iframe benar-benar bekerja.
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            nanimeChromeClient = new NanimeWebChromeClient(bridge);
            nanimeChromeClient.setCustomViewStateListener(visible -> {
                if (customViewBackCallback != null) customViewBackCallback.setEnabled(visible);
            });
            bridge.getWebView().setWebChromeClient(nanimeChromeClient);
        }
    }

    @Override
    public void onDestroy() {
        // BridgeActivity.onDestroy() bersifat public → override harus public
        // (protected akan ditolak javac: "attempting to assign weaker access
        // privileges").
        // Lepas custom view sebelum bridge dihancurkan supaya WebView kembali
        // terlihat dan immersive/orientasi dipulihkan oleh plugin native.
        if (nanimeChromeClient != null) {
            nanimeChromeClient.release();
            nanimeChromeClient = null;
        }
        if (customViewBackCallback != null) {
            customViewBackCallback.setEnabled(false);
            customViewBackCallback = null;
        }
        super.onDestroy();
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
