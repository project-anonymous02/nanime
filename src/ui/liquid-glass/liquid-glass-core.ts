// Ported from liquid-glass-design skill (assets/core/liquid-glass-core.js).
// Inverse lens mapping: interior stays identity, bezel band near border
// pulls samples toward center. Scale is MEASURED, never guessed.

import { createAdaptiveGlass, getLuminance, type AdaptiveGlassResult } from './adaptive-color';

export const DEFAULT_SUPERSAMPLE = 2;

export interface LiquidGlassMapOptions {
  width?: number;
  height?: number;
  radius?: number;
  magnify?: number;
  bend?: number;
  spread?: number;
  bezelRatio?: number;
  profile?: string;
}

export interface DisplacementPixels {
  width: number;
  height: number;
  data: Uint8Array;
  scale: number;
}

export interface RgbColor { r: number; g: number; b: number; a: number }

export function clamp(value: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

export function numberOption(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  return clamp(Number(value), min, max);
}

export function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

export function roundedRectSdf(px: number, py: number, width: number, height: number, radius: number): number {
  const cx = px - width / 2;
  const cy = py - height / 2;
  const hx = Math.max(0, width / 2 - radius);
  const hy = Math.max(0, height / 2 - radius);
  const qx = Math.abs(cx) - hx;
  const qy = Math.abs(cy) - hy;
  const inner = Math.min(Math.max(qx, qy), 0);
  const outer = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return inner + outer - radius;
}

export function profileCurve(value: number, profile = 'standard'): number {
  const eased = smoothStep(0, 1, value);
  switch (profile) {
    case 'soft': return eased * 0.78;
    case 'prominent': return Math.pow(eased, 0.72);
    case 'thin': return Math.pow(eased, 1.45);
    default: return eased;
  }
}

export function normalizeLiquidGlassMapOptions(options: LiquidGlassMapOptions = {}) {
  const width = Math.max(24, Math.round(numberOption(options.width, 400, 24, 4096)));
  const height = Math.max(24, Math.round(numberOption(options.height, 96, 24, 4096)));
  const radius = Math.round(clamp(numberOption(options.radius, Math.min(width, height) / 2, 0, 2048), 0, Math.min(width, height) / 2));
  const magnify = numberOption(options.magnify, 1, 0.2, 2);
  const bend = numberOption(options.bend, 0.06, 0, 0.3);
  const spread = numberOption(options.spread, 0.58, 0.4, 1);
  const bezelRatio = numberOption(options.bezelRatio, 0.62, 0.2, 1);
  const profile = String(options.profile || 'standard');
  return { width, height, radius, magnify, bend, spread, bezelRatio, profile };
}

export function createLiquidGlassDisplacementPixels(options: LiquidGlassMapOptions = {}): DisplacementPixels {
  const { width, height, radius, magnify, bend, spread, bezelRatio, profile } = normalizeLiquidGlassMapOptions(options);
  const shortSide = Math.min(width, height);
  const bezel = clamp(shortSide * 0.5 * bezelRatio, 10, 220);
  const cx = width / 2;
  const cy = height / 2;
  const raw = new Float32Array(width * height * 2);
  let maxDisplacement = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = roundedRectSdf(px, py, width, height, radius);
      let dx = 0;
      let dy = 0;
      if (d > -bezel) {
        const pull = smoothStep(-bezel, 0, Math.min(d, 0));
        const shaped = profileCurve(pull, profile);
        const ox = (px - cx) / (width / 2);
        const oy = (py - cy) / (height / 2);
        dx = -ox * shaped * magnify * bezel;
        dy = -oy * shaped * magnify * bezel;
        dx += Math.sin(((px / width) - 0.5) * Math.PI) * bend * bezel * shaped;
        dy += Math.sin(((py / height) - 0.5) * Math.PI) * bend * bezel * shaped;
      }
      const index = (y * width + x) * 2;
      raw[index] = dx;
      raw[index + 1] = dy;
      maxDisplacement = Math.max(maxDisplacement, Math.abs(dx), Math.abs(dy));
    }
  }

  const range = Math.max(1, maxDisplacement * spread);
  const data = new Uint8Array(width * height * 4);
  let rawIndex = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = raw[rawIndex];
      const dy = raw[rawIndex + 1];
      rawIndex += 2;
      const edgeDistance = Math.min(x, y, width - x - 1, height - y - 1);
      const edgeFactor = smoothStep(0, 3, edgeDistance);
      const pixel = (y * width + x) * 4;
      data[pixel] = Math.round(clamp((dx * edgeFactor) / range * 0.5 + 0.5, 0, 1) * 255);
      data[pixel + 1] = Math.round(clamp((dy * edgeFactor) / range * 0.5 + 0.5, 0, 1) * 255);
      data[pixel + 2] = 0;
      data[pixel + 3] = 255;
    }
  }
  return { width, height, data, scale: range * 2 };
}

