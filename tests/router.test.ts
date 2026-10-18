import { describe, it, expect, vi, afterEach } from 'vitest';
import { detailPath, searchPath, shareOrCopy } from '../src/lib/nav';
import { extractAuthCode, extractAuthError } from '../src/state/auth';

describe('tautan rute kanonik', () => {
  it('detailPath memakai id kanonik ter-encode', () => {
    expect(detailPath('one-piece')).toBe('/detail/one-piece');
    expect(detailPath('one-piece', 'One Piece')).toBe('/detail/one-piece?title=One%20Piece');
    expect(detailPath('judul miring')).toBe('/detail/judul%20miring');
  });

  it('searchPath membentuk query pencarian', () => {
    expect(searchPath('jujutsu kaisen')).toBe('/search?q=jujutsu%20kaisen');
    expect(searchPath('')).toBe('/search?q=');
  });
});

describe('kode OAuth dari callback', () => {
  it('mengekstrak ?code= dari deep-link APK', () => {
    expect(extractAuthCode('nanime://auth-callback?code=abc')).toBe('abc');
  });

  it('mengekstrak ?code= dari URL web ber-hash', () => {
    expect(extractAuthCode('https://nanime.app/#/auth/callback?code=xyz')).toBe('xyz');
  });

  it('mengembalikan null bila tidak ada kode', () => {
    expect(extractAuthCode('nanime://auth-callback')).toBeNull();
  });

  it('mengekstrak pesan galat callback', () => {
    expect(extractAuthError('nanime://auth-callback?error_description=akses%20ditolak')).toBe('akses ditolak');
    expect(extractAuthError('nanime://auth-callback?code=abc')).toBeNull();
  });
});

describe('shareOrCopy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('memakai lembar berbagi sistem saat tersedia', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(await shareOrCopy('Satu', 'https://nanime.app/watch/a/1')).toBe(false);
    expect(share).toHaveBeenCalledOnce();
  });

  it('menyalin ke papan klip saat berbagi tidak tersedia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareOrCopy('Satu', 'https://nanime.app/watch/a/1')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://nanime.app/watch/a/1');
  });
});
