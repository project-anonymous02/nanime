import { describe, it, expect } from 'vitest';
import { mergeCards, scoreCard } from '../src/core/services/SearchEngine';
import type { Card } from '../src/core/types';

const card = (over: Partial<Card> = {}): Card => ({
  id: 'x',
  provider: 'p',
  title: 'Anime',
  poster: '',
  score: '',
  type: '',
  status: '',
  epLabel: '',
  sub: '',
  sourceUrl: '',
  ...over
});

describe('scoreCard — skor kecocokan 0–1000', () => {
  it('judul persis = skor maksimum', () => {
    expect(scoreCard('Bleach', card({ title: 'Bleach' }))).toBe(1000);
  });

  it('sinonim judul mendapat skor sangat tinggi', () => {
    const s = scoreCard('Attack on Titan', card({ title: 'Shingeki no Kyojin' }));
    expect(s).toBeGreaterThanOrEqual(900);
  });

  it('bonus multipenyedia + ongoing + 1080p dijumlahkan', () => {
    const s = scoreCard('', card({ title: 'X', status: 'Ongoing', sub: '1080p BD' }), { providerCount: 4 });
    expect(s).toBe(150 + 80 + 50);
  });

  it('hanya ada di penyedia prioritas terakhir → penalti 200', () => {
    const full = scoreCard('Bleach', card({ title: 'Bleach Movie' }));
    const lowest = scoreCard('Bleach', card({ title: 'Bleach Movie' }), { providerCount: 1, lowestOnly: true });
    expect(full - lowest).toBe(200);
  });
});

describe('mergeCards — satu judul = satu kartu kanonik', () => {
  it('judul sama dari beberapa penyedia digabung, wakil = prioritas tertinggi', () => {
    const out = mergeCards(
      [
        card({ provider: 'ylnime', id: 'y1', title: 'Bleach' }),
        card({ provider: 'doronime', id: 'd1', title: 'Bleach' })
      ],
      { query: 'Bleach' }
    );
    expect(out).toHaveLength(1);
    expect(out[0].providerCount).toBe(2);
    expect(out[0].provider).toBe('doronime');
    expect(out[0].sources.map(s => s.provider)).toEqual(['doronime', 'ylnime']);
    expect(out[0].canonicalId).toBe('bleach');
    expect(out[0].score1000).toBe(1000);
  });

  it('sinonim judul ikut digabung', () => {
    const out = mergeCards([
      card({ provider: 'a', title: 'Attack on Titan' }),
      card({ provider: 'b', title: 'Shingeki no Kyojin' })
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].providerCount).toBe(2);
  });

  it('musim berbeda TIDAK digabung', () => {
    const out = mergeCards([
      card({ provider: 'a', title: 'Jujutsu Kaisen' }),
      card({ provider: 'b', title: 'Jujutsu Kaisen Season 2' })
    ]);
    expect(out).toHaveLength(2);
  });

  it('hasil diurutkan dari skor tertinggi', () => {
    const out = mergeCards(
      [
        card({ provider: 'a', title: 'Bleach: Thousand-Year Blood War' }),
        card({ provider: 'b', title: 'Bleach' })
      ],
      { query: 'Bleach' }
    );
    expect(out[0].title).toBe('Bleach');
    expect(out[0].score1000).toBeGreaterThan(out[1].score1000);
  });
});