export const relativeLuminance = getLuminance;

function parseColorChannel(value: string): number {
  const text = String(value || '').trim();
  if (text.endsWith('%')) return clamp(Number.parseFloat(text) * 2.55, 0, 255);
  return clamp(Number.parseFloat(text), 0, 255);
}

function parseAlphaChannel(value: string): number {
  const text = String(value || '').trim();
  if (text.endsWith('%')) return clamp(Number.parseFloat(text) / 100, 0, 1);
  return clamp(Number.parseFloat(text), 0, 1);
}

export function parseCssColor(value: string): RgbColor | null {
  const text = String(value || '').trim();
  if (!text || text === 'transparent') return null;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    const raw = hex[1];
    const expand = raw.length === 3 || raw.length === 4;
    const parts = expand ? raw.split('').map((item) => item + item) : raw.match(/.{2}/g);
    if (!parts || parts.length < 3) return null;
    return {
      r: Number.parseInt(parts[0], 16),
      g: Number.parseInt(parts[1], 16),
      b: Number.parseInt(parts[2], 16),
      a: parts[3] ? clamp(Number.parseInt(parts[3], 16) / 255, 0, 1) : 1,
    };
  }
  const rgb = /^rgba?\((.+)\)$/i.exec(text);
  if (!rgb) return null;
  const parts = rgb[1].trim().split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  return {
    r: parseColorChannel(parts[0]),
    g: parseColorChannel(parts[1]),
    b: parseColorChannel(parts[2]),
    a: parts[3] === undefined ? 1 : parseAlphaChannel(parts[3]),
  };
}

function extractCssColors(value: string): RgbColor[] {
  const text = String(value || '');
  const matches = text.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi) || [];
  return matches.map(parseCssColor).filter((c): c is RgbColor => !!c && c.a > 0.02);
}

function averageColors(colors: RgbColor[]): RgbColor | null {
  const visible = colors.filter((c) => c && c.a > 0.02);
  if (!visible.length) return null;
  const totalAlpha = visible.reduce((sum, c) => sum + c.a, 0);
  return {
    r: visible.reduce((sum, c) => sum + c.r * c.a, 0) / totalAlpha,
    g: visible.reduce((sum, c) => sum + c.g * c.a, 0) / totalAlpha,
    b: visible.reduce((sum, c) => sum + c.b * c.a, 0) / totalAlpha,
    a: clamp(totalAlpha / visible.length, 0, 1),
  };
}

const bitmapSampleCanvases = new WeakMap<Document, HTMLCanvasElement>();

