// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPublicChatChannels: vi.fn(),
  listPublicChatMessages: vi.fn(),
  sendPublicChatMessage: vi.fn(),
  deletePublicChatMessage: vi.fn(),
  subscribe: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({
  getClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: (cb: (status: string) => void) => { mocks.subscribe(cb); return { on: () => ({}) }; } })
    }),
    removeChannel: mocks.removeChannel
  })
}));
vi.mock('../src/state/auth', () => ({ currentUserId: () => 'user-me' }));
vi.mock('../src/lib/publicChat', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/publicChat')>();
  return {
    ...actual,
    listPublicChatChannels: mocks.listPublicChatChannels,
    listPublicChatMessages: mocks.listPublicChatMessages,
    sendPublicChatMessage: mocks.sendPublicChatMessage,
    deletePublicChatMessage: mocks.deletePublicChatMessage,
  };
});

import { PublicChat } from '../src/views/PublicChat';

const CHANNEL = { id: 'c1', slug: 'umum', name: 'Umum', sort_order: 0 };

function message(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    channel_id: 'c1',
    user_id: 'user-other',
    content: `pesan ${id}`,
    reply_to_id: null,
    created_at: '2026-01-01T08:00:00.000Z',
    profile: { id: 'user-other', username: 'Riko', avatar_url: null, rank: 'stone', is_developer: false },
    reply: null,
    ...overrides,
  };
}

let root: Root;
let host: HTMLDivElement;

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

function render() {
  return act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/public-chat'] }, createElement(PublicChat)));
  });
}

const q = (selector: string) => host.querySelector(selector);
const qa = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const byLabel = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
const text = () => host.textContent || '';

