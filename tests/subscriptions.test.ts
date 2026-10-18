import { describe, expect, it } from 'vitest';
import { filterSubscribedUpdates, subscriptionUpdateId } from '../src/lib/subscriptions';
import type { AggregatedCard } from '../src/core/types';

const update = (canonicalId: string) => ({ canonicalId } as AggregatedCard);

describe('filterSubscribedUpdates', () => {
  it('includes only catalog releases whose anime is in the subscribed library', () => {
    const updates = [update('anime-a'), update('anime-b'), update('anime-c')];
    expect(filterSubscribedUpdates(updates, [{ id: 'anime-b' }, { id: 'anime-c' }]).map(row => row.canonicalId))
      .toEqual(['anime-b', 'anime-c']);
  });

  it('returns an empty feed when the user has no subscriptions', () => {
    expect(filterSubscribedUpdates([update('anime-a')], [])).toEqual([]);
  });

  it('keeps notification identity stable for one release and changes it for the next episode', () => {
    const episode12 = { canonicalId: 'anime-a', epLabel: 'Episode 12', sub: 'Latest' } as AggregatedCard;
    const sameEpisode = { ...episode12, title: 'Updated translated title' };
    const episode13 = { ...episode12, epLabel: 'Episode 13' };
    expect(subscriptionUpdateId(episode12)).toBe(subscriptionUpdateId(sameEpisode));
    expect(subscriptionUpdateId(episode12)).not.toBe(subscriptionUpdateId(episode13));
  });
});
