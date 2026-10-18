import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
        <mark key={i} className="hl">
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
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [items, setItems] = useState<AggregatedCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [partial, setPartial] = useState(false);
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dq = useDebounced(q.trim(), 260);

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
    Catalog.search(dq, { sort: 'relevance', signal: controller.signal, onUpdate: result => {
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
  }, [dq, retry]);

  const openCard = (c: AggregatedCard) => navigate(detailPath(c.canonicalId, c.title));

  return (
    <>
      <header className="topbar search-topbar">
        <button type="button" className="ibtn back-btn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <div className="input-wrap" style={{ flex: 1 }}>
          <Icon name="search" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Mencari anime"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Kotak pencarian"
          />
          {q ? (
            <button
              type="button"
              className="ibtn"
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

      {loading && !items ? <ListSkel count={4} /> : null}
      {loading && items ? <p className="search-refresh-note" role="status">Mengumpulkan dan menggabungkan hasil dari beberapa sumber…</p> : null}
      {!loading && partial ? <p className="search-refresh-note" role="status">Beberapa sumber belum merespons. Hasil yang tersedia tetap ditampilkan.</p> : null}
      {error && !loading ? <ErrorState onRetry={() => setRetry(value => value + 1)} /> : null}

      {!loading && !error && !partial && items && items.length === 0 ? (
        <EmptyState
          icon="search"
          title="Tidak ditemukan"
          sub={`Tidak ada hasil untuk “${dq}”. Coba kata kunci lain atau periksa ejaan.`}
        />
      ) : null}
      {!loading && !error && partial && items?.length === 0 ? <p className="search-refresh-note" role="status">Sumber yang merespons belum menemukan hasil. Coba lagi beberapa saat lagi.</p> : null}

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
