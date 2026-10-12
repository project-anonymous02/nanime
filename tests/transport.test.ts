import { describe, it, expect, beforeEach } from 'vitest';
import { candidates, currentBase, setBase } from '../src/core/transport';
import { API_CANDIDATES } from '../src/core/config';
import { Store } from '../src/core/store';

describe('transport — resolusi base URL tanpa konfigurasi', () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    Store.cfg.apiBase = { wajik: '', kusonime: '' };
  });

  it('same-origin didahulukan, lalu instance publik', () => {
    expect(candidates('wajik')).toEqual(API_CANDIDATES.wajik);
    expect(candidates('kusonime')).toEqual(API_CANDIDATES.kusonime);
  });

  it('pemenang tersimpan naik ke urutan pertama', () => {
    setBase('wajik', 'https://mirror.test');
    expect(currentBase('wajik')).toBe('https://mirror.test');
    expect(candidates('wajik')[0]).toBe('https://mirror.test');
    expect(candidates('wajik')).toContain('');
  });

  it('override manual mendahului semua kandidat', () => {
    setBase('wajik', 'https://mirror.test');
    Store.cfg.apiBase = { wajik: 'https://custom.test', kusonime: '' };
    const list = candidates('wajik');
    expect(list[0]).toBe('https://custom.test');
    expect(new Set(list).size).toBe(list.length);
  });
});
