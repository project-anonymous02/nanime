import { describe, it, expect } from 'vitest';
import { normMovieTitle, titleMatchScore } from '../src/core/movies';

describe('pencocokan judul movie', () => {
  it('membuang kata kunci batch/sub indo/tahun/movie', () => {
    expect(normMovieTitle('Naruto the Movie Batch (Subtitle Indonesia) 2004')).toBe('naruto the');
    expect(normMovieTitle('Your Name [Movie]')).toContain('your name');
  });

  it('judul identik mendapat skor 1', () => {
    expect(titleMatchScore('Suzume', 'Suzume')).toBe(1);
  });

  it('kata Batch/Movie dihapus sehingga judul tetap cocok', () => {
    expect(titleMatchScore('Cowboy Bebop Movie', 'Cowboy Bebop')).toBe(1);
    expect(titleMatchScore('Your Name [Movie]', 'Your name')).toBe(1);
  });

  it('judul berbeda total tidak cocok', () => {
    expect(titleMatchScore('Naruto', 'One Piece')).toBe(0);
    expect(titleMatchScore('', 'One Piece')).toBe(0);
  });
});
