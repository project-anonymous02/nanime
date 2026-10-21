import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(migrationsUrl).filter(name => /^\d+_.+\.sql$/.test(name)).sort();

describe('supabase migrations', () => {
  it('numbers migration files uniquely and keeps the avatar migration in the repo', () => {
    const numbers = files.map(name => name.slice(0, 3));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(files).toContain('015_avatar_visibility.sql');
  });

  it('backfills old avatars and exposes them through the public profile RPCs', () => {
    const sql = readFileSync(new URL('015_avatar_visibility.sql', migrationsUrl), 'utf8');
    expect(sql).toMatch(/update public\.profiles[\s\S]*raw_user_meta_data->>'picture'/);
    expect(sql).toMatch(/update public\.nanime_leaderboard/);
    expect(sql).toMatch(/create or replace function public\.get_public_profiles/);
    expect(sql).toMatch(/create or replace function public\.search_nanime_profiles/);
    expect(sql).toMatch(/grant execute on function public\.get_public_profiles\(uuid\[\]\) to anon, authenticated/);
    expect(sql).not.toMatch(/service_role/i);
  });
});
