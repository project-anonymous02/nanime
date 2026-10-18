import type { FavAnime } from './remote/types';
import type { AggregatedCard } from '../core/types';

/** Only catalog releases belonging to the user's subscribed anime enter their update feed. */
export function filterSubscribedUpdates(items: AggregatedCard[], favorites: Pick<FavAnime, 'id'>[]): AggregatedCard[] {
  const subscribed = new Set(favorites.map(item => item.id));
  return items.filter(item => subscribed.has(item.canonicalId));
}

/** A fresh episode on a series already followed is still a new notification. */
export function subscriptionUpdateId(item: Pick<AggregatedCard, 'canonicalId' | 'epLabel' | 'sub'>): string {
  return `${item.canonicalId}|${String(item.epLabel || '').trim().toLowerCase()}|${String(item.sub || '').trim().toLowerCase()}`;
}
