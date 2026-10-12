import { describe, it, expect } from 'vitest';
import { dayIndex } from '../src/core/api';
import { PROVIDERS, isMovieSource, searchLabel, TTL } from '../src/core/config';

describe('konfigurasi & jadwal', () => {
  it('dayIndex mengenali nama hari Indonesia & Inggris', () => {
    expect(dayIndex('Minggu')).toBe(0);
    expect(dayIndex('monday')).toBe(1);
    expect(dayIndex('Selasa')).toBe(2);
    expect(dayIndex('rabu')).toBe(3);
    expect(dayIndex('kamis')).toBe(4);
    expect(dayIndex('Jumat')).toBe(5);
    expect(dayIndex('friday')).toBe(5);
    expect(dayIndex('sabtu')).toBe(6);
    expect(dayIndex('tengah pekan')).toBe(-1);
  });

  it('provider utama aktif & kusonime ditandai movie', () => {
    expect(PROVIDERS.otakudesu.active).toBe(true);
    expect(PROVIDERS.oploverz.active).toBe(true);
    expect(PROVIDERS.kuramanime.active).toBe(true);
    expect(isMovieSource('kusonime')).toBe(true);
    expect(isMovieSource('otakudesu')).toBe(false);
    expect(searchLabel('kusonime')).toBe('Movie');
  });

  it('TTL punya nilai masuk akal', () => {
    expect(TTL.home).toBeGreaterThan(TTL.search);
    expect(TTL.episode).toBeGreaterThan(0);
    expect(TTL.genre).toBeGreaterThanOrEqual(TTL.detail);
  });
});
