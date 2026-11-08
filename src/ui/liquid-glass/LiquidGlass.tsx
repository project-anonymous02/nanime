import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  clearAdaptiveLiquidGlass,
  createAdaptiveLiquidGlassController,
  createLiquidGlassDisplacementMap,
  supportsLiquidGlassSvgFilter,
  type AdaptiveSampleOptions,
} from './displacementMap';
import './liquidGlass.css';

const XLINK_NS = 'http://www.w3.org/1999/xlink';

export type LiquidGlassVariant = 'regular' | 'clear' | 'tinted';
export type LiquidGlassProfile = 'standard' | 'soft' | 'prominent' | 'thin';

export interface LiquidGlassProps {
  as?: ComponentType<any> | string;
  children?: ReactNode;
  className?: string;
  variant?: LiquidGlassVariant;
  radius?: number | string;
  strength?: number;
  profile?: LiquidGlassProfile;
  magnify?: number;
  bend?: number;
  spread?: number;
  bezelRatio?: number;
  supersample?: number;
  dispersion?: number;
  blur?: number | string;
  glare?: number;
  elasticity?: number;
  tint?: string;
  adaptive?: boolean | AdaptiveSampleOptions;
  interactive?: boolean;
  style?: CSSProperties;
  onPointerEnter?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  [key: string]: unknown;
}

/**
 * <LiquidGlass> — refraction-grade glass surface (skill React contract).
 * strength = % of measured lens scale (100 = calibrated). Pointer light only
 * updates CSS vars; maps regenerate only on size/radius/tuning change.
 */
