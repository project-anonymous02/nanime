import { useEffect } from 'react';
import {
  createAdaptiveLiquidGlassController,
  createLiquidGlassDisplacementMap,
  supportsLiquidGlassSvgFilter,
  type AdaptiveController,
} from './displacementMap';

const XLINK_NS = 'http://www.w3.org/1999/xlink';

interface SurfaceSpec {
  selector: string;
  profile: 'standard' | 'soft' | 'thin' | 'prominent';
  radius: number;
  strength: number;
  dispersion: number;
  interactive: boolean;
  /** Sample backdrop luminance and pick light/dark tint at runtime. */
  adaptive?: boolean;
}

/**
 * Glass surfaces that cannot be wrapped in <LiquidGlass> (sticky headers used
 * across many views, player buttons over video, search pin). The enhancer
 * attaches a per-surface refraction filter in place: cached maps, regenerated
 * only on size/radius change; pointer light updates CSS vars only.
 *
 * Badges/poster chips deliberately stay CSS-material-only (rim + highlight +
 * fallback blur): dozens of tiny 40px maps would cost more than they show.
 * The hero/detail/player surfaces that prove lensing ARE refraction-backed.
 */
const SPECS: SurfaceSpec[] = [
  { selector: '.hn-pagehead', profile: 'soft', radius: 0, strength: 110, dispersion: 0.015, interactive: false, adaptive: true },
  { selector: '.hn-homehead', profile: 'soft', radius: 0, strength: 110, dispersion: 0.015, interactive: false, adaptive: true },
  { selector: '.hn-detail-bar[data-stuck="true"]', profile: 'soft', radius: 0, strength: 110, dispersion: 0.015, interactive: false, adaptive: true },
  { selector: '.hn-chatbar', profile: 'soft', radius: 0, strength: 110, dispersion: 0.015, interactive: false, adaptive: true },
  { selector: '.hn-searchpin > button', profile: 'thin', radius: 999, strength: 115, dispersion: 0.025, interactive: true, adaptive: true },
  // Clear glass over video: keep the fixed white-on-dark material, no sampling
  // (video frames flip luminance too fast and would strobe the controls).
  { selector: '.player-control-row button, .player-video-top-controls button', profile: 'thin', radius: 999, strength: 115, dispersion: 0.02, interactive: true },
  { selector: '.player-gesture-status', profile: 'thin', radius: 999, strength: 115, dispersion: 0.02, interactive: false },
  { selector: '.episode-player-backdrop.mini .episode-player', profile: 'standard', radius: 22, strength: 110, dispersion: 0.02, interactive: false },
  { selector: '.player-download-sheet', profile: 'soft', radius: 22, strength: 110, dispersion: 0.02, interactive: false },
];

interface Attached {
  el: HTMLElement;
  svg: SVGSVGElement;
  filterId: string;
  mapKey: string;
  scale: number;
  dispNodes: SVGFEDisplacementMapElement[];
  image: SVGFEImageElement | null;
  resizeObserver: ResizeObserver | null;
  adaptiveController: AdaptiveController | null;
  onPointerMove: ((e: PointerEvent) => void) | null;
  onPointerLeave: (() => void) | null;
}

const attached = new Map<HTMLElement, Attached>();
let counter = 0;

function buildFilterSvg(filterId: string, dispersion: number): { svg: SVGSVGElement; image: SVGFEImageElement; dispNodes: SVGFEDisplacementMapElement[] } {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lg-filter-root');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('colorInterpolationFilters', 'sRGB');
  filter.setAttribute('x', '-35%');
  filter.setAttribute('y', '-35%');
  filter.setAttribute('width', '170%');
  filter.setAttribute('height', '170%');
  const image = document.createElementNS('http://www.w3.org/2000/svg', 'feImage') as SVGFEImageElement;
  image.setAttribute('x', '0');
  image.setAttribute('y', '0');
  image.setAttribute('width', '100%');
  image.setAttribute('height', '100%');
  image.setAttribute('preserveAspectRatio', 'none');
  image.setAttribute('result', 'map');
  filter.appendChild(image);
  const dispNodes: SVGFEDisplacementMapElement[] = [];
  const addDisp = (result: string): SVGFEDisplacementMapElement => {
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    d.setAttribute('in', 'SourceGraphic');
    d.setAttribute('in2', 'map');
    d.setAttribute('scale', '0');
    d.setAttribute('xChannelSelector', 'R');
    d.setAttribute('yChannelSelector', 'G');
    d.setAttribute('result', result);
    filter.appendChild(d);
    dispNodes.push(d);
    return d;
  };
  const addMatrix = (inn: string, values: string, result?: string): void => {
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    m.setAttribute('in', inn);
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', values);
    if (result) m.setAttribute('result', result);
    filter.appendChild(m);
  };
  const addBlend = (in1: string, in2: string, result: string): void => {
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'feBlend');
    b.setAttribute('in', in1);
    b.setAttribute('in2', in2);
    b.setAttribute('mode', 'screen');
    b.setAttribute('result', result);
    filter.appendChild(b);
  };
  if (dispersion > 0) {
    addDisp('redDisp');
    addMatrix('redDisp', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'red');
    addDisp('greenDisp');
    addMatrix('greenDisp', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'green');
    addDisp('blueDisp');
    addMatrix('blueDisp', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'blue');
    addBlend('red', 'green', 'rg');
    addBlend('rg', 'blue', 'rgb');
    addMatrix('rgb', '1.05 0 0 0 0  0 1.02 0 0 0  0 0 1.06 0 0  0 0 0 1 0');
  } else {
    addDisp('displaced');
    addMatrix('displaced', '1.05 0 0 0 0  0 1.02 0 0 0  0 0 1.06 0 0  0 0 0 1 0');
  }
  defs.appendChild(filter);
  svg.appendChild(defs);
  return { svg, image, dispNodes };
}

