// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePullToRefresh } from '../src/ui/hooks';
import { PullToRefreshIndicator } from '../src/ui/PullToRefresh';

let root: Root;
let host: HTMLDivElement;

function Harness({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const state = usePullToRefresh(onRefresh);
  return createElement('div', null,
    createElement(PullToRefreshIndicator, { state }),
    createElement('output', { 'data-testid': 'state' }, JSON.stringify({ pull: state.pull, armed: state.armed, refreshing: state.refreshing }))
  );
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend', y = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX: 0, clientY: y }]
  });
  window.dispatchEvent(event);
}

async function settle(ms = 30) {
  await act(async () => { await new Promise(resolve => window.setTimeout(resolve, ms)); });
}

const state = () => JSON.parse(host.querySelector('[data-testid="state"]')?.textContent || '{}');

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('pull to refresh', () => {
  it('shows the armed and refreshing indicator when the gesture passes the threshold', async () => {
    const onRefresh = vi.fn(async () => undefined);
    await act(async () => root.render(createElement(Harness, { onRefresh })));
    await act(async () => { touch('touchstart', 10); touch('touchmove', 210); });
    await settle();
    expect(state().armed).toBe(true);
    expect(host.textContent).toContain('Lepaskan untuk menyegarkan');
    await act(async () => { touch('touchend'); });
    await settle();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(state().refreshing).toBe(true);
    expect(host.textContent).toContain('Menyegarkan…');
    await settle(500);
    expect(state().refreshing).toBe(false);
  });

  it('does not refresh or show the armed state before the threshold', async () => {
    const onRefresh = vi.fn(async () => undefined);
    await act(async () => root.render(createElement(Harness, { onRefresh })));
    await act(async () => { touch('touchstart', 10); touch('touchmove', 120); });
    await settle();
    expect(state().armed).toBe(false);
    expect(host.textContent).not.toContain('Lepaskan untuk menyegarkan');
    await act(async () => { touch('touchend'); });
    await settle();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(state().refreshing).toBe(false);
  });
});
