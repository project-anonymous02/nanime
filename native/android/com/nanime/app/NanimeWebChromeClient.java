package com.nanime.app;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * WebChromeClient Nanime.
 *
 * Mewaris seluruh perilaku Capacitor (permission camera/mic, file chooser,
 * dialog JS, console) tetapi mengimplementasikan onShowCustomView/onHideCustomView
 * dengan benar.
 *
 * Latar belakang: `BridgeWebChromeClient` (Capacitor 6.2.2) pada
 * `onShowCustomView()` langsung memanggil `callback.onCustomViewHidden()`.
 * Akibatnya permintaan fullscreen dari halaman (elemen Nanime maupun tombol
 * fullscreen provider di dalam iframe) dibuang seketika di Android WebView
 * dan `requestFullscreen()` menggantung tanpa resolve/reject.
 *
 * Di sini custom view benar-benar dipasang di atas WebView (immersive +
 * orientasi landscape) dan dilepas kembali saat provider/host menutupnya.
 */
public class NanimeWebChromeClient extends BridgeWebChromeClient {

    /** Status custom view native (true = sedang tampil). */
    public interface CustomViewStateListener {
        void onCustomViewStateChanged(boolean visible);
    }

    private final Bridge bridge;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private CustomViewStateListener stateListener;

    public NanimeWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    public void setCustomViewStateListener(CustomViewStateListener listener) {
        this.stateListener = listener;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        Activity activity = bridge.getActivity();
        // Permintaan kedua saat masih fullscreen → tolok yang baru agar tidak
        // ada dua custom view native bertumpuk. Activity yang sedang ditutup
        // juga tidak boleh menerima custom view (leak + state setengah jadi).
        if (activity == null || activity.isFinishing() || customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        ViewGroup root = activity.findViewById(android.R.id.content);
        if (root == null) {
            callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;
        bridge.getWebView().setVisibility(View.GONE);
        root.addView(
            view,
            new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );
        FullscreenPlugin.enterNativeFullscreen(activity);
        notifyState(true);
    }

    @Override
    public void onHideCustomView() {
        Activity activity = bridge.getActivity();
        View view = customView;
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customView = null;
        customViewCallback = null;
        if (view != null && activity != null) {
            ViewGroup root = activity.findViewById(android.R.id.content);
            if (root != null) root.removeView(view);
            bridge.getWebView().setVisibility(View.VISIBLE);
            FullscreenPlugin.exitNativeFullscreen(activity);
        }
        notifyState(false);
        if (callback != null) callback.onCustomViewHidden();
    }

    /**
     * Tutup custom view native (tombol BACK Android / activity dihancurkan).
     * Idempoten: aman dipanggil saat tidak ada custom view.
     */
    public void hideCustomView() {
        if (customView == null) return;
        onHideCustomView();
    }

    /**
     * Activity dihancurkan → lepas custom view + pulihkan WebView dan state
     * native (immersive/orientasi) supaya tidak tertinggal terkunci.
     */
    public void release() {
        if (customView == null) return;
        Activity activity = bridge.getActivity();
        View view = customView;
        customView = null;
        customViewCallback = null;
        if (activity != null) {
            ViewGroup root = activity.findViewById(android.R.id.content);
            if (root != null) root.removeView(view);
            bridge.getWebView().setVisibility(View.VISIBLE);
            FullscreenPlugin.exitNativeFullscreen(activity);
        }
        notifyState(false);
    }

    private void notifyState(boolean visible) {
        CustomViewStateListener listener = stateListener;
        if (listener != null) listener.onCustomViewStateChanged(visible);
    }
}