function sampleBitmapElementColor(element: Element, point: { x: number; y: number }, root: Window): RgbColor | null {
  if (!element || !point || !element.tagName) return null;
  const tag = element.tagName.toLowerCase();
  if (!['img', 'video', 'canvas'].includes(tag)) return null;
  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    if (tag === 'img') {
      const img = element as HTMLImageElement;
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null;
      sourceWidth = img.naturalWidth;
      sourceHeight = img.naturalHeight;
    } else if (tag === 'video') {
      const video = element as HTMLVideoElement;
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
      sourceWidth = video.videoWidth;
      sourceHeight = video.videoHeight;
    } else {
      const canvas = element as HTMLCanvasElement;
      if (!canvas.width || !canvas.height) return null;
      sourceWidth = canvas.width;
      sourceHeight = canvas.height;
    }
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    const sampleX = Math.floor(clamp((point.x - rect.left) / rect.width, 0, 1) * (sourceWidth - 1));
    const sampleY = Math.floor(clamp((point.y - rect.top) / rect.height, 0, 1) * (sourceHeight - 1));
    const documentRef = element.ownerDocument || root.document;
    let canvas = documentRef ? bitmapSampleCanvases.get(documentRef) : null;
    if (!canvas && documentRef?.createElement) {
      canvas = documentRef.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      bitmapSampleCanvases.set(documentRef, canvas);
    }
    const context = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!canvas || !context) return null;
    context.clearRect(0, 0, 1, 1);
    context.drawImage(element as CanvasImageSource, sampleX, sampleY, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

function estimatedElementColor(element: Element | null, root: Window, point: { x: number; y: number }): RgbColor | null {
  let node: Element | null = element;
  while (node && node.nodeType === 1) {
    const bitmapColor = sampleBitmapElementColor(node, point, root);
    if (bitmapColor && bitmapColor.a > 0.02) return bitmapColor;
    const style = root.getComputedStyle?.(node);
    if (style) {
      const colors = [...extractCssColors(style.backgroundImage), ...extractCssColors(style.backgroundColor)];
      const color = averageColors(colors);
      if (color) return color;
    }
    node = node.parentElement;
  }
  return null;
}

function samplePoints(rect: DOMRect, inset: number): [number, number][] {
  const x0 = rect.left + rect.width * inset;
  const x1 = rect.left + rect.width * 0.5;
  const x2 = rect.right - rect.width * inset;
  const y0 = rect.top + rect.height * inset;
  const y1 = rect.top + rect.height * 0.5;
  const y2 = rect.bottom - rect.height * inset;
  return [[x1, y1], [x0, y0], [x2, y0], [x0, y2], [x2, y2], [x1, y0], [x1, y2], [x0, y1], [x2, y1]];
}

export interface AdaptiveSampleOptions {
  root?: Window;
  fallbackLuminance?: number;
  sampleInset?: number;
  throttleMs?: number;
  /** Contrast target for adaptive tint (default 4.5). */
  targetContrast?: number;
  /** Luminance split between dark/light material (default 0.35). */
  modeThreshold?: number;
  /** Starting tint alpha for light/dark modes. */
  lightTintOpacity?: number;
  darkTintOpacity?: number;
  maxTintOpacity?: number;
}

export function sampleLiquidGlassBackdrop(element: HTMLElement, options: AdaptiveSampleOptions = {}) {
  const root = (options.root || globalThis) as Window;
  const documentRef = element?.ownerDocument || root.document;
  if (!element || !documentRef?.elementFromPoint) {
    return { luminance: numberOption(options.fallbackLuminance, 0.5, 0, 1), samples: 0 };
  }
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return { luminance: numberOption(options.fallbackLuminance, 0.5, 0, 1), samples: 0 };
  }
  const rootWindow = documentRef.defaultView || root;
  const inset = numberOption(options.sampleInset, 0.18, 0.05, 0.45);
  const previousVisibility = element.style.visibility;
  const previousPointerEvents = element.style.pointerEvents;
  const colors: RgbColor[] = [];
  element.style.visibility = 'hidden';
  element.style.pointerEvents = 'none';
  try {
    for (const [x, y] of samplePoints(rect, inset)) {
      const target = documentRef.elementFromPoint(
        clamp(x, 0, rootWindow.innerWidth || x),
        clamp(y, 0, rootWindow.innerHeight || y),
      );
      const color = estimatedElementColor(target, rootWindow, { x, y });
      if (color) colors.push(color);
    }
  } finally {
    element.style.visibility = previousVisibility;
    element.style.pointerEvents = previousPointerEvents;
  }
  const color = averageColors(colors);
  if (!color) return { luminance: numberOption(options.fallbackLuminance, 0.5, 0, 1), samples: 0 };
  return { luminance: relativeLuminance(color), color, samples: colors.length };
}

