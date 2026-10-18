import { describe, expect, it } from 'vitest';
import { extractMediaCandidates, pickBestCandidate, resolveMediaUrl } from '../src/core/services/StreamExtractor';

describe('media URL resolution', () => {
  it('extracts only explicit MP4/HLS/DASH media candidates from a player document', () => {
    const html = '<iframe src="/embed/other"></iframe><source src="/media/episode.mpd"><script>file: "https://cdn.test/720p.m3u8?token=1"</script>';
    expect(extractMediaCandidates(html, 'https://player.test/watch/1')).toEqual([
      'https://player.test/media/episode.mpd',
      'https://cdn.test/720p.m3u8?token=1'
    ]);
    expect(pickBestCandidate(['https://cdn.test/480p.mp4', 'https://cdn.test/720p.mpd'])).toBe('https://cdn.test/720p.mpd');
  });

  it('accepts a direct manifest URL as media but keeps a missing source unavailable', async () => {
    await expect(resolveMediaUrl('https://cdn.test/master.m3u8')).resolves.toEqual({ url: 'https://cdn.test/master.m3u8', kind: 'file' });
    await expect(resolveMediaUrl('https://cdn.test/manifest.mpd')).resolves.toEqual({ url: 'https://cdn.test/manifest.mpd', kind: 'file' });
    await expect(resolveMediaUrl('')).resolves.toEqual({ url: '', kind: 'embed' });
    await expect(resolveMediaUrl('javascript:alert(1)')).resolves.toEqual({ url: '', kind: 'embed' });
  });
});
