// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  native: false,
  appStateListener: null as ((state: { isActive: boolean }) => void) | null,
  removeAppListener: vi.fn()
}));
const SESSION_ID = '00000000-0000-4000-8000-000000000001';
vi.mock('../src/lib/supabase', () => ({ getClient: () => ({ rpc: mocks.rpc }), isConfigured: () => true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock('@capacitor/app', () => ({ App: {
  getState: vi.fn(async () => ({ isActive: true })),
  addListener: vi.fn(async (_name: string, listener: (state: { isActive: boolean }) => void) => {
    mocks.appStateListener = listener;
    return { remove: mocks.removeAppListener };
  })
} }));
import { AppUsageTracker } from '../src/features/AppUsageTracker';
import { useAuth } from '../src/state/auth';

let root: Root | null;
let host: HTMLDivElement;
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'start_app_usage_session' ? SESSION_ID : null, error: null }));
  mocks.native = false;
  mocks.appStateListener = null;
  useAuth.setState({ ready: true, configured: true, signedIn: true, user: { id: 'user-1', email: 'private@example.test', name: 'Aiko', avatar: null } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  await flush();
  useAuth.setState({ ready: true, configured: false, signedIn: false, user: null });
  vi.useRealTimers(); vi.clearAllMocks(); host.remove();
});

describe('app usage tracking', () => {
  it('uses a separate server-timestamped app session, pauses in background, and ends it on teardown', async () => {
    await act(async () => root!.render(createElement(AppUsageTracker)));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('start_app_usage_session');
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_app_usage_heartbeat', expect.anything());

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('record_app_usage_heartbeat', { p_session_id: SESSION_ID });

    await act(async () => root!.unmount());
    root = null;
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('end_app_usage_session', { p_session_id: SESSION_ID });
    expect(mocks.rpc.mock.calls.some(([name]) => String(name).includes('watch'))).toBe(false);
  });

  it('pauses and resumes from native foreground lifecycle and removes its listener on logout', async () => {
    mocks.native = true;
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
    await act(async () => root!.render(createElement(AppUsageTracker)));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('start_app_usage_session');
    expect(mocks.appStateListener).not.toBeNull();

    await act(async () => mocks.appStateListener?.({ isActive: false }));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('record_app_usage_heartbeat', { p_session_id: SESSION_ID });

    await act(async () => mocks.appStateListener?.({ isActive: true }));
    await flush();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'start_app_usage_session')).toHaveLength(2);

    await act(async () => useAuth.setState({ ready: true, configured: true, signedIn: false, user: null }));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('end_app_usage_session', { p_session_id: SESSION_ID });
    expect(mocks.removeAppListener).toHaveBeenCalledOnce();
  });

  it('retries a failed heartbeat on the next bounded interval without starting another session', async () => {
    let heartbeatAttempts = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'start_app_usage_session') return { data: SESSION_ID, error: null };
      if (name === 'record_app_usage_heartbeat') {
        heartbeatAttempts++;
        if (heartbeatAttempts === 1) throw new Error('offline');
      }
      return { data: null, error: null };
    });
    await act(async () => root!.render(createElement(AppUsageTracker)));
    await flush();
    expect(heartbeatAttempts).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    await flush();
    expect(heartbeatAttempts).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    await flush();
    expect(heartbeatAttempts).toBe(2);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'start_app_usage_session')).toHaveLength(1);
  });

  it('retries session creation after an offline startup instead of silently stopping tracking', async () => {
    let starts = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'start_app_usage_session') {
        starts++;
        return starts === 1 ? { data: null, error: new Error('offline') } : { data: SESSION_ID, error: null };
      }
      return { data: null, error: null };
    });
    await act(async () => root!.render(createElement(AppUsageTracker)));
    await flush();
    expect(starts).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    await flush();
    expect(starts).toBe(2);
    expect(mocks.rpc).not.toHaveBeenCalledWith('start_app_usage_session', { p_active: true });
  });
});