export const LiquidGlass = forwardRef(function LiquidGlass(
  {
    as: Component = 'div',
    children,
    className = '',
    variant = 'regular',
    radius = 26,
    strength = 100,
    profile = 'standard',
    magnify = 1,
    bend = 0.06,
    spread = 0.58,
    bezelRatio = 0.62,
    supersample = 2,
    dispersion = 0.035,
    blur = 0.3,
    glare = 0.56,
    elasticity = 0.12,
    tint,
    adaptive = false,
    interactive = false,
    style,
    onPointerEnter,
    onPointerMove,
    onPointerLeave,
    onPointerDown,
    onPointerUp,
    ...props
  }: LiquidGlassProps,
  forwardedRef: React.ForwardedRef<HTMLElement>,
) {
  const rawId = useId();
  const filterId = useMemo(() => `lg-filter-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<SVGFEImageElement | null>(null);
  const dispRefs = useRef<(SVGFEDisplacementMapElement | null)[]>([]);
  const mapCacheRef = useRef<{ mapKey: string; scale: number }>({ mapKey: '', scale: 0 });
  const pointerRectRef = useRef<DOMRect | null>(null);
  const [svgFilterOk, setSvgFilterOk] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useImperativeHandle(forwardedRef, () => surfaceRef.current as HTMLElement, []);

  useEffect(() => {
    setSvgFilterOk(supportsLiquidGlassSvgFilter(filterId));
  }, [filterId]);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || !adaptive) {
      if (element) clearAdaptiveLiquidGlass(element);
      return undefined;
    }
    const controller = createAdaptiveLiquidGlassController(
      element,
      typeof adaptive === 'object' ? adaptive : {},
    );
    const schedule = () => controller.schedule();
    const onScrollCapture = () => controller.schedule();
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', onScrollCapture, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', onScrollCapture, { capture: true } as EventListenerOptions);
      controller.destroy();
    };
  }, [adaptive]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!svgFilterOk || !surface || !mapRef.current) {
      setMapReady(false);
      return undefined;
    }
    const applyScale = (scale: number) => {
      dispRefs.current.forEach((node, index) => {
        if (!node) return;
        const mul = dispersion > 0 ? [1 + dispersion, 1, 1 - dispersion][index] : 1;
        node.setAttribute('scale', (scale * (strength / 100) * mul).toFixed(2));
      });
    };
    const updateMap = () => {
      const element = surfaceRef.current;
      const mapNode = mapRef.current;
      if (!element || !mapNode) return;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const computedRadius = Number.parseFloat(getComputedStyle(element).borderRadius) || (typeof radius === 'number' ? radius : 26);
      const key = [
        Math.round(rect.width), Math.round(rect.height), Math.round(computedRadius),
        profile, magnify, bend, spread, bezelRatio, supersample,
      ].join(':');
      if (mapCacheRef.current.mapKey !== key) {
        const map = createLiquidGlassDisplacementMap({
          width: rect.width, height: rect.height, radius: computedRadius,
          profile, magnify, bend, spread, bezelRatio, supersample,
        });
        if (!map.url) return;
        mapCacheRef.current = { mapKey: key, scale: map.scale };
        mapNode.setAttribute('href', map.url);
        mapNode.setAttributeNS(XLINK_NS, 'href', map.url);
      }
      applyScale(mapCacheRef.current.scale);
      setMapReady(true);
    };
    updateMap();
    const win = globalThis as Window & typeof globalThis;
    if (typeof win.ResizeObserver !== 'undefined') {
      const observer = new win.ResizeObserver(() => requestAnimationFrame(updateMap));
      observer.observe(surface);
      return () => observer.disconnect();
    }
    win.addEventListener('resize', updateMap);
    return () => win.removeEventListener('resize', updateMap);
  }, [svgFilterOk, radius, strength, profile, magnify, bend, spread, bezelRatio, supersample, dispersion]);

  const mergedStyle = {
    '--lg-radius': typeof radius === 'number' ? `${radius}px` : radius,
    '--lg-blur': typeof blur === 'number' ? `${blur}px` : blur,
    '--lg-glare': glare,
    ...(tint ? { '--lg-tint': tint } : null),
    '--lg-filter-url': svgFilterOk && mapReady ? `url("#${filterId}")` : 'none',
    ...style,
  } as CSSProperties;

  const setDispRef = (index: number) => (node: SVGFEDisplacementMapElement | null) => {
    dispRefs.current[index] = node;
  };

  const updatePointerLight = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interactive || !surfaceRef.current) return;
    const element = surfaceRef.current;
    const rect = pointerRectRef.current || element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    element.style.setProperty('--lg-light-x', `${(x * 100).toFixed(1)}%`);
    element.style.setProperty('--lg-light-y', `${(y * 100).toFixed(1)}%`);
    element.style.setProperty('--lg-glare', String(Math.min(1, Number(glare) + 0.18)));
    element.style.setProperty('--lg-elastic-x', `${((x - 0.5) * 10 * elasticity).toFixed(2)}px`);
    element.style.setProperty('--lg-elastic-y', `${((y - 0.5) * 7 * elasticity).toFixed(2)}px`);
  };

  const resetPointerLight = () => {
    if (!surfaceRef.current) return;
    pointerRectRef.current = null;
    surfaceRef.current.style.setProperty('--lg-light-x', '84%');
    surfaceRef.current.style.setProperty('--lg-light-y', '12%');
    surfaceRef.current.style.setProperty('--lg-glare', String(glare));
    surfaceRef.current.style.setProperty('--lg-elastic-x', '0px');
    surfaceRef.current.style.setProperty('--lg-elastic-y', '0px');
  };

  return (
    <>
      <svg className="lg-filter-root" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="-35%" y="-35%" width="170%" height="170%">
            <feImage ref={mapRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            {dispersion > 0 ? (
              <>
                <feDisplacementMap ref={setDispRef(0)} in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="redDisp" />
                <feColorMatrix in="redDisp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
                <feDisplacementMap ref={setDispRef(1)} in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="greenDisp" />
                <feColorMatrix in="greenDisp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
                <feDisplacementMap ref={setDispRef(2)} in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="blueDisp" />
                <feColorMatrix in="blueDisp" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
                <feBlend in="red" in2="green" mode="screen" result="rg" />
                <feBlend in="rg" in2="blue" mode="screen" result="rgb" />
                <feColorMatrix in="rgb" type="matrix" values="1.05 0 0 0 0  0 1.02 0 0 0  0 0 1.06 0 0  0 0 0 1 0" />
              </>
            ) : (
              <>
                <feDisplacementMap ref={setDispRef(0)} in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                <feColorMatrix in="displaced" type="matrix" values="1.05 0 0 0 0  0 1.02 0 0 0  0 0 1.06 0 0  0 0 0 1 0" />
              </>
            )}
          </filter>
        </defs>
      </svg>
      <Component
        ref={surfaceRef}
        className={[
          'lg-surface',
          `lg-${variant}`,
          interactive ? 'lg-interactive' : '',
          svgFilterOk ? 'lg-svg-ok' : '',
          mapReady ? 'lg-map-ready' : '',
          className,
        ].filter(Boolean).join(' ')}
        style={mergedStyle}
        onPointerEnter={(event: ReactPointerEvent<HTMLElement>) => {
          if (interactive && surfaceRef.current) {
            pointerRectRef.current = surfaceRef.current.getBoundingClientRect();
          }
          onPointerEnter?.(event);
        }}
        onPointerMove={(event: ReactPointerEvent<HTMLElement>) => {
          updatePointerLight(event);
          onPointerMove?.(event);
        }}
        onPointerLeave={(event: ReactPointerEvent<HTMLElement>) => {
          resetPointerLight();
          onPointerLeave?.(event);
        }}
        onPointerDown={(event: ReactPointerEvent<HTMLElement>) => {
          if (interactive && surfaceRef.current) {
            surfaceRef.current.style.setProperty('--lg-press-scale', '0.985');
            surfaceRef.current.style.setProperty('--lg-glare', String(Math.min(1, Number(glare) + 0.3)));
          }
          onPointerDown?.(event);
        }}
        onPointerUp={(event: ReactPointerEvent<HTMLElement>) => {
          if (interactive && surfaceRef.current) {
            surfaceRef.current.style.setProperty('--lg-press-scale', '1');
          }
          onPointerUp?.(event);
        }}
        {...props}
      >
        {children}
      </Component>
    </>
  );
});
