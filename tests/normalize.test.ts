import { describe, it, expect } from 'vitest';
import {
  normalizeCard,
  normalizeOtakudesuCard,
  normalizeOploverzCard,
  normalizeKuramanimeCard,
  normalizeKusonimeCard,
  parseKusonimeDownloads,
  isDownloadHost
} from '../src/core/normalize';

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

  it('kartu oploverz tidak menduplikasi status sebagai episode', () => {
    /* .epx di oploverz berisi status ("Ongoing"/"Completed"), bukan nomor episode. */
    const ongoing = normalizeOploverzCard({ href: 'https://oploverz.test/anime/x/', title: 'X', episode: 'Ongoing', type: 'TV' });
    expect(ongoing!.epLabel).toBe('');
    expect(ongoing!.status).toBe('Ongoing');
    expect(ongoing!.sub).toBe('');

    const movie = normalizeOploverzCard({ href: 'https://oploverz.test/anime/y/', title: 'Y', episode: 'Completed', type: 'Movie' });
    expect(movie!.epLabel).toBe('');
    expect(movie!.status).toBe('Completed');
    /* Nomor episode asli tetap dipakai bila ada. */
    const withEp = normalizeOploverzCard({ href: 'https://oploverz.test/anime/z/', title: 'Z', episodes: 'EP 12', episode: 'Ongoing' });
    expect(withEp!.epLabel).toBe('EP 12');
  });

  it('kartu oploverz mengambil slug dari href', () => {
    const c = normalizeOploverzCard({
      href: 'https://oploverz.test/anime/solo-leveling/?page=2',
      title: 'Solo Leveling',
      episode: 'EP 12',
      poster: 'https://img.test/sl.jpg'
    });
    expect(c!.provider).toBe('oploverz');
    expect(c!.id).toBe('solo-leveling');
    expect(c!.epLabel).toBe('EP 12');
  });

  it('kartu kuramanime mempertahankan slug', () => {
    const c = normalizeKuramanimeCard({ animeId: '9', title: 'X', animeSlug: 'x', episodes: '3', totalEpisodes: '12', quality: '720p' });
    expect(c!.slug).toBe('x');
    expect(c!.epLabel).toBe('3/12');
  });

  it('kartu kusonime wajib punya slug & judul', () => {
    expect(normalizeKusonimeCard({ url: 'https://kusonime.test/naruto-movie/' })).toBeNull();
    const c = normalizeKusonimeCard({ url: 'https://kusonime.test/naruto-movie/', title: 'Naruto the Movie', type: 'Movie' });
    expect(c!.id).toBe('naruto-movie');
    expect(c!.provider).toBe('kusonime');
    expect(c!.type).toBe('Movie');
  });

  it('normalizeCard meneruskan ke normalizer yang benar', () => {
    expect(normalizeCard({ animeId: 'x', title: 'X' }, 'otakudesu')!.provider).toBe('otakudesu');
    expect(normalizeCard({ animeId: 'x', title: 'X' }, 'unknown')).toBeNull();
  });

  it('parseKusonimeDownloads meratakan quality & membuang URL non-http', () => {
    const links = parseKusonimeDownloads([
      {
        title: 'Naruto',
        download_link: [
          { type: '480P', links: [{ name: 'Acefile', url: 'https://acefile.co/f/abc' }, { name: 'Rusak', url: 'javascript:alert(1)' }] },
          { type: '720P', links: [{ name: 'Mega', url: 'https://megaup.net/x' }] }
        ]
      }
    ]);
    expect(links).toHaveLength(2);
    expect(links[0].quality).toBe('480P');
    expect(links[1].quality).toBe('720P');
  });

  it('isDownloadHost mengenali host file-sharing', () => {
    expect(isDownloadHost('https://drive.google.com/file/d/1')).toBe(true);
    expect(isDownloadHost('https://cdn.test/stream.mp4')).toBe(false);
  });
});