export function computeAdaptiveLiquidGlassVars(luminance: number, options: AdaptiveSampleOptions = {}) {
  const luma = clamp(luminance, 0, 1);
  // Delegate material selection to the adaptive color engine (linear-light
  // compositing + WCAG contrast). `luminance` here is fallback-only; the
  // real sync path passes the sampled backdrop color so the engine can pick
  // light/dark tint and raise opacity for readability.
  const backdrop = luminanceToSample(luma);
  const glass = createAdaptiveGlass(backdrop, {
    targetContrast: options.targetContrast,
    modeThreshold: options.modeThreshold,
    lightOpacity: options.lightTintOpacity,
    darkOpacity: options.darkTintOpacity,
    maxOpacity: options.maxTintOpacity,
  });
  return {
    mode: glass.mode,
    luminance: luma,
    glass,
    variables: adaptiveVariables(glass),
  };
}

function adaptiveVariables(glass: AdaptiveGlassResult): Record<string, string> {
  return {
    '--lg-adaptive-tint': glass.tint,
    '--lg-adaptive-foreground': glass.foreground,
    '--lg-adaptive-border': glass.border,
    '--lg-adaptive-brightness': glass.mode === 'dark' ? '1.04' : '1.05',
    '--lg-adaptive-contrast': glass.mode === 'dark' ? '1.06' : '1.08',
    '--lg-adaptive-saturate': glass.mode === 'dark' ? '1.40' : '1.50',
  };
}

/** Convert an average luminance back to a neutral sample color (fallback). */
function luminanceToSample(luma: number): { r: number; g: number; b: number } {
  // Inverse of relative luminance for a neutral gray (sRGB encoding).
  const linear = clamp(luma, 0, 1);
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  const channel = Math.round(clamp(encoded, 0, 1) * 255);
  return { r: channel, g: channel, b: channel };
}

const ADAPTIVE_VARIABLES = [
  '--lg-adaptive-tint',
  '--lg-adaptive-foreground',
  '--lg-adaptive-border',
  '--lg-adaptive-brightness',
  '--lg-adaptive-contrast',
  '--lg-adaptive-saturate',
];

export function clearAdaptiveLiquidGlass(element: HTMLElement | null): void {
  if (!element) return;
  ADAPTIVE_VARIABLES.forEach((name) => element.style.removeProperty(name));
  delete element.dataset.lgAdaptiveMode;
  delete element.dataset.lgAdaptiveLuminance;
  delete element.dataset.lgAdaptiveContrast;
  delete element.dataset.glassMode;
}

export function syncAdaptiveLiquidGlass(element: HTMLElement, options: AdaptiveSampleOptions = {}) {
  const sample = sampleLiquidGlassBackdrop(element, options);
  const backdrop = sample.color
    ? { r: sample.color.r, g: sample.color.g, b: sample.color.b }
    : luminanceToSample(sample.luminance);
  const glass = createAdaptiveGlass(backdrop, {
    targetContrast: options.targetContrast,
    modeThreshold: options.modeThreshold,
    lightOpacity: options.lightTintOpacity,
    darkOpacity: options.darkTintOpacity,
    maxOpacity: options.maxTintOpacity,
  });
  const adaptive = {
    mode: glass.mode,
    luminance: sample.luminance,
    glass,
    variables: adaptiveVariables(glass),
  };
  Object.entries(adaptive.variables).forEach(([name, value]) => {
    element.style.setProperty(name, value);
  });
  element.dataset.lgAdaptiveMode = adaptive.mode;
  element.dataset.lgAdaptiveLuminance = adaptive.luminance.toFixed(3);
  element.dataset.lgAdaptiveContrast = glass.contrast.toFixed(2);
  element.dataset.glassMode = glass.mode;
  return { ...sample, ...adaptive };
}

export interface AdaptiveController {
  schedule: (request?: { immediate?: boolean }) => void;
  sync: (request?: { immediate?: boolean }) => unknown;
  destroy: () => void;
  readonly visible: boolean;
}

