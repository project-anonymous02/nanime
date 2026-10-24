// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommunityAvatar } from '../src/ui/CommunityAvatar';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe('community avatars', () => {
  it('renders a provided avatar over a stable initial placeholder', async () => {
    await act(async () => root.render(createElement(CommunityAvatar, { name: 'Aiko', src: 'https://images.test/aiko.jpg' })));
    expect(host.querySelector('.hn-avatar')?.textContent).toContain('A');
    expect(host.querySelector<HTMLImageElement>('img')?.src).toBe('https://images.test/aiko.jpg');
  });
  it('falls back to the initial if the profile photo fails to load', async () => {
    await act(async () => root.render(createElement(CommunityAvatar, { name: 'Mina', src: 'https://images.test/broken.jpg' })));
    await act(async () => host.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(host.querySelector('.hn-avatar')?.textContent).toBe('M');
    expect(host.querySelector('img')).toBeNull();
  });
});
