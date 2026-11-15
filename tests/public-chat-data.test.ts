import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ getClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('../src/state/auth', () => ({ currentUserId: () => 'user-1' }));
import { listPublicChatChannels, listPublicChatMessages, replyPreviewText, sendPublicChatMessage } from '../src/lib/publicChat';

function chain(result: { data: unknown; error: unknown }) {
  const value: any = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'in']) value[method] = vi.fn(() => value);
  value.insert = vi.fn(async () => result);
  value.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return value;
}

/** Rantai query yang remembers argumen `.in()` supaya bisa diperiksa. */
function chainWithIn(result: { data: unknown; error: unknown }) {
  const value: any = {};
  const inArgs: [string, unknown[]][] = [];
  for (const method of ['select', 'eq', 'order', 'limit']) value[method] = vi.fn(() => value);
  value.in = vi.fn((col: string, ids: unknown[]) => { inArgs.push([col, ids]); return value; });
  value.insert = vi.fn(async () => result);
  value.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  (value as any).__inArgs = inArgs;
  return value;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('public chat data', () => {
  it('loads configured channels without inventing channels in the client', async () => {
    const query = chain({ data: [{ id: 'channel-1', slug: 'umum', name: 'Umum', sort_order: 0 }], error: null });
    mocks.from.mockReturnValue(query);
    expect(await listPublicChatChannels()).toEqual([{ id: 'channel-1', slug: 'umum', name: 'Umum', sort_order: 0 }]);
    expect(mocks.from).toHaveBeenCalledWith('nanime_public_chat_channels');
  });

  it('orders recent messages chronologically and attaches only public profile fields', async () => {
    const query = chain({ data: [
      { id: 'm2', channel_id: 'c1', user_id: 'user-2', content: 'B', reply_to_id: null, created_at: '2026-01-02' },
      { id: 'm1', channel_id: 'c1', user_id: 'user-1', content: 'A', reply_to_id: null, created_at: '2026-01-01' }
    ], error: null });
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockResolvedValue({ data: [{ id: 'user-1', username: 'Aiko', avatar_url: 'https://img.test/a.png', is_developer: true, rank: 'developer', email: 'private@example.test' }], error: null });
    const rows = await listPublicChatMessages('c1', 20);
    expect(rows.map(row => row.id)).toEqual(['m1', 'm2']);
    expect(rows[0].profile?.username).toBe('Aiko');
    expect(rows[0].profile?.rank).toBe('developer');
    expect(rows[0].profile).not.toHaveProperty('email');
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_profiles', { p_user_ids: ['user-1', 'user-2'] });
  });

  it('validates outbound text and sends under the current Supabase user', async () => {
    const query = chain({ data: null, error: null });
    mocks.from.mockReturnValue(query);
    await expect(sendPublicChatMessage('c1', '  halo  ', 'parent-1')).resolves.toBeUndefined();
    expect(query.insert).toHaveBeenCalledWith({ channel_id: 'c1', user_id: 'user-1', content: 'halo', reply_to_id: 'parent-1' });
    await expect(sendPublicChatMessage('c1', '  ')).rejects.toThrow('1–2000 karakter');
  });

  it('omits reply_to_id when the message is not a reply', async () => {
    const query = chain({ data: null, error: null });
    mocks.from.mockReturnValue(query);
    await sendPublicChatMessage('c1', 'halo');
    expect(query.insert).toHaveBeenCalledWith({ channel_id: 'c1', user_id: 'user-1', content: 'halo' });
  });

  it('resolves the quoted parent message (author + preview) for every reply', async () => {
    const page = chainWithIn({ data: [
      { id: 'm2', channel_id: 'c1', user_id: 'user-2', content: 'jawaban', reply_to_id: 'm1', created_at: '2026-01-02' }
    ], error: null });
    const parents = chainWithIn({ data: [
      { id: 'm1', channel_id: 'c1', user_id: 'user-3', content: 'pesan asli', created_at: '2026-01-01' }
    ], error: null });
    mocks.from.mockImplementation((table: string) => (table === 'nanime_public_chat_messages' ? page : page));
    mocks.from
      .mockReturnValueOnce(page)
      .mockReturnValueOnce(parents);
    mocks.rpc.mockResolvedValue({ data: [
      { id: 'user-2', username: 'Sari', avatar_url: null, is_developer: false, app_usage_seconds: 10 },
      { id: 'user-3', username: 'Riko', avatar_url: null, is_developer: false, app_usage_seconds: 10 }
    ], error: null });

    const rows = await listPublicChatMessages('c1', 20);
    expect(rows[0].reply).toEqual({ id: 'm1', author: 'Riko', preview: 'pesan asli', available: true });
    expect(parents.__inArgs).toEqual([['id', ['m1']]]);
    // profil Penulis pesan induk ikut diambil agar namanya bisa ditampilkan
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_profiles', { p_user_ids: ['user-2', 'user-3'] });
  });

  it('marks the quote as unavailable when the parent message is missing', async () => {
    const page = chainWithIn({ data: [
      { id: 'm2', channel_id: 'c1', user_id: 'user-2', content: 'jawaban', reply_to_id: 'gone', created_at: '2026-01-02' }
    ], error: null });
    const parents = chainWithIn({ data: [], error: null });
    mocks.from.mockReturnValueOnce(page).mockReturnValueOnce(parents);
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const rows = await listPublicChatMessages('c1', 20);
    expect(rows[0].reply).toEqual({ id: 'gone', author: 'Pengguna Nanime', preview: 'Pesan tidak tersedia', available: false });
  });

  it('never quotes a parent that belongs to another channel', async () => {
    const page = chainWithIn({ data: [
      { id: 'm2', channel_id: 'c1', user_id: 'user-2', content: 'jawaban', reply_to_id: 'm1', created_at: '2026-01-02' }
    ], error: null });
    const parents = chainWithIn({ data: [
      { id: 'm1', channel_id: 'other', user_id: 'user-3', content: 'rahasia kanal lain', created_at: '2026-01-01' }
    ], error: null });
    mocks.from.mockReturnValueOnce(page).mockReturnValueOnce(parents);
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const rows = await listPublicChatMessages('c1', 20);
    expect(rows[0].reply?.available).toBe(false);
    expect(rows[0].reply?.preview).not.toContain('rahasia');
  });

  it('leaves non-reply messages without any quote context', async () => {
    const page = chainWithIn({ data: [
      { id: 'm1', channel_id: 'c1', user_id: 'user-1', content: 'halo', reply_to_id: null, created_at: '2026-01-01' }
    ], error: null });
    mocks.from.mockReturnValueOnce(page);
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const rows = await listPublicChatMessages('c1', 20);
    expect(rows[0].reply).toBeNull();
  });
});

describe('reply preview text', () => {
  it('flattens whitespace and keeps short messages intact', () => {
    expect(replyPreviewText('halo\n  dunia')).toBe('halo dunia');
  });

  it('truncates long messages with an ellipsis', () => {
    const preview = replyPreviewText('x'.repeat(300));
    expect(preview.length).toBeLessThanOrEqual(91);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('describes an empty original message instead of rendering nothing', () => {
    expect(replyPreviewText('   ')).toBe('Pesan kosong');
  });
});
