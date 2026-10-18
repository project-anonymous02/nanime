// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ getClient: () => ({ rpc: mocks.rpc }), isConfigured: () => true }));
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
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'start_app_usage_session' ? 'usage-session-1' : null, error: null }));
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
    expect(mocks.rpc).toHaveBeenCalledWith('start_app_usage_session', { p_active: true });
    expect(mocks.rpc).toHaveBeenCalledWith('record_app_usage_heartbeat', { p_session_id: 'usage-session-1', p_active: true });

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('record_app_usage_heartbeat', { p_session_id: 'usage-session-1', p_active: false });

    await act(async () => root!.unmount());
    root = null;
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith('end_app_usage_session', { p_session_id: 'usage-session-1' });
    expect(mocks.rpc.mock.calls.some(([name]) => String(name).includes('watch'))).toBe(false);
  });
});
