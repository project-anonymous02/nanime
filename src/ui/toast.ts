import { esc } from '../core/utils';
import { svg } from '../core/icons';

export function toast(msg: string, kind: 'ok' | 'err' | 'info' = 'info', title?: string): void {
  const ic = ({ ok: 'check', err: 'alert', info: 'info' } as const)[kind] || 'info';
  const host = document.getElementById('toasts');
  if (!host) return;
  const n = document.createElement('div');
  n.className = 'toast ' + kind;
  n.innerHTML =
    '<span class="ti">' + svg(ic) + '</span><span style="min-width:0"><b style="display:block;font-weight:650">' +
    esc(title || ({ ok: 'Berhasil', err: 'Gagal', info: 'Info' }[kind] || 'Info')) +
    '</b><span style="display:block;color:var(--mut);font-size:12.2px;font-weight:460;line-height:1.45">' +
    esc(msg) + '</span></span>';
  host.appendChild(n);
  const kill = () => {
    n.classList.add('out');
    setTimeout(() => n.remove(), 340);
  };
  n.addEventListener('click', kill);
  setTimeout(kill, kind === 'err' ? 6200 : 3200);
}
