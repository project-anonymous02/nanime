import { describe, it, expect } from 'vitest';
import {
  AUTO_LINK,
  cleanQuery,
  matchMeta,
  matchScore,
  pickBest,
  titleTokens,
  yearFromTitle,
  yearPenalty
} from '../src/metadata/match';
import type { MetaAnimeBrief } from '../src/core/types';

const brief = (title: string, extra: Partial<MetaAnimeBrief> = {}): MetaAnimeBrief => ({
  id: 1,
  source: 'anilist',
  title,
  ...extra
});

describe('normalisasi token judul (metadata/match)', () => {
  it('membuang penanda episode/download tapi mempertahankan musim', () => {
    expect(titleTokens('One Piece Episode 1180 Subtitle Indonesia')).toEqual(['one', 'piece']);
    expect(titleTokens('Jujutsu Kaisen Season 2 Episode 13 Sub Indo')).toEqual(['jujutsu', 'kaisen', 's2']);
  });

  it('kanonikasi berbagai gaya penulisan musim ke token tunggal', () => {
    expect(titleTokens('Jujutsu Kaisen 2nd Season')).toEqual(['jujutsu', 'kaisen', 's2']);
    expect(titleTokens('Jujutsu Kaisen S2')).toEqual(['jujutsu', 'kaisen', 's2']);
    expect(titleTokens('Kimetsu no Yaiba: Infinity Castle III')).toContain('s3');
  });

  it('partikel 1-huruf dibuang agar persis dengan gaya situs katalog', () => {
    expect(titleTokens('Spy x Family')).toEqual(['spy', 'family']);
    expect(titleTokens('SPY×FAMILY')).toEqual(['spy', 'family']);
  });
});

describe('skor kecocokan', () => {
  it('judul identik setelah dibersihkan = 1 dan auto-link', () => {
    const r = pickBest('One Piece Episode 1180 Subtitle Indonesia', [brief('ONE PIECE')]);
    expect(r?.score).toBe(1);
    expect(r?.auto).toBe(true);
  });

  it('musim sama dianggap identik (S2 provider = 2nd Season katalog)', () => {
    const r = pickBest('Jujutsu Kaisen Season 2 Episode 13 Subtitle Indonesia', [brief('Jujutsu Kaisen 2nd Season')]);
    expect(r?.score).toBe(1);
    expect(r?.auto).toBe(true);
  });

  it('musim berbeda TIDAK boleh auto-link (dibatasi zona saran)', () => {
    const r = pickBest('Tokyo Revengers', [brief('Tokyo Revengers Season 2')]);
    expect(r).not.toBeNull();
    expect(r!.auto).toBe(false);
    expect(r!.score).toBeLessThanOrEqual(0.7);
    expect(r!.score).toBeGreaterThanOrEqual(0.6);
  });

  it('judul sama sekali berbeda tidak dihubungkan (null)', () => {
    expect(pickBest('Naruto', [brief('One Piece')])).toBeNull();
    expect(pickBest('', [brief('One Piece')])).toBeNull();
    expect(pickBest('Naruto Shippuuden', [brief('One Piece Film Red')])).toBeNull();
  });

  it('kandidat seri turunan (Film Red) tidak auto-link dari judul seri induk', () => {
    const r = pickBest('One Piece', [brief('One Piece Film Red')]);
    if (r) expect(r.auto).toBe(false);
  });

  it('kandidat edisi khusus (Recap/OVA) tidak boleh auto-link', () => {
    const r = pickBest('Jujutsu Kaisen Season 2 Episode 13 Subtitle Indonesia', [
      brief('Jujutsu Kaisen 2nd Season Recap')
    ]);
    expect(r).not.toBeNull();
    expect(r!.auto).toBe(false);
  });

  it('cleanQuery membuang noise untuk dikirim ke mesin pencarian metadata', () => {
    expect(cleanQuery('Jujutsu Kaisen Season 2 Episode 13 Subtitle Indonesia')).toContain('season 2');
    expect(cleanQuery('One Piece Episode 1180 Subtitle Indonesia')).toBe('one piece');
  });

  it('alias/sinonim katalog ikut dihitung', () => {
    const r = matchScore('Shingeki no Kyojin', { title: 'Attack on Titan', synonyms: ['Shingeki no Kyojin'] });
    expect(r).toBe(1);
  });

  it('pickBest memilih skor tertinggi dari beberapa kandidat', () => {
    const r = pickBest('Bleach', [brief('Bleach: Thousand-Year Blood War'), brief('Bleach')]);
    expect(r?.meta.title).toBe('Bleach');
    expect(r?.score).toBe(1);
  });

  it('format movie mendapat bonus kecil', () => {
    const withFmt = pickBest('Suzume Movie', [brief('Suzume', { format: 'MOVIE' })]);
    const noFmt = pickBest('Suzume Movie', [brief('Suzume', { format: 'TV' })]);
    expect(withFmt!.score).toBeGreaterThan(noFmt!.score);
  });
});

describe('penalti tahun & matchMeta', () => {
  it('mengekstrak tahun dari judul provider', () => {
    expect(yearFromTitle('Your Name (2016)')).toBe(2016);
    expect(yearFromTitle('Bleach')).toBeUndefined();
  });

  it('penalti membesar seiring selisih tahun', () => {
    expect(yearPenalty(2020, 2020)).toBe(0);
    expect(yearPenalty(2020, 2021)).toBeLessThan(yearPenalty(2020, 2023));
    expect(yearPenalty(2020, 2030)).toBeGreaterThanOrEqual(0.35);
  });

  it('tahun jauh menurunkan skor sehingga tidak auto-link', () => {
    const r = matchMeta('Bleach (2004)', [brief('Bleach', { year: 2024 })]);
    expect(r).not.toBeNull();
    expect(r!.auto).toBe(false);
  });

  it('tahun sama tetap auto-link', () => {
    const r = matchMeta('Bleach (2004)', [brief('Bleach', { year: 2004 })]);
    expect(r!.auto).toBe(true);
  });

  it('keyakinan rendah mengembalikan null (tidak ada auto-link)', () => {
    expect(matchMeta('Kaguya-sama', [brief('Kaguya-sama: Love is War Ultra Romantic')])).toBeNull();
  });
});
