import { $$ } from '../core/utils';

let IO: IntersectionObserver | null = null;
let IMG_IO: IntersectionObserver | null = null;

export function initReveal(root?: ParentNode): void {
  if (!IO) {
    IO = new IntersectionObserver(
      es => {
        es.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            IO?.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
  }
  const io = IO;
  if (io) $$('.rv:not(.in),.rv-s:not(.in)', root || document).forEach(n => io.observe(n));
}

export function initLazy(root?: ParentNode): void {
  if (!IMG_IO) {
    IMG_IO = new IntersectionObserver(
      es => {
        es.forEach(e => {
          if (e.isIntersecting) {
            const im = e.target as HTMLImageElement;
            if (im.dataset.src) {
              im.src = im.dataset.src;
              delete im.dataset.src;
            }
            IMG_IO?.unobserve(im);
          }
        });
      },
      { rootMargin: '400px 0px' }
    );
  }
  const img = IMG_IO;
  if (img) $$('img[data-src]', root || document).forEach(n => img.observe(n));
}

export function initRails(root?: ParentNode): void {
  $$('[data-railwrap]', root || document).forEach(w => {
    const tr = w.querySelector<HTMLElement>('.rail-track');
    if (!tr || (tr as any)._ok) return;
    (tr as any)._ok = 1;
    const upd = () => {
      w.classList.toggle('s-start', tr.scrollLeft < 8);
      w.classList.toggle('e-end', tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 8);
    };
    tr.addEventListener('scroll', upd, { passive: true });
    upd();
    let down = false, sx = 0, sl = 0, moved = 0;
    tr.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('button')) return;
      down = true;
      moved = 0;
      sx = e.clientX;
      sl = tr.scrollLeft;
      tr.classList.add('drag');
      try { tr.setPointerCapture(e.pointerId); } catch { /* noop */ }
    });
    tr.addEventListener('pointermove', e => {
      if (!down) return;
      const d = e.clientX - sx;
      moved = Math.abs(d);
      if (moved > 6) {
        tr.scrollLeft = sl - d;
        e.preventDefault();
      }
    });
    const release = () => {
      if (down) {
        down = false;
        tr.classList.remove('drag');
      }
    };
    tr.addEventListener('pointerup', release);
    tr.addEventListener('pointercancel', release);
    tr.addEventListener(
      'click',
      e => {
        if (moved > 10) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  });
}

export function railScroll(id: string, dir: number): void {
  const tr = document.getElementById(id);
  if (!tr) return;
  tr.scrollBy({ left: tr.clientWidth * 0.82 * dir, behavior: 'smooth' });
}

export function initView(root: ParentNode): void {
  initReveal(root);
  initLazy(root);
  initRails(root);
}
