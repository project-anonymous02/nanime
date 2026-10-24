import { describe, expect, it } from 'vitest';
import { formatUsage, rankFor, RANK_TIERS, RANK_META } from '../src/lib/rank';

describe('usage ranking', () => {
  it('formats durations tersedia', () => {
    expect(formatUsage(7200)).toBe('2 jam 0 menit');
    expect(formatUsage(4532)).toBe('1 jam 15 menit');
    expect(formatUsage(590)).toBe('9 menit');
  });
  it('keeps developer above all tiers', () => {
    expect(rankFor(0, true)).toBe('developer');
  });
  it('scales pyramid 10 -> 17h with 14 tiers', () => {
    expect(RANK_TIERS).toHaveLength(14);
    expect(RANK_TIERS[0].minutes).toBe(10);
    expect(RANK_TIERS[RANK_TIERS.length - 1].minutes).toBe(1020);
    expect(rankFor(9 * 60)).toBe('stone');
    expect(rankFor(10 * 60)).toBe('stone');
    expect(rankFor(30 * 60)).toBe('bronze');
    expect(rankFor(60 * 60)).toBe('silver');
    expect(rankFor(100 * 60)).toBe('gold');
    expect(rankFor(150 * 60 + 1)).toBe('emerald');
    expect(rankFor(210 * 60 + 1)).toBe('diamond');
    expect(rankFor(450 * 60 + 1)).toBe('celestial');
    expect(rankFor(910 * 60 + 1)).toBe('eternal4');
    expect(rankFor(1020 * 60 + 1)).toBe('eternal5');
    expect(Object.keys(RANK_META)).toHaveLength(15);
  });
});
