import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getClient } from '../lib/supabase';
import { useAuth } from '../state/auth';

const HEARTBEAT_MS = 20_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isForegroundActive(nativeActive: boolean, nativeApp: boolean): boolean {
  return nativeActive && document.visibilityState === 'visible' && (nativeApp || document.hasFocus());
}

/** Server-timed app usage; playback/watch sessions are tracked separately. */
export function AppUsageTracker() {
  const userId = useAuth(state => state.user?.id);

  useEffect(() => {
    const client = getClient();
    if (!client || !userId) return;

    const nativeApp = Capacitor.isNativePlatform();
    let nativeActive = !nativeApp;
    let trackingActive = false;
    let sessionId: string | null = null;
    let stopped = false;
    let appListener: Awaited<ReturnType<typeof App.addListener>> | null = null;
    let operations = Promise.resolve();

    const enqueue = (operation: () => Promise<void>) => {
      operations = operations.then(operation).catch(() => undefined);
    };

    const startSession = async () => {
      if (stopped || !trackingActive || sessionId) return;
      const { data, error } = await client.rpc('start_app_usage_session');
      if (error || typeof data !== 'string' || !UUID_PATTERN.test(data)) return;
      const startedId = data;
      if (stopped || !trackingActive) {
        await client.rpc('end_app_usage_session', { p_session_id: startedId });
        return;
      }
      sessionId = startedId;
    };

    const endSession = async () => {
      const endingId = sessionId;
      if (!endingId) return;
      // Account for the active interval up to the transition, then close the
      // server session so background time cannot accumulate.
      // The RPC requires p_active. Mark the interval inactive while recording
      // its final server-timed duration before closing the session.
      await client.rpc('record_app_usage_heartbeat', { p_session_id: endingId, p_active: false });
      await client.rpc('end_app_usage_session', { p_session_id: endingId });
      if (sessionId === endingId) sessionId = null;
    };

    const syncActivity = () => {
      if (stopped) return;
      const nextActive = isForegroundActive(nativeActive, nativeApp);
      if (nextActive === trackingActive) return;
      trackingActive = nextActive;
      if (nextActive) enqueue(startSession);
      else enqueue(endSession);
    };

    const onActivityState = () => syncActivity();
    if (nativeApp) {
      void App.addListener('appStateChange', state => {
        nativeActive = state.isActive;
        syncActivity();
      }).then(listener => {
        appListener = listener;
        if (stopped) void listener.remove();
      }).catch(() => { nativeActive = false; syncActivity(); });
      void App.getState().then(state => {
        nativeActive = state.isActive;
        syncActivity();
      }).catch(() => { nativeActive = false; syncActivity(); });
    } else {
      syncActivity();
    }

    const timer = window.setInterval(() => {
      if (!trackingActive || stopped) return;
      enqueue(async () => {
        if (sessionId) {
          await client.rpc('record_app_usage_heartbeat', { p_session_id: sessionId, p_active: true });
        } else {
          await startSession();
        }
      });
    }, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', onActivityState);
    window.addEventListener('focus', onActivityState);
    window.addEventListener('blur', onActivityState);
    window.addEventListener('pagehide', onActivityState);

    return () => {
      stopped = true;
      trackingActive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onActivityState);
      window.removeEventListener('focus', onActivityState);
      window.removeEventListener('blur', onActivityState);
      window.removeEventListener('pagehide', onActivityState);
      if (appListener) void appListener.remove();
      enqueue(endSession);
    };
  }, [userId]);

  return null;
}
