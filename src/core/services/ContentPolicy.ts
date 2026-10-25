import { getProvider } from '../../providers/registry';

interface DiscoveryMetadata {
  title?: string;
  alt?: string;
  altTitles?: string[];
  provider?: string;
  genres?: string[];
  tags?: string[];
  contentRating?: string;
  classification?: string;
}

/** Providers or metadata that explicitly mark adult content are never part of discovery feeds. */
const ADULT_LABEL = /(?:\bhentai\b|\badult\b|\brx\b|18\s*\+)/i;
const LEGACY_ADULT_PROVIDER_IDS = new Set(['nekopoi', 'nekopoi-care', 'nekopoi_care']);

export function isAdultContent(card: DiscoveryMetadata): boolean {
  const providerId = String(card.provider || '').toLowerCase();
  if (LEGACY_ADULT_PROVIDER_IDS.has(providerId) || getProvider(providerId)?.content === 'hentai') return true;

  const labels = [card.contentRating, card.classification, ...(card.genres || []), ...(card.tags || [])];
  if (labels.some(label => ADULT_LABEL.test(String(label || '')))) return true;
  // Titles are weaker evidence than provider classifications. Only treat an
  // explicit Hentai label in title/alternative title as conclusive.
  return [card.title, card.alt, ...(card.altTitles || [])].some(title => /(?:^|[[(])\s*hentai\s*(?:$|[\])])/i.test(String(title || '')));
}

/** Discovery feeds are conservative: explicit adult source/category metadata is excluded. */
export function isAllowedInDiscovery(card: DiscoveryMetadata, providerId = card.provider): boolean {
  const provider = getProvider(String(providerId || '').toLowerCase());
  if (provider?.content === 'hentai' || LEGACY_ADULT_PROVIDER_IDS.has(String(providerId || '').toLowerCase())) return false;
  if (isAdultContent(card)) return false;
  if (provider?.content === 'mixed') {
    if (!(card.contentRating || card.classification || card.genres?.length || card.tags?.length)) return false;
  }
  return true;
}

export function filterDiscovery<T extends DiscoveryMetadata>(cards: T[], providerId?: string): T[] {
  return cards.filter(card => isAllowedInDiscovery(card, providerId || card.provider));
}
