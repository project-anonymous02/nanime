import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import { recordClientMetric } from '../core/services/Telemetry';
import type { AggregatedCard } from '../core/types';
import { Grid, UpdateCard } from '../ui/Cards';
import { EmptyState, ErrorState, ListSkel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { useDebounced } from '../ui/hooks';
import { detailPath } from '../lib/nav';

/** Pencarian lintas katalog — satu judul = satu kartu, tanpa label sumber. */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, q }: { text: string; q: string }) {
  const node = useMemo(() => {
    const terms = q
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 1)
      .map(escapeRe);
    if (!terms.length) return text;
    const g = new RegExp('(' + terms.join('|') + ')', 'gi');
    const single = new RegExp('^(' + terms.join('|') + ')$', 'i');
    return text.split(g).map((part, i) =>
      single.test(part) ? (
        <mark key={i} style={{ background: 'var(--accent-primary)', color: '#fff', borderRadius: 3, padding: '0 2px' }}>
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }, [text, q]);
  return <>{node}</>;
}

export function Search() {
  const navigate = useNavigate();
  const routeParams = useParams();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || routeParams.genreTitle || '');
  const [items, setItems] = useState<AggregatedCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [partial, setPartial] = useState(false);
  const [retry, setRetry] = useState(0);
  const [adult, setAdult] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dq = useDebounced(q.trim(), 260);
  const hasAdultSources = useMemo(() => Catalog.adultSearchProviders().length > 0, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setParams(
      p => {
        const next = new URLSearchParams(p);
        if (dq) next.set('q', dq);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  }, [dq, setParams]);

  useEffect(() => {
    if (dq.length < 2) {
      setItems(null);
      setLoading(false);
      setError(false);
      setPartial(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const startedAt = performance.now();
    let firstResultMeasured = false;
    setItems(null);
    setLoading(true);
    setError(false);
    setPartial(false);
    Catalog.search(dq, { sort: 'relevance', includeAdult: adult, signal: controller.signal, onUpdate: result => {
      if (alive && !controller.signal.aborted) {
        setItems(result.items);
        setPartial(true);
        if (!firstResultMeasured && result.items.length) {
          firstResultMeasured = true;
          recordClientMetric({ name: 'search-first-result', durationMs: performance.now() - startedAt, count: result.items.length, ok: true });
        }
      }
    } })
      .then(r => {
        if (alive && !controller.signal.aborted) {
          setItems(r.items);
          setPartial(r.sources.some(source => source.error === 'deadline'));
          recordClientMetric({ name: 'search', durationMs: performance.now() - startedAt, count: r.items.length, ok: true });
        }
      })
      .catch(() => {
        if (alive && !controller.signal.aborted) {
          setError(true);
          recordClientMetric({ name: 'search', durationMs: performance.now() - startedAt, count: 0, ok: false });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [dq, retry, adult]);

  const openCard = (c: AggregatedCard) => navigate(detailPath(c.canonicalId, c.title));

  return (
    <>
      <header className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <div className="hn-searchbar" style={{ flex: 1, margin: 0 }}>
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Mencari anime"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Kotak pencarian"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', flex: 1, outline: 'none', fontSize: 14 }}
          />
          {q ? (
            <button
              type="button"
              className="hn-iconbtn"
              style={{ width: 34, height: 34 }}
              aria-label="Bersihkan"
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
            >
              <Icon name="x" size={18} />
            </button>
          ) : null}
        </div>
      </header>

      {hasAdultSources ? (
        <div className="hn-chiprow" style={{ justifyContent: 'center', paddingBottom: 14 }}>
          <button
            type="button"
            className={`hn-chip${adult ? ' hn-active' : ''}`}
            aria-pressed={adult}
            onClick={() => setAdult(value => !value)}
          >
            18+ Sumber dewasa
          </button>
        </div>
      ) : null}

      {loading && !items ? <ListSkel count={4} /> : null}
      {loading && items ? <p role="status" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '0 20px 12px' }}>Mengumpulkan dan menggabungkan hasil dari beberapa sumber…</p> : null}
      {!loading && partial ? <p role="status" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '0 20px 12px' }}>Beberapa sumber belum merespons. Hasil yang tersedia tetap ditampilkan.</p> : null}
      {error && !loading ? <ErrorState onRetry={() => setRetry(value => value + 1)} /> : null}

      {!loading && !error && !partial && items && items.length === 0 ? (
        <EmptyState
          icon="search"
          title="Tidak ditemukan"
          sub={`Tidak ada hasil untuk “${dq}”. Coba kata kunci lain atau periksa ejaan.`}
        />
      ) : null}
      {!loading && !error && partial && items?.length === 0 ? <p role="status" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '0 20px 12px' }}>Sumber yang merespons belum menemukan hasil. Coba lagi beberapa saat lagi.</p> : null}

      {items && items.length ? (
        <Grid>
          {items.map((c, i) => (
            <UpdateCard
              key={c.canonicalId}
              card={c}
              index={i}
              onOpen={openCard}
              titleNode={<Highlight text={c.title} q={dq} />}
            />
          ))}
        </Grid>
      ) : null}
    </>
  );
}
