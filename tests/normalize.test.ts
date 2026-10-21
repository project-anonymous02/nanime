import { describe, it, expect } from 'vitest';
import { normalizeCard, normalizeOtakudesuCard, isDownloadHost } from '../src/core/normalize';

describe('normalize', () => {
  it('kartu otakudesu ongoing memakai label Ep', () => {
    const c = normalizeOtakudesuCard({
      animeId: 'one-piece',
      title: 'One Piece',
      poster: 'https://img.test/op.jpg',
      episodes: '1122',
      latestReleaseDate: '2 jam lalu',
      score: '8.7'
    });
    expect(c).not.toBeNull();
    expect(c!.id).toBe('one-piece');
    expect(c!.provider).toBe('otakudesu');
    expect(c!.epLabel).toBe('Ep 1122');
    expect(c!.sub).toBe('2 jam lalu');
  });

  it('kartu otakudesu completed memakai label Eps', () => {
    const c = normalizeOtakudesuCard({ animeId: 'a', title: 'A', episodes: '12', lastReleaseDate: 'kemarin' });
    expect(c!.epLabel).toBe('12 Eps');
  });

  it('kartu otakudesu membuang kata "Episode" dari .epz', () => {
    const ongoing = normalizeOtakudesuCard({ animeId: 'b', title: 'B', episodes: ' Episode 2', latestReleaseDate: '12 Okt', releaseDay: 'Senin' });
    expect(ongoing!.epLabel).toBe('Ep 2');
    expect(ongoing!.sub).toBe('12 Okt');
    /* .epztipe di list ongoing adalah hari rilis, bukan rating/status. */
    expect(ongoing!.score).toBe('');
    expect(ongoing!.status).toBe('');

    const complete = normalizeOtakudesuCard({ animeId: 'c', title: 'C', episodes: '12 Episode', score: '7.65' });
    expect(complete!.epLabel).toBe('12 Eps');
    expect(complete!.score).toBe('7.65');
  });

  it('normalizeCard hanya menerima Otakudesu', () => {
    expect(normalizeCard({ animeId: 'x', title: 'X' }, 'otakudesu')!.provider).toBe('otakudesu');
    expect(normalizeCard({ animeId: 'x', title: 'X' }, 'unknown')).toBeNull();
  });

  it('isDownloadHost mengenali host file-sharing', () => {
    expect(isDownloadHost('https://drive.google.com/file/d/1')).toBe(true);
    expect(isDownloadHost('https://cdn.test/stream.mp4')).toBe(false);
  });
});