export function createAdaptiveLiquidGlassController(
  element: HTMLElement,
  options: AdaptiveSampleOptions | (() => AdaptiveSampleOptions) = {},
): AdaptiveController {
  const root = element?.ownerDocument?.defaultView || globalThis;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let lastSync = 0;
  let visible = true;
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;

  const cancelPending = () => {
    if (frame) { root.cancelAnimationFrame?.(frame); frame = 0; }
    if (timer) { root.clearTimeout?.(timer); timer = 0; }
  };
  const sync = (request: { immediate?: boolean } = {}) => {
    frame = 0;
    timer = 0;
    if (disposed || !element?.isConnected || (!visible && !request.immediate)) return null;
    const currentOptions = typeof options === 'function' ? options() || {} : options;
    lastSync = Date.now();
    return syncAdaptiveLiquidGlass(element, currentOptions);
  };
  const schedule = (request: { immediate?: boolean } = {}) => {
    if (disposed || !element?.isConnected || (!visible && !request.immediate) || frame || timer) return;
    const currentOptions = typeof options === 'function' ? options() || {} : options;
    const throttleMs = numberOption((currentOptions as AdaptiveSampleOptions).throttleMs, 160, 0, 2000);
    const elapsed = Date.now() - lastSync;
    const wait = request.immediate ? 0 : Math.max(0, throttleMs - elapsed);
    const queueFrame = () => {
      frame = root.requestAnimationFrame?.(() => sync(request)) || 0;
      if (!frame) sync(request);
    };
    if (wait > 0) {
      timer = root.setTimeout?.(() => { timer = 0; queueFrame(); }, wait) ?? 0;
    } else {
      queueFrame();
    }
  };

  if (root.IntersectionObserver) {
    intersectionObserver = new root.IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (!visible) cancelPending();
      else schedule({ immediate: true });
    }, { threshold: 0.01 });
    intersectionObserver.observe(element);
  }
  if (root.ResizeObserver) {
    resizeObserver = new root.ResizeObserver(() => schedule());
    resizeObserver.observe(element);
  }
  sync({ immediate: true });

  return {
    schedule,
    sync,
    destroy() {
      disposed = true;
      cancelPending();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      clearAdaptiveLiquidGlass(element);
    },
    get visible() { return visible; },
  };
}

export function isKnownBackdropSvgFilterUnsupported(userAgent = ''): boolean {
  const ua = String(userAgent);
  if (/\b(Firefox|FxiOS)\//i.test(ua)) return true;
  if (/\b(CriOS|EdgiOS|OPiOS)\//i.test(ua)) return true;
  return /Safari\//i.test(ua) && /AppleWebKit\//i.test(ua) && !/\b(Chrome|HeadlessChrome|Chromium|Edg|OPR|SamsungBrowser)\//i.test(ua);
}

export function supportsLiquidGlassSvgFilter(filterId = 'lg-probe-filter', root: Window = globalThis as unknown as Window): boolean {
  try {
    const w = root as Window & { __LG_FORCE_FALLBACK__?: boolean };
    if (w.__LG_FORCE_FALLBACK__) return false;
    if (isKnownBackdropSvgFilterUnsupported((root as Window).navigator?.userAgent || '')) return false;
    const documentRef = (root as Window).document;
    if (!documentRef) return false;
    const css = (root as Window & { CSS?: typeof CSS }).CSS;
    const supports = css?.supports?.bind(css);
    const filterValue = `url("#${filterId}")`;
    if (supports && !supports('backdrop-filter', filterValue) && !supports('-webkit-backdrop-filter', filterValue)) return false;
    const probe = documentRef.createElement('div');
    const style = probe.style as CSSStyleDeclaration & { webkitBackdropFilter?: string };
    style.backdropFilter = filterValue;
    style.webkitBackdropFilter = filterValue;
    return style.backdropFilter !== '' || (style.webkitBackdropFilter || '') !== '';
  } catch {
    return false;
  }
}
