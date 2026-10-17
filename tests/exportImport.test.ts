import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheManager } from '../src/core/services/CacheManager';

beforeEach(() => {
  CacheManager.clear();
});

describe('CacheManager — lapisan memori', () => {
  it('hit memori: fungsi hanya dijalankan sekali', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    expect(await CacheManager.get('t', 'k1', 60_000, fn)).toBe(42);
    expect(await CacheManager.get('t', 'k1', 60_000, fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('panggilan serentak berbagi satu eksekusi (inflight)', async () => {
    let calls = 0;
    const fn = () =>
      new Promise<number>(res => {
        calls++;
        setTimeout(() => res(7), 5);
      });
    const [a, b] = await Promise.all([
      CacheManager.get('t', 'k2', 60_000, fn),
      CacheManager.get('t', 'k2', 60_000, fn)
    ]);
    expect([a, b]).toEqual([7, 7]);
    expect(calls).toBe(1);
  });
});

describe('CacheManager — tahan gagal (mode luring)', () => {
  it('getOrStale mengembalikan salinan lama saat jaringan gagal', async () => {
    await CacheManager.get('t', 'k3', 1, async () => 'lama');
    await new Promise(r => setTimeout(r, 10));
    const res = await CacheManager.getOrStale('t', 'k3', 1, async () => {
      throw new Error('offline');
    });
    expect(res.stale).toBe(true);
    expect(res.data).toBe('lama');
  });

  it('getOrStale melempar bila tidak ada salinan sama sekali', async () => {
    await expect(
      CacheManager.getOrStale('t', 'k4', 1000, async () => {
        throw new Error('x');
      })
    ).rejects.toThrow('x');
  });
});

describe('CacheManager — manajemen', () => {
  it('sweep membuang entri kedaluwarsa', async () => {
    await CacheManager.get('t', 'k5', 1, async () => 'sementara');
    await new Promise(r => setTimeout(r, 10));
    expect(CacheManager.stats().entries).toBeGreaterThan(0);
    CacheManager.sweep();
    expect(CacheManager.stats().entries).toBe(0);
  });

  it('clear mengosongkan seluruh lapisan memori', async () => {
    await CacheManager.get('t', 'k6', 60_000, async () => 1);
    expect(CacheManager.stats().entries).toBeGreaterThan(0);
    CacheManager.clear();
    expect(CacheManager.stats()).toEqual({ entries: 0, bytes: 0 });
  });
});
