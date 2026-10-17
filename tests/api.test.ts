import { describe, it, expect } from 'vitest';
import { dayIndex, timeToMinutes } from '../src/core/services/ProviderAggregator';
import { TTL } from '../src/core/services/CacheManager';
import { QUALITY_ORDER } from '../src/core/types';

describe('jadwal — indeks hari & jam tayang', () => {
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

  it('timeToMinutes membaca format jam yang umum', () => {
    expect(timeToMinutes('20:00')).toBe(1200);
    expect(timeToMinutes('19.30 WIB')).toBe(1170);
    expect(timeToMinutes('21')).toBe(1260);
    expect(timeToMinutes('-')).toBe(24 * 60 + 59);
  });
});

describe('TTL cache', () => {
  it('stream paling pendek, pencarian paling panjang (relatif)', () => {
    expect(TTL.stream).toBeLessThan(TTL.download);
    expect(TTL.download).toBeLessThan(TTL.detail);
    expect(TTL.detail).toBeLessThanOrEqual(TTL.search);
    expect(TTL.home).toBeLessThan(TTL.schedule);
    expect(TTL.stream).toBeGreaterThan(0);
  });
});

describe('urutan kualitas tetap', () => {
  it('selalu 1080p → 720p → 480p → 360p', () => {
    expect(QUALITY_ORDER).toEqual(['1080p', '720p', '480p', '360p']);
  });
});
