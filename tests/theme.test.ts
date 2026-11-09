import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useTheme, applyTheme, THEME_STORAGE_KEY } from '../src/state/theme';
import { contrastRatio, type RGB } from '../src/ui/liquid-glass/adaptive-color';

function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

beforeEach(() => {
  localStorage.clear();
  useTheme.setState({ theme: 'light' });
  try {
    document.documentElement.removeAttribute('data-theme');
  } catch {
    /* stub */
  }
});

describe('useTheme — light/dark terpusat', () => {
  it('default adalah light', () => {
    expect(useTheme.getState().theme).toBe('light');
  });

  it('setTheme(dark) mengubah state dan persist ke localStorage', () => {
    useTheme.getState().setTheme('dark');
    expect(useTheme.getState().theme).toBe('dark');
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    expect(raw).toContain('"dark"');
    const parsed = JSON.parse(raw || '{}') as { state?: { theme?: string } };
    expect(parsed.state?.theme).toBe('dark');
  });

  it('theme tersimpan setelah ganti ke terang', () => {
    useTheme.getState().setTheme('dark');
    useTheme.getState().setTheme('light');
    expect(useTheme.getState().theme).toBe('light');
    const parsed = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}') as {
      state?: { theme?: string };
    };
    expect(parsed.state?.theme).toBe('light');
  });

  it('toggleTheme membalik terang/gelap tanpa state ganda', () => {
    useTheme.getState().toggleTheme();
    expect(useTheme.getState().theme).toBe('dark');
    useTheme.getState().toggleTheme();
    expect(useTheme.getState().theme).toBe('light');
  });

  it('nilai tidak valid diabaikan', () => {
    useTheme.getState().setTheme('light');
    // @ts-expect-error sengaja menguji runtime guard
    useTheme.getState().setTheme('system');
    expect(useTheme.getState().theme).toBe('light');
  });

  it('applyTheme tidak melempar di environment stub', () => {
    expect(() => applyTheme('dark')).not.toThrow();
    expect(() => applyTheme('light')).not.toThrow();
  });
});

describe('theme integration — file audit', () => {
  it('index.html punya inline init sebelum React (anti-FOUC) dan meta', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('nanime.v2.theme');
    expect(html).toContain('meta[name="theme-color"]');
    expect(html).toContain('meta[name="color-scheme"]');
    // Script harus muncul sebelum /src/main.tsx (sebelum render pertama).
    expect(html.indexOf('nanime.v2.theme')).toBeLessThan(html.indexOf('/src/main.tsx'));
  });

  it('Settings punya section Tampilan dengan picker Terang/Gelap tersinkron', () => {
    const src = readFileSync(join(process.cwd(), 'src/views/Settings.tsx'), 'utf8');
    expect(src).toContain('useTheme');
    expect(src).toContain('Tampilan');
    expect(src).toContain('Terang');
    expect(src).toContain('Gelap');
    expect(src).toContain('hn-theme-picker');
    expect(src).toContain("theme === 'dark'");
    expect(src).toContain("theme === 'light'");
  });

  it('tokens.css punya dark semantik tanpa mengubah light', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(css).toContain('[data-theme=\'dark\']');
    expect(css).toContain('--bg: #000000');
    expect(css).toContain('--surface: #1C1C1E');
    expect(css).toContain('--hover: #2C2C2E');
    expect(css).toContain('--accent: #0A84FF');
    // Light ground tetap identik
    expect(css).toContain('--bg: #F2F2F7');
    expect(css).toContain('--surface: #ffffff');
    expect(css).toContain('--accent: #0071e3');
  });

  it('app.css mengaudit hardcoded tanpa !important global', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
    expect(css).toContain("[data-theme='dark'] .hn-chip.hn-active");
    expect(css).toContain('hn-theme-picker');
    // Transisi tema harus spesifik (background/color), bukan transition: all global.
    // (transition: all existing pada chip/hero-dot tidak diubah — bagian dari Light Mode.)
    expect(css).not.toMatch(/\*\s*\{[^}]*transition:\s*all/);
    expect(css).toContain('background-color 220ms ease');
  });

  it('portal Sheet tidak mengunci warna light (inherit data-theme)', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/Sheet.tsx'), 'utf8');
    expect(src).toContain('createPortal');
    expect(src).toContain('document.body');
    // Sheet harus memakai token, bukan warna statis
    expect(src).not.toMatch(/background:\s*['"]#fff/);
  });
});

describe('contrast — WCAG dark tokens', () => {
  it('teks utama gelap lulus AA normal (4.5:1)', () => {
    expect(contrastRatio(hexToRgb('#FFFFFF'), hexToRgb('#000000'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRgb('#AEAEB2'), hexToRgb('#000000'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRgb('#8E8E93'), hexToRgb('#000000'))).toBeGreaterThanOrEqual(4.5);
  });

  it('accent #0A84FF lulus AA normal sebagai teks di atas gelap', () => {
    expect(contrastRatio(hexToRgb('#0A84FF'), hexToRgb('#000000'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexToRgb('#0A84FF'), hexToRgb('#1C1C1E'))).toBeGreaterThanOrEqual(4.5);
  });

  it('putih di atas accent lulus UI 3:1 (tombol/bubble bold ≥14px)', () => {
    expect(contrastRatio(hexToRgb('#FFFFFF'), hexToRgb('#0A84FF'))).toBeGreaterThanOrEqual(3);
  });

  it('chip aktif dark (putih bg, hitam teks) lulus AA normal', () => {
    expect(contrastRatio(hexToRgb('#000000'), hexToRgb('#FFFFFF'))).toBeGreaterThanOrEqual(4.5);
  });
});
