import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dq = useDebounced(q.trim(), 380);

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
      return;
    }
    let alive = true;
    setLoading(true);
    setError(false);
    Catalog.search(dq, { sort: 'relevance' })
      .then(r => {
        if (alive) setItems(r.items);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dq]);

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
      {error && !loading ? <ErrorState onRetry={() => setQ(v => v)} /> : null}

      {!loading && !error && items && items.length === 0 ? (
        <EmptyState
          icon="search"
          title="Tidak ditemukan"
          sub={`Tidak ada hasil untuk “${dq}”. Coba kata kunci lain atau periksa ejaan.`}
        />
      ) : null}

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