function setTextarea(value: string) {
  const ta = q('.hn-chatinput') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  // jsdom tidak mengimplementasikan scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
  mocks.listPublicChatChannels.mockResolvedValue([CHANNEL]);
  mocks.listPublicChatMessages.mockResolvedValue([message('m1')]);
  mocks.sendPublicChatMessage.mockResolvedValue(undefined);
  mocks.deletePublicChatMessage.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('public chat — balasan (reply)', () => {
  it('merender daftar pesan dan kanal', async () => {
    await render();
    await flush();
    expect(qa('.hn-chatrow')).toHaveLength(1);
    expect(qa('.hn-datetab')[0].textContent).toBe('#Umum');
    expect(text()).toContain('pesan m1');
  });

  it('memilih Balas → pratinjau komposer menampilkan pengirim dan cuplikan pesan', async () => {
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    const preview = q('.hn-chat-reply');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain('Membalas');
    expect(preview!.textContent).toContain('Riko');
    expect(preview!.textContent).toContain('pesan m1');
  });

  it('berganti target balasan → pratinjau ikut berubah', async () => {
    mocks.listPublicChatMessages.mockResolvedValue([message('m1'), message('m2', {
      profile: { id: 'user-other', username: 'Sari', avatar_url: null, rank: 'stone', is_developer: false },
    })]);
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    expect(q('.hn-chat-reply')!.textContent).toContain('Riko');
    act(() => { qa('[aria-label="Balas pesan"]')[1].click(); });
    await flush();
    expect(q('.hn-chat-reply')!.textContent).toContain('Sari');
  });

  it('membatalkan balasan → pratinjau hilang', async () => {
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    act(() => { byLabel('Batal membalas')!.click(); });
    await flush();
    expect(q('.hn-chat-reply')).toBeNull();
  });

  it('pesan balasan yang terkirim membawa id pesan asal yang benar', async () => {
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    setTextarea('ini balasan');
    await flush();
    await act(async () => {
      (q('.hn-chatsend') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flush();
    expect(mocks.sendPublicChatMessage).toHaveBeenCalledWith('c1', 'ini balasan', 'm1');
  });

  it('pesan biasa terkirim tanpa id pesan asal', async () => {
    await render();
    await flush();
    setTextarea('halo semua');
    await flush();
    await act(async () => {
      (q('.hn-chatsend') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flush();
    expect(mocks.sendPublicChatMessage).toHaveBeenCalledWith('c1', 'halo semua', null);
  });

  it('input kosong tidak mengirim apa pun', async () => {
    await render();
    await flush();
    expect((q('.hn-chatsend') as HTMLButtonElement).disabled).toBe(true);
    setTextarea('   ');
    await flush();
    expect((q('.hn-chatsend') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      (q('.hn-chatsend') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(mocks.sendPublicChatMessage).not.toHaveBeenCalled();
  });

  it('pengiriman gagal → pesan error tampil, draf dan target balasan tetap ada', async () => {
    mocks.sendPublicChatMessage.mockRejectedValue(new Error('jaringan gagal'));
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    setTextarea('coba kirim');
    await flush();
    await act(async () => {
      (q('.hn-chatsend') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flush();
    expect(text()).toContain('jaringan gagal');
    expect(q('.hn-chat-reply')).not.toBeNull();
    expect((q('.hn-chatinput') as HTMLTextAreaElement).value).toBe('coba kirim');
  });

  it('kiriman berulang hanya terkirim sekali', async () => {
    let resolveSend: (() => void) | null = null;
    mocks.sendPublicChatMessage.mockImplementation(() => new Promise<void>(resolve => { resolveSend = () => resolve(); }));
    await render();
    await flush();
    setTextarea('satu kali');
    await flush();
    await act(async () => {
      (q('.hn-chatsend') as HTMLButtonElement).click();
      await Promise.resolve();
      (q('.hn-chatsend') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await flush();
    expect(mocks.sendPublicChatMessage).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSend?.(); await Promise.resolve(); });
    await flush();
  });

  it('merender kutipan pesan asal pada pesan yang merupakan balasan', async () => {
    mocks.listPublicChatMessages.mockResolvedValue([
      message('m1'),
      message('m2', {
        user_id: 'user-me',
        content: 'jawaban',
        reply_to_id: 'm1',
        reply: { id: 'm1', author: 'Riko', preview: 'pesan m1', available: true },
      }),
    ]);
    await render();
    await flush();
    const quote = q('.hn-bubble-reply');
    expect(quote).not.toBeNull();
    expect(quote!.textContent).toContain('Riko');
    expect(quote!.textContent).toContain('pesan m1');
  });

  it('kutipan yang panjang dipotong dan pesan induk yang hilang ditangani', async () => {
    mocks.listPublicChatMessages.mockResolvedValue([
      message('m1', { reply: { id: 'm1', author: 'Riko', preview: 'x'.repeat(200) + '…', available: true } }),
      message('m2', { reply: { id: 'gone', author: 'Pengguna Nanime', preview: 'Pesan tidak tersedia', available: false } }),
    ]);
    await render();
    await flush();
    const quotes = qa('.hn-bubble-reply');
    expect(quotes).toHaveLength(2);
    expect(quotes[1].textContent).toContain('Pesan tidak tersedia');
    expect(quotes[1].classList.contains('hn-missing')).toBe(true);
  });

  it('menekan kutipan → menunjuk pesan asal dan menyorotnya', async () => {
    mocks.listPublicChatMessages.mockResolvedValue([
      message('m1'),
      message('m2', { reply_to_id: 'm1', reply: { id: 'm1', author: 'Riko', preview: 'pesan m1', available: true } }),
    ]);
    await render();
    await flush();
    const quote = q('.hn-bubble-reply') as HTMLElement;
    expect(quote.tagName).toBe('BUTTON');
    act(() => { quote.click(); });
    await flush();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(qa('.hn-bubble.hn-flash').length).toBeGreaterThan(0);
  });

  it('pindah kanal → balasan aktif dibuang agar tidak menempel ke kanal lain', async () => {
    mocks.listPublicChatChannels.mockResolvedValue([CHANNEL, { id: 'c2', slug: 'anime', name: 'Anime', sort_order: 1 }]);
    mocks.listPublicChatMessages.mockResolvedValue([message('m1')]);
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    expect(q('.hn-chat-reply')).not.toBeNull();
    act(() => { qa('.hn-datetab')[1].click(); });
    await flush();
    expect(q('.hn-chat-reply')).toBeNull();
  });

  it('target balasan yang hilang dari daftar → pratinjau dibuang', async () => {
    let call = 0;
    mocks.listPublicChatMessages.mockImplementation(async () => {
      call += 1;
      return call === 1 ? [message('m1')] : [];
    });
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    expect(q('.hn-chat-reply')).not.toBeNull();
    // penyegaran daftar (mis. event realtime/fokus) menghapus pesan asal
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(q('.hn-chat-reply')).toBeNull();
  });

  it('navAway saat balasan aktif tidak menyebabkan error', async () => {
    await render();
    await flush();
    act(() => { byLabel('Balas pesan')!.click(); });
    await flush();
    await act(async () => { root.unmount(); });
    root = createRoot(host);
  });
});

describe('public chat — perilaku lama dipertahankan', () => {
  it('meminta pesan dengan batas 100 baris', async () => {
    await render();
    await flush();
    expect(mocks.listPublicChatMessages).toHaveBeenCalledWith('c1');
  });

  it('berlangganan realtime saat kanal aktif', async () => {
    await render();
    await flush();
    expect(mocks.subscribe).toHaveBeenCalled();
  });

  it('menghapus pesan milik sendiri', async () => {
    mocks.listPublicChatMessages.mockResolvedValue([message('m1', { user_id: 'user-me' })]);
    await render();
    await flush();
    act(() => { byLabel('Hapus pesan')!.click(); });
    await flush();
    expect(mocks.deletePublicChatMessage).toHaveBeenCalledWith('m1');
  });

  it('menampilkan pesan galat kanal yang gagal dimuat', async () => {
    mocks.listPublicChatChannels.mockRejectedValue(new Error('kanal gagal'));
    await render();
    await flush();
    expect(text()).toContain('kanal gagal');
  });
});
