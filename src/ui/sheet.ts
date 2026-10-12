import { esc } from '../core/utils';
import { svg } from '../core/icons';

export function openSheet(title: string, bodyHTML: string): void {
  const root = document.getElementById('sheet-root');
  if (!root) return;
  root.innerHTML =
    '<div class="sheet-bd" data-act="close-sheet"></div><div class="sheet"><div class="grab"></div>' +
    '<div class="sheet-hd"><h3>' + esc(title) + '</h3><button class="ibtn" data-act="close-sheet" aria-label="Tutup">' +
    svg('x') + '</button></div><div class="sheet-bd2">' + bodyHTML + '</div></div>';
  root.classList.add('open');
  document.body.style.overflow = 'hidden';
  const focusable = root.querySelector<HTMLElement>('input,button:not([data-act="close-sheet"])');
  setTimeout(() => focusable?.focus(), 120);
}

export function closeSheet(): void {
  const root = document.getElementById('sheet-root');
  if (!root || !root.classList.contains('open')) return;
  const sh = root.querySelector<HTMLElement>('.sheet');
  if (sh) {
    sh.style.transition = '.3s var(--ease)';
    sh.style.transform = 'translateY(6%)';
    sh.style.opacity = '0';
  }
  setTimeout(() => {
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.style.overflow = '';
  }, 240);
}

export function sheetOpen(): boolean {
  const root = document.getElementById('sheet-root');
  return !!root && root.classList.contains('open');
}

export function updateSheetBody(html: string): void {
  const root = document.getElementById('sheet-root');
  const bd = root?.querySelector<HTMLElement>('.sheet-bd2');
  if (bd) bd.innerHTML = html;
}