function updateMap(entry: Attached, spec: SurfaceSpec): void {
  const el = entry.el;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const computedRadius = Number.parseFloat(getComputedStyle(el).borderRadius) || spec.radius;
  const key = [
    Math.round(rect.width), Math.round(rect.height), Math.round(computedRadius),
    spec.profile, 1, 0.06, 0.58, 0.62, 2,
  ].join(':');
  if (entry.mapKey !== key) {
    const map = createLiquidGlassDisplacementMap({
      width: rect.width, height: rect.height, radius: computedRadius,
      profile: spec.profile, magnify: 1, bend: 0.06, spread: 0.58, bezelRatio: 0.62, supersample: 2,
    });
    if (!map.url) return;
    entry.mapKey = key;
    entry.scale = map.scale;
    entry.image?.setAttribute('href', map.url);
    entry.image?.setAttributeNS(XLINK_NS, 'href', map.url);
  }
  entry.dispNodes.forEach((node, index) => {
    const mul = spec.dispersion > 0 ? [1 + spec.dispersion, 1, 1 - spec.dispersion][index] : 1;
    node.setAttribute('scale', (entry.scale * (spec.strength / 100) * mul).toFixed(2));
  });
  el.classList.add('lg-map-ready');
  el.style.setProperty('--lg-filter-url', `url("#${entry.filterId}")`);
}

function attach(el: HTMLElement, spec: SurfaceSpec): void {
  if (attached.has(el)) return;
  counter += 1;
  const filterId = `lg-enh-${counter}`;
  const { svg, image, dispNodes } = buildFilterSvg(filterId, spec.dispersion);
  const entry: Attached = {
    el, svg, filterId, mapKey: '', scale: 0, dispNodes, image,
    resizeObserver: null, adaptiveController: null, onPointerMove: null, onPointerLeave: null,
  };
  attached.set(el, entry);
  el.classList.add('lg-surface');
  if (spec.interactive) el.classList.add('lg-interactive');
  if (spec.radius === 0) el.classList.add('lg-bar');
  if (spec.adaptive) {
    entry.adaptiveController = createAdaptiveLiquidGlassController(el, {
      throttleMs: 220,
      sampleInset: 0.22,
      targetContrast: 4.5,
    });
  }
  el.prepend(svg);
  if (!supportsLiquidGlassSvgFilter(filterId)) {
    el.classList.remove('lg-svg-ok');
    return;
  }
  el.classList.add('lg-svg-ok');
  requestAnimationFrame(() => updateMap(entry, spec));
  if ('ResizeObserver' in window) {
    entry.resizeObserver = new ResizeObserver(() => requestAnimationFrame(() => updateMap(entry, spec)));
    entry.resizeObserver.observe(el);
  }
  if (spec.interactive) {
    const rectRef = { current: null as DOMRect | null };
    entry.onPointerMove = (e: PointerEvent) => {
      const rect = rectRef.current || el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      el.style.setProperty('--lg-light-x', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--lg-light-y', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--lg-glare', '0.74');
      el.style.setProperty('--lg-elastic-x', `${((x - 0.5) * 10 * 0.12).toFixed(2)}px`);
      el.style.setProperty('--lg-elastic-y', `${((y - 0.5) * 7 * 0.12).toFixed(2)}px`);
    };
    entry.onPointerLeave = () => {
      rectRef.current = null;
      el.style.setProperty('--lg-light-x', '84%');
      el.style.setProperty('--lg-light-y', '12%');
      el.style.setProperty('--lg-glare', '0.56');
      el.style.setProperty('--lg-elastic-x', '0px');
      el.style.setProperty('--lg-elastic-y', '0px');
    };
    el.addEventListener('pointermove', entry.onPointerMove);
    el.addEventListener('pointerleave', entry.onPointerLeave);
    el.addEventListener('pointerenter', () => {
      rectRef.current = el.getBoundingClientRect();
    });
  }
}

function detach(el: HTMLElement): void {
  const entry = attached.get(el);
  if (!entry) return;
  entry.resizeObserver?.disconnect();
  entry.adaptiveController?.destroy();
  entry.adaptiveController = null;
  if (entry.onPointerMove) el.removeEventListener('pointermove', entry.onPointerMove);
  if (entry.onPointerLeave) el.removeEventListener('pointerleave', entry.onPointerLeave);
  entry.svg.remove();
  el.classList.remove('lg-surface', 'lg-interactive', 'lg-bar', 'lg-svg-ok', 'lg-map-ready');
  el.style.removeProperty('--lg-filter-url');
  attached.delete(el);
}

function scan(): void {
  const inDom = new Set<HTMLElement>();
  for (const spec of SPECS) {
    document.querySelectorAll<HTMLElement>(spec.selector).forEach((el) => {
      inDom.add(el);
      if (!attached.has(el)) attach(el, spec);
    });
  }
  for (const el of Array.from(attached.keys())) {
    if (!el.isConnected) detach(el);
  }
}

/** Mount once in <Shell>. Enhances glass surfaces that cannot be wrapped. */
export function useLiquidGlassEnhancer(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-stuck', 'class'] });
    const onResize = () => requestAnimationFrame(scan);
    const onScroll = () => {
      for (const entry of attached.values()) entry.adaptiveController?.schedule();
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      for (const el of Array.from(attached.keys())) detach(el);
    };
  }, []);
}
