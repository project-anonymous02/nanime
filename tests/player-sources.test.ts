import { describe, expect, it } from 'vitest';
import { playableSourcesFrom } from '../src/ui/PlayerOverlay';
import type { StreamBundle } from '../src/core/types';

describe('player stream rendering guards', () => {
  it('handles malformed or older cached source collections without crashing', () => {
    const stream = {
      qualities: { oldFormat: true },
      servers: [null, { url: 'https://embed.test/watch', label: 'Server A', providerRef: 'otakudesu' }]
    } as unknown as Partial<StreamBundle>;

    expect(playableSourcesFrom(stream)).toEqual([{
      label: 'Server A',
      provider: 'otakudesu',
      url: 'https://embed.test/watch',
      kind: 'embed'
    }]);
  });

  it('ignores unusable and duplicate URLs from provider data', () => {
    const stream = {
      qualities: [{ label: '720p', source: { url: 'https://embed.test/watch', providerRef: 'otakudesu', kind: 'embed' } }],
      servers: [{ url: 'https://embed.test/watch', label: 'Duplicate', providerRef: 'otakudesu' }, { url: 'javascript:alert(1)' }]
    } as unknown as Partial<StreamBundle>;

    expect(playableSourcesFrom(stream)).toEqual([{
      label: '720p',
      provider: 'otakudesu',
      url: 'https://embed.test/watch',
      kind: 'embed'
    }]);
  });
});
