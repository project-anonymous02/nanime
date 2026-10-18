import { describe, it, expect } from 'vitest';
import { TitleIndex, titleKey, titleFromKey } from '../src/core/services/TitleIndex';

describe('titleKey — slug kanonik', () => {
  it('huruf kecil, tanda baca → tanda hubung, musim dipertahankan', () => {
    expect(titleKey('Bleach')).toBe('bleach');
    expect(titleKey('Jujutsu Kaisen Season 2')).toBe('jujutsu-kaisen-season-2');
    expect(titleKey('Fate/stay night & Zero')).toBe('fate-stay-night-and-zero');
    expect(titleKey('Kimi no Na wa: Your Name')).toBe('kimi-no-na-wa-your-name');
  });

  it('membuang apostrof, aksen, dan tanda seru', () => {
    expect(titleKey('Bocchi the Rock!')).toBe('bocchi-the-rock');
    expect(titleKey('Café Étoile')).toBe('cafe-etoile');
    expect(titleKey("Kaguya-sama wa Kokurasetai")).toBe('kaguya-sama-wa-kokurasetai');
  });

  it('membatasi panjang slug 80 karakter', () => {
    expect(titleKey('x'.repeat(120))).toHaveLength(80);
  });

  it('titleFromKey membalikkan slug menjadi query pencarian', () => {
    expect(titleFromKey('one-piece')).toBe('one piece');
    expect(titleFromKey('jujutsu-kaisen-season-2')).toBe('jujutsu kaisen season 2');
  });
});

describe('TitleIndex — peta kanonik → sumber', () => {
  it('upsert menggabungkan sumber lintas penyedia tanpa duplikat', async () => {
    await TitleIndex.upsert({
      id: 'bleach',
      title: 'Bleach',
      sources: [{ provider: 'a', id: 'b1', slug: 'bleach' }]
    });
    await TitleIndex.upsert({
      id: 'bleach',
      title: 'Bleach',
      sources: [
        { provider: 'a', id: 'b1-baru', slug: 'bleach' },
        { provider: 'b', id: 'b2', slug: 'bleach' }
      ]
    });
    const e = await TitleIndex.get('bleach');
    expect(e).not.toBeNull();
    expect(e!.sources.map(s => s.provider).sort()).toEqual(['a', 'b']);
    expect(e!.sources.find(s => s.provider === 'a')!.id).toBe('b1-baru');
  });

  it('upsert tanpa episode baru mempertahankan daftar episode lama', async () => {
    await TitleIndex.upsert({
      id: 'one-piece',
      title: 'One Piece',
      sources: [{ provider: 'a', id: 'o1', slug: 'one-piece', episodes: [{ num: '1', id: 'e1', slug: 'ep-1' }] }]
    });
    await TitleIndex.upsert({
      id: 'one-piece',
      title: 'One Piece',
      sources: [{ provider: 'a', id: 'o1-baru', slug: 'one-piece' }]
    });
    const e = await TitleIndex.get('one-piece');
    expect(e!.sources[0].episodes).toHaveLength(1);
  });

  it('upsert kosong tidak menghapus poster hasil pencarian', async () => {
    await TitleIndex.upsert({
      id: 'artwork-preserve',
      title: 'Artwork Preserve',
      poster: 'https://cdn.test/search.jpg',
      sources: [{ provider: 'a', id: 'a1', slug: 'artwork-preserve' }]
    });
    await TitleIndex.upsert({
      id: 'artwork-preserve',
      title: 'Artwork Preserve',
      poster: '',
      sources: [{ provider: 'a', id: 'a1', slug: 'artwork-preserve' }]
    });
    expect((await TitleIndex.get('artwork-preserve'))?.poster).toBe('https://cdn.test/search.jpg');
  });

  it('setEpisodes menempel ke penyedia yang tepat & aman untuk penyedia asing', async () => {
    await TitleIndex.upsert({
      id: 'naruto',
      title: 'Naruto',
      sources: [
        { provider: 'a', id: 'n1', slug: 'naruto' },
        { provider: 'b', id: 'n2', slug: 'naruto' }
      ]
    });
    await TitleIndex.setEpisodes('naruto', 'a', [{ num: '1', id: 'e1', slug: 'ep-1' }]);
    await TitleIndex.setEpisodes('naruto', 'zz', [{ num: '9', id: 'e9', slug: 'ep-9' }]);
    const e = await TitleIndex.get('naruto');
    expect(e!.sources.find(s => s.provider === 'a')!.episodes).toHaveLength(1);
    expect(e!.sources.find(s => s.provider === 'b')!.episodes).toBeUndefined();
  });

  it('get mengembalikan null untuk id tak dikenal', async () => {
    expect(await TitleIndex.get('tidak-ada')).toBeNull();
  });

  it('count & all mencerminkan entri yang dikenal', async () => {
    expect(TitleIndex.count()).toBeGreaterThan(0);
    const all = await TitleIndex.all();
    expect(all.length).toBe(TitleIndex.count());
  });
});
