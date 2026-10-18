import { describe, expect, it } from 'vitest';
import { formatWatchDuration } from '../src/lib/community';
import { rankFor } from '../src/lib/rank';

describe('watch ranking', () => {
  it('uses the complete duration format', () => {
    expect(formatWatchDuration(7200)).toBe('2 jam 0 menit 0 detik');
    expect(formatWatchDuration(4532)).toBe('1 jam 15 menit 32 detik');
  });
  it('keeps developer above duration tiers', () => {
    expect(rankFor(0, true)).toBe('developer');
    expect(rankFor(100000)).toBe('diamond');
  });
});
