import { getProvider } from '../../providers/registry';

interface DiscoveryMetadata {
  provider?: string;
  genres?: string[];
  tags?: string[];
  contentRating?: string;
  classification?: string;
}

/** Providers or metadata that explicitly mark adult content are never part of discovery feeds. */
const ADULT_PROVIDER_IDS = new Set(['nekopoi', 'nekopoi-care', 'nekopoi_care']);
const ADULT_LABEL = /(?:\bhentai\b|\badult\b|\brx\b|18\s*\+)/i;

export function isAdultContent(card: DiscoveryMetadata): boolean {
  const providerId = String(card.provider || '').toLowerCase();
  if (ADULT_PROVIDER_IDS.has(providerId) || getProvider(providerId)?.content === 'hentai') return true;

  const labels = [card.contentRating, card.classification, ...(card.genres || []), ...(card.tags || [])];
  return labels.some(label => ADULT_LABEL.test(String(label || '')));
}

/** Discovery feeds are conservative: explicit adult source/category metadata is excluded. */
export function isAllowedInDiscovery(card: DiscoveryMetadata, providerId = card.provider): boolean {
  const provider = getProvider(String(providerId || '').toLowerCase());
  if (provider?.content === 'hentai' || ADULT_PROVIDER_IDS.has(String(providerId || '').toLowerCase())) return false;
  if (isAdultContent(card)) return false;
  if (provider?.content === 'mixed') {
    if (!(card.contentRating || card.classification || card.genres?.length || card.tags?.length)) return false;
  }
  return true;
}

export function filterDiscovery<T extends DiscoveryMetadata>(cards: T[], providerId?: string): T[] {
  return cards.filter(card => isAllowedInDiscovery(card, providerId || card.provider));
}
