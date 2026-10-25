import { describe, expect, it } from 'vitest';
import {
  allProviders,
  downloadProviders,
  orderedProviders,
  searchProviders,
  streamingPriority,
  streamingProviders
} from '../src/providers/registry';
import { isAdultContent, isAllowedInDiscovery } from '../src/core/services/ContentPolicy';
import { isProviderSearchAllowed } from '../src/core/services/ProviderAggregator';
import type { AnimeProvider } from '../src/providers/types';

type ContractProblem = { code: string; detail: string };

/**
 * Cross-check declarations against the registry APIs used by actual screens.
 * This deliberately centralizes invariants that were previously split between
 * provider flags, feed policy, search policy, and priority helpers.
 */
function analyzeProviderContracts(providers: AnimeProvider[]): ContractProblem[] {
  const problems: ContractProblem[] = [];
  const ids = providers.map(provider => provider.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  duplicateIds.forEach(id => problems.push({ code: 'duplicate-id', detail: id }));

  for (const provider of providers) {
    if (!provider.id.trim()) problems.push({ code: 'empty-id', detail: provider.name });
    if (!Number.isFinite(provider.priority)) problems.push({ code: 'invalid-priority', detail: provider.id });
    if (!['anime', 'donghua', 'hentai', 'mixed'].includes(provider.content)) {
      problems.push({ code: 'missing-content-classification', detail: provider.id });
    }
    if (provider.active && provider.searchable && !searchProviders().some(item => item.id === provider.id)) {
      problems.push({ code: 'search-capability-not-registered', detail: provider.id });
    }
    if (provider.downloadOnly && streamingProviders().some(item => item.id === provider.id)) {
      problems.push({ code: 'download-only-in-stream-order', detail: provider.id });
    }
    if (provider.content !== 'hentai' && (provider.downloadOnly || provider.movieOnly || provider.downloads) && !downloadProviders().some(item => item.id === provider.id)) {
      problems.push({ code: 'download-capability-not-registered', detail: provider.id });
    }
    if (provider.content === 'hentai') {
      if (isProviderSearchAllowed(provider)) problems.push({ code: 'adult-search-default-enabled', detail: provider.id });
      if (!isProviderSearchAllowed(provider, [provider.id])) problems.push({ code: 'adult-search-opt-in-unavailable', detail: provider.id });
      if (isAllowedInDiscovery({ provider: provider.id }, provider.id)) problems.push({ code: 'adult-provider-in-discovery', detail: provider.id });
    }
  }

  const streams = streamingProviders();
  for (let i = 1; i < streams.length; i++) {
    if (streamingPriority(streams[i - 1].id) > streamingPriority(streams[i].id)) {
      problems.push({ code: 'stream-priority-inversion', detail: `${streams[i - 1].id} > ${streams[i].id}` });
    }
  }
  const downloadable = downloadProviders();
  if (downloadable.some(provider => provider.id === 'animeku')) {
    problems.push({ code: 'unverified-download-capability', detail: 'animeku' });
  }
  for (let i = 1; i < downloadable.length; i++) {
    if (downloadable[i - 1].priority > downloadable[i].priority) {
      problems.push({ code: 'download-priority-inversion', detail: `${downloadable[i - 1].id} > ${downloadable[i].id}` });
    }
  }

  return problems;
}

describe('provider and feature contradiction analyzer', () => {
  it('finds no contradictions across the registered provider contracts', () => {
    const problems = analyzeProviderContracts(allProviders());
    expect(problems, JSON.stringify(problems, null, 2)).toEqual([]);
  });

  it('detects a duplicate provider registration instead of silently merging identities', () => {
    const providers = allProviders();
    const problems = analyzeProviderContracts([...providers, providers[0]]);
    expect(problems).toContainEqual({ code: 'duplicate-id', detail: providers[0].id });
  });

  it('keeps hentai classification in opt-in search and out of discovery', () => {
    const adultProvider = allProviders().find(provider => provider.content === 'hentai');
    if (adultProvider) {
      expect(isProviderSearchAllowed(adultProvider)).toBe(false);
      expect(isProviderSearchAllowed(adultProvider, [adultProvider.id])).toBe(true);
      expect(isAdultContent({ provider: adultProvider.id })).toBe(true);
      expect(isAllowedInDiscovery({ provider: adultProvider.id }, adultProvider.id)).toBe(false);
    } else {
      // A blocked/unavailable adult source must not be represented by a fake adapter.
      expect(allProviders().some(provider => provider.id === 'nekopoi')).toBe(false);
    }
  });

  it('does not register an unavailable adult download provider', () => {
    const byId = new Map(allProviders().map(provider => [provider.id, provider]));
    expect(byId.has('nekopoi')).toBe(false);
    expect(streamingProviders().some(provider => provider.id === 'nekopoi')).toBe(false);
    expect(downloadProviders().some(provider => provider.id === 'nekopoi')).toBe(false);
  });

  it('honors an explicitly selected detail provider regardless of its default priority', () => {
    expect(orderedProviders('otakudesu')[0]?.id).toBe('otakudesu');
  });
});
