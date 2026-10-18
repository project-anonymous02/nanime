import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: null as any, from: vi.fn(), upsert: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ getClient: () => mocks.client }));
import { profile } from '../src/lib/remote/profile';

function configureProfileRows(rows: Record<string, unknown>) {
  mocks.from.mockImplementation(() => {
    let key = '';
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn((column: string) => { key = column; return query; });
    query.maybeSingle = vi.fn(async () => rows[key] || { data: null, error: null });
    query.upsert = mocks.upsert;
    return query;
  });
  mocks.client = { from: mocks.from };
}

beforeEach(() => { vi.clearAllMocks(); mocks.upsert.mockResolvedValue({ error: null }); });

describe('remote profile schema compatibility', () => {
  it('reads and upserts the initial user_id/display_name profile shape', async () => {
    configureProfileRows({
      id: { data: null, error: { message: 'column profiles.id does not exist' } },
      user_id: { data: { user_id: 'u1', display_name: 'Aiko', avatar_url: 'https://img.test/a.jpg', email: 'private' }, error: null }
    });
    await expect(profile.pull('u1')).resolves.toEqual({ userId: 'u1', email: 'private', name: 'Aiko', avatar: 'https://img.test/a.jpg', updatedAt: 0 });
    await profile.upsert('u1', { email: 'private', name: 'New name', avatar: null });
    expect(mocks.upsert).toHaveBeenCalledWith({ user_id: 'u1', avatar_url: 'https://img.test/a.jpg', display_name: 'Aiko' }, { onConflict: 'user_id' });
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain('watch_seconds');
  });

  it('keeps the connected id/username shape and does not write trusted activity columns', async () => {
    configureProfileRows({ id: { data: { id: 'u1', username: 'Aiko', avatar_url: null }, error: null } });
    await profile.upsert('u1', { email: null, name: 'Aiko', avatar: 'https://img.test/a.jpg' });
    expect(mocks.upsert).toHaveBeenCalledWith({ id: 'u1', avatar_url: 'https://img.test/a.jpg', username: 'Aiko' }, { onConflict: 'id' });
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain('rank');
  });
});
