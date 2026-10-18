import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getClient } from '../lib/supabase';
import { useAuth } from '../state/auth';

const HEARTBEAT_MS = 20_000;

function isForegroundActive(nativeActive: boolean): boolean {
  return nativeActive && document.visibilityState === 'visible' && document.hasFocus();
}

/** Trusted server-time app usage; this is intentionally independent of playback sessions. */
export function AppUsageTracker() {
  const userId = useAuth(state => state.user?.id);

  useEffect(() => {
    const client = getClient();
    if (!client || !userId) return;
    const nativeApp = Capacitor.isNativePlatform();
    let nativeActive = !nativeApp;
    let sessionId: string | null = null;
    let stopped = false;
    let appListener: Awaited<ReturnType<typeof App.addListener>> | null = null;
    let operations = Promise.resolve();
    const enqueue = (operation: () => Promise<void>) => {
      operations = operations.then(operation).catch(() => undefined);
    };
    const heartbeat = () => {
      if (!sessionId || stopped) return;
      const active = isForegroundActive(nativeActive);
      enqueue(async () => {
        if (!sessionId || stopped) return;
        await client.rpc('record_app_usage_heartbeat', { p_session_id: sessionId, p_active: active });
      });
    };
    const start = async () => {
      if (nativeApp) {
        try { nativeActive = (await App.getState()).isActive; } catch { nativeActive = false; }
      }
      const { data, error } = await client.rpc('start_app_usage_session', { p_active: isForegroundActive(nativeActive) });
      if (error || !data) return;
      sessionId = String(data);
      if (stopped) {
        await client.rpc('end_app_usage_session', { p_session_id: sessionId });
        return;
      }
      heartbeat();
    };
    const onActivityState = () => heartbeat();
    if (nativeApp) {
      void App.addListener('appStateChange', state => {
        nativeActive = state.isActive;
        heartbeat();
      }).then(listener => {
        appListener = listener;
        if (stopped) void listener.remove();
      }).catch(() => { nativeActive = false; });
    }
    void start().catch(() => undefined);
    const timer = window.setInterval(heartbeat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onActivityState);
    window.addEventListener('focus', onActivityState);
    window.addEventListener('blur', onActivityState);
    window.addEventListener('pagehide', onActivityState);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onActivityState);
      window.removeEventListener('focus', onActivityState);
      window.removeEventListener('blur', onActivityState);
      window.removeEventListener('pagehide', onActivityState);
      if (appListener) void appListener.remove();
      void operations.finally(async () => {
        if (sessionId) {
          await client.rpc('record_app_usage_heartbeat', { p_session_id: sessionId, p_active: isForegroundActive(nativeActive) });
          await client.rpc('end_app_usage_session', { p_session_id: sessionId });
        }
      }).catch(() => undefined);
    };
  }, [userId]);

  return null;
}
