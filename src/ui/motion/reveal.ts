import { useEffect } from 'react';

/**
 * Scroll Animation Engine.
 *
 * One IntersectionObserver stamps `.hn-revealed` on cards/rows as they enter
 * the viewport. CSS owns the motion (opacity/scale/translate) and receives a
 * per-batch `--reveal-delay` so items that appear together stagger 70ms apart.
 * Targets are unobserved after their entrance: scrolling never restarts an
 * animation that already played.
 */
const REVEAL_SELECTOR = [
  '.hn-card',
  '.hn-rankcard',
  '.hn-row',
  '.hn-menuitem',
  '.hn-auth-rules li',
].join(',');

const STAGGER_MS = 70;
const MAX_STAGGER_STEPS = 5;

function hasRevealSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof IntersectionObserver === 'undefined') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useScrollReveal(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    /* `.hn-main-scroll` di-remount per rute (key=pathname), jadi observer
       dipasang pada `.hn-main` yang stabil. Ini tetap mempersempit scope dari
       `document.body`: overlay pemutar, sheet, dan bottom nav tidak ikut
       dipantau. */
    const host = document.querySelector('.hn-main') ?? document.body;
    const targets = host.querySelectorAll<HTMLElement>(REVEAL_SELECTOR);

    if (!hasRevealSupport()) {
      targets.forEach(element => element.classList.add('hn-reveal', 'hn-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        let step = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.style.setProperty(
            '--reveal-delay',
            `${Math.min(step, MAX_STAGGER_STEPS) * STAGGER_MS}ms`,
          );
          element.classList.add('hn-revealed');
          observer.unobserve(element);
          step += 1;
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
    );

    const prepared = new Set<Element>();

    function bind(element: Element): void {
      if (!(element instanceof HTMLElement)) return;
      if (element.classList.contains('hn-revealed')) return;
      element.classList.add('hn-reveal');
      if (prepared.has(element)) return;
      prepared.add(element);
      observer.observe(element);
    }

    function prepare(root: ParentNode): void {
      if (root instanceof Element && root.matches(REVEAL_SELECTOR)) bind(root);
      root.querySelectorAll?.(REVEAL_SELECTOR).forEach(bind);
    }

    function forget(root: Node): void {
      if (!(root instanceof Element)) return;
      if (root.matches(REVEAL_SELECTOR)) {
        observer.unobserve(root);
        prepared.delete(root);
      }
      root.querySelectorAll?.(REVEAL_SELECTOR).forEach(element => {
        observer.unobserve(element);
        prepared.delete(element);
      });
    }

    targets.forEach(bind);
    prepare(host);

    /* Mutation batch di-flush sekali per frame; render beruntun (mis. daftar
       panjang) tidak memicu querySelectorAll berulang per record. */
    const pendingAdded = new Set<Element>();
    const pendingRemoved = new Set<Element>();
    let frame: number | null = null;

    const flush = () => {
      frame = null;
      pendingRemoved.forEach(node => {
        if (!node.isConnected) forget(node);
      });
      pendingAdded.forEach(node => {
        if (node.isConnected) prepare(node);
      });
      pendingAdded.clear();
      pendingRemoved.clear();
    };

    const mutations = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) pendingAdded.add(node as Element);
        });
        record.removedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) pendingRemoved.add(node as Element);
        });
      }
      if (frame === null) frame = requestAnimationFrame(flush);
    });
    mutations.observe(host, { childList: true, subtree: true });

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);
}
