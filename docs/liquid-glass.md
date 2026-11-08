# Nanime Liquid Glass — spec

Recipe: **Mobile Focus Sheet + Media Glass Stage + Command Deck**.

- Focal: hero poster / player video (content layer, never glassed).
- Command: bottom nav dock, sticky top bars, chat bar, sheets, player controls.
- Secondary: poster badges only (CSS material, thin).
- Content (rows, menus, chips, inputs, bubbles, rankcards) = solid `var(--surface)`.

## Material (skill golden-glass-style.md, production defaults)

Refraction replaces heavy blur. Numbers live in `src/styles/tokens.css`
(single source); `src/ui/liquid-glass/liquidGlass.css` holds the contract,
`src/styles/liquid-glass.css` binds `hn-*` surfaces, `app.css` keeps layout.

| Token | Value |
|---|---|
| Refractive blur | `0.3px` (lensing does the work) |
| Fallback blur | `6px` (bars `8px`, sheets `10px`) |
| Saturate / brightness / contrast | `1.55` / `1.10` / `1.12` |
| Border | `1px rgba(255,255,255,0.36)` + top edge + inner rim |
| Bezel / spread / bend | `0.62` / `0.58` / `0.06` |
| Strength / magnify | `110%` / `1.1` |
| Dispersion | `0.015` bars, `0.02` sheets/buttons, `0.025` pills |

## Color (user audit)

- App bg iOS secondary `#F2F2F7`; surface `#FFFFFF`.
- Glass tint neutral white 26% (`--glass-tint`) for nav/floating controls so
  poster/video color reads through. Old `rgba(245,245,247,0.72)` is gone.
- Clear over media: 14%. Sheets 32% (text legibility).
- Bars use halved sheen (`--lg-highlight-bar`).
- Dark appearance: semantic overrides under `[data-theme='dark']` exist but
  Nanime is light-only today; dark glass = `#1C1C1E` 44% when enabled.
- Refractive `blur 0.3px + saturate 1.55` is intentionally NOT `24px/180%`:
  heavy blur destroys lensing (skill). Fallback tier still uses blur so
  Safari/Capacitor-iOS (no SVG backdrop-url) gets believable frosted glass.

## Adaptive color engine

`src/ui/liquid-glass/adaptive-color.ts` (TS lives beside the glass system;
`src/styles/` stays CSS-only). Pure functions, unit-tested:

- `srgbToLinear` / `linearToSrgb` / `getLuminance` (0.2126R + 0.7152G + 0.0722B
  on linear channels) / `blendLinear` / `contrastRatio` / `toHex`.
- `createAdaptiveGlass(backdrop, options)`:
  1. Luminance threshold `0.35` picks mode (`dark` below, `light` above).
  2. Starts at 24% white tint (light) or 32% `#1C1C1E` (dark), foreground
     `#1C1C1E` or `#FFFFFF`.
  3. Raises opacity in 4% steps until foreground/material contrast ≥ 4.5:1;
     flips mode if the other mode reads better (mid-tone/photos).
  4. Returns `tint`, `foreground`, `border`, `highlight`, `shadow`, `opacity`,
     `contrast`. Compositing math is linear-light; CSS still paints rgba.

Runtime: `createAdaptiveLiquidGlassController()` samples the backdrop
(9 points, element hidden for one sync pass), throttled ~160–220ms, on
scroll/resize/intersection; writes `--lg-adaptive-*` inline + `data-lg-adaptive-mode`
and `data-glass-mode`. `clearAdaptiveLiquidGlass()` reverts to static tokens.

Adaptive surfaces: bottom nav, sticky page/home headers, stuck detail bar,
chat bar, search pin. Player controls stay fixed white-on-dark Clear glass
(sampling video frames would strobe). Sheets/toasts stay static Regular glass
over the dimming mask.

Dark mode flips the material through scoped token remap inside the surface
(`--text*`, `--hairline`, `--accent`) and lowers sheen/rim. `prefers-contrast`
and `prefers-reduced-transparency` force an opaque `--surface` + dark text.

## Component mapping

| Komponen | Material | Catatan |
|---|---|---|
| Bottom nav | Regular + adaptive | tint 26% → 24–72% sesuai backdrop |
| Top bar / sticky header | Regular + adaptive | hairline hanya saat scrolled |
| Bottom sheet / modal | Regular | 32% tint di atas mask 28% |
| Toast | Regular (thin) | 32% tint, radius 14 |
| Chat bar / search pin | Regular + adaptive | kontrol di atas konten bergulir |
| Player controls | Clear | putih 16% + border 38%, tanpa adaptive |
| Poster badge / chip | Clear (CSS-only) | tanpa JS refraction |
| Card / row / menu / chip / input / bubble | Solid `--surface` | bukan glass |

## Files

- `src/ui/liquid-glass/liquid-glass-core.ts` — SDF displacement, adaptive sampling/controller (skill core port).
- `src/ui/liquid-glass/adaptive-color.ts` — linear-light color math + `createAdaptiveGlass`.
- `src/ui/liquid-glass/displacementMap.ts` — canvas map, measured scale.
- `src/ui/liquid-glass/LiquidGlass.tsx` — React surface (`variant/profile/strength/dispersion/adaptive/interactive`).
- `src/ui/liquid-glass/enhancer.ts` — `useLiquidGlassEnhancer()`: attaches refraction to
  sticky headers, detail bar, chat bar, search pin, player buttons, mini player.
  Mounted once in `Shell`. Maps cached, regen only on size/radius change;
  pointer light updates CSS vars only.
- `src/ui/Sheet.tsx` — sheet/modal panels + grip drag (offset + velocity dismissal).
- `src/shell/Shell.tsx` — bottom nav dock (LiquidGlass) + active-tab pill materialize.

## Motion

- Spring curves: `--spring-smooth/snappy/interactive` (CSS approx); sheets use
  materialize (opacity + scale + blur).
- Gesture: sheet drag follows pointer up to release; release uses offset or
  velocity to dismiss, else springs back (transition interruptible).
- Reduced motion/transparency/contrast fallbacks in `liquid-glass.css` +
  `liquidGlass.css`.

## QA status

- `typecheck` + `build` pass; `vitest` 240/240 pass (39 files), including
  `tests/adaptive-color.test.ts` (luminance, linear blend, mode selection,
  contrast boost).
- Dark-backdrop QA hook: `__LG_FORCE_FALLBACK__` disables SVG refraction;
  adaptive state is inspectable via `data-lg-adaptive-mode`,
  `data-lg-adaptive-luminance`, `data-lg-adaptive-contrast`.
- No Chromium/Playwright in this container → no screenshot geometry check yet.
  Next: run skill `scripts/check-visual-geometry.mjs` against preview server
  (`npm run preview`, mobile + desktop), verify `data-lg-role` stage/dock/focus/rail
  gaps, then baseline screenshots.
