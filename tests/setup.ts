/* Stub lingkungan browser minimal agar modul bisa diuji di Node. */
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

const g = globalThis as any;
if (!g.localStorage) g.localStorage = new MemStorage();
if (!g.location) {
  g.location = {
    hash: '#/home',
    href: 'http://localhost/#/home',
    protocol: 'http:',
    hostname: 'localhost',
    replace(v: string) {
      this.hash = v;
    }
  };
}
if (!g.window) g.window = g;
if (!g.document) {
  g.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
    documentElement: { style: { setProperty: () => undefined }, setAttribute: () => undefined },
    body: { style: {} }
  };
}

export function resetStorage(): void {
  g.localStorage.clear();
}

/* ── Polyfill untuk environment jsdom (smoke test DOM) ── */
const G = globalThis as any;
if (typeof G.IntersectionObserver === 'undefined') {
  G.IntersectionObserver = class {
    constructor(_cb: unknown, _opt?: unknown) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): unknown[] {
      return [];
    }
  };
}
if (typeof G.ResizeObserver === 'undefined') {
  G.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
const win = G.window;
if (win && typeof win.matchMedia !== 'function') {
  win.matchMedia = (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  });
}
if (win && typeof win.scrollTo !== 'function') win.scrollTo = () => undefined;
