import { describe, expect, it } from 'vitest';
import { clockLabel, longDateLabel, shortDateLabel } from '../src/lib/format';

describe('format helpers', () => {
  it('clockLabel menghasilkan keluaran yang sama dengan toLocaleTimeString', () => {
    const iso = '2026-11-15T08:39:00.000Z';
    expect(clockLabel(iso)).toBe(new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  });

  it('longDateLabel menghasilkan keluaran yang sama dengan toLocaleDateString', () => {
    const iso = '2026-11-15T08:39:00.000Z';
    expect(longDateLabel(iso)).toBe(new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
  });

  it('shortDateLabel menghasilkan keluaran yang sama dengan toLocaleDateString', () => {
    const iso = '2026-11-15T08:39:00.000Z';
    expect(shortDateLabel(iso)).toBe(new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
  });

  it('nilai tidak valid menghasilkan string kosong, bukan "Invalid Date"', () => {
    expect(clockLabel('bukan tanggal')).toBe('');
    expect(longDateLabel('bukan tanggal')).toBe('');
    expect(shortDateLabel('bukan tanggal')).toBe('');
  });

  it('menerima Date dan milidetik', () => {
    const date = new Date('2026-01-02T03:04:00.000Z');
    expect(clockLabel(date)).toBe(new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    expect(clockLabel(date.getTime())).toBe(new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  });
});
