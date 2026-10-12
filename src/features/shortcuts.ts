import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { go } from '../core/router';
import { openSheet, closeSheet, updateSheetBody, sheetOpen } from '../ui/sheet';

export interface Cmd {
  id: string;
  label: string;
  icon: string;
  group: string;
  kbd?: string;
  run: () => void;
}

let COMMANDS: Cmd[] = [];
let idx = 0;

export function setCommands(list: Cmd[]): void {
  COMMANDS = list;
}

export function commands(): Cmd[] {
  return COMMANDS;
}

function matches(c: Cmd, q: string): boolean {
  if (!q) return true;
  const s = (c.label + ' ' + c.group + ' ' + c.id).toLowerCase();
  return q.toLowerCase().split(/\s+/).every(t => s.indexOf(t) > -1);
}

function visible(q: string): Cmd[] {
  return COMMANDS.filter(c => matches(c, q));
}

function paintList(q: string): void {
  const list = visible(q);
  if (idx >= list.length) idx = Math.max(0, list.length - 1);
  const body = document.getElementById('palList');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<div style="padding:22px;text-align:center;color:var(--dim);font-size:13px">Tidak ada perintah yang cocok.</div>';
    return;
  }
  let lastGroup = '';
  body.innerHTML = list
    .map((c, i) => {
      const head = c.group !== lastGroup ? '<div class="pal-grp">' + esc(c.group) + '</div>' : '';
      lastGroup = c.group;
      return (
        head +
        '<button class="pal-item' + (i === idx ? ' on' : '') + '" data-pal="' + i + '" type="button">' +
        svg(c.icon, '', 2) + '<span>' + esc(c.label) + '</span>' +
        (c.kbd ? '<span class="kbd">' + esc(c.kbd) + '</span>' : '') +
        '</button>'
      );
    })
    .join('');
}

export function openPalette(): void {
  idx = 0;
  const html =
    '<div class="pal-input">' + svg('search', '', 2) +
    '<input id="palQ" type="text" autocomplete="off" spellcheck="false" placeholder="Ketik perintah atau tujuan…" aria-label="Cari perintah">' +
    '<span class="kbd">Esc</span></div>' +
    '<div class="pal-list" id="palList"></div>';
  openSheet('Perintah Cepat', html);
  paintList('');
  const inp = document.getElementById('palQ') as HTMLInputElement | null;
  if (!inp) return;
  inp.addEventListener('input', () => {
    idx = 0;
    paintList(inp.value.trim());
  });
  inp.addEventListener('keydown', e => {
    const list = visible(inp.value.trim());
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, Math.max(0, list.length - 1));
      paintList(inp.value.trim());
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      paintList(inp.value.trim());
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = list[idx];
      if (c) {
        closeSheet();
        setTimeout(() => c.run(), 60);
      }
    }
  });
}

export function bindPaletteClicks(): void {
  document.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('[data-pal]') as HTMLElement | null;
    if (!b) return;
    const inp = document.getElementById('palQ') as HTMLInputElement | null;
    const list = visible(inp ? inp.value.trim() : '');
    const c = list[Number(b.getAttribute('data-pal') || '0')];
    if (c) {
      closeSheet();
      setTimeout(() => c.run(), 60);
    }
  });
}

let gPending = false;
let gTimer: ReturnType<typeof setTimeout> | null = null;

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function bindShortcuts(): void {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (sheetOpen()) {
        e.preventDefault();
        closeSheet();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openPalette();
      return;
    }
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '?') {
      e.preventDefault();
      openPalette();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      go('/search');
      setTimeout(() => {
        const i = document.getElementById('sinput') as HTMLInputElement | null;
        i?.focus();
      }, 160);
      return;
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('nanime:open-settings'));
      return;
    }

    if (gPending) {
      gPending = false;
      if (gTimer) clearTimeout(gTimer);
      const map: Record<string, string> = { h: '/home', e: '/explore', f: '/favorite', j: '/schedule', r: '/history', s: '/stats', c: '/search' };
      const to = map[e.key.toLowerCase()];
      if (to) {
        e.preventDefault();
        go(to);
      }
      return;
    }

    if (e.key === 'g' || e.key === 'G') {
      gPending = true;
      if (gTimer) clearTimeout(gTimer);
      gTimer = setTimeout(() => {
        gPending = false;
      }, 1200);
    }
  });
}
