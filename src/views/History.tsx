import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import type { HistoryItem } from '../lib/remote/types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { ConfirmModal } from '../ui/Sheet';
import { detailPath } from '../lib/nav';

/** Riwayat menonton — SINGLE (per episode, grup tanggal) & MULTI (per series). */

const keyOf = (h: HistoryItem) => h.animeId + '|' + h.episode;

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function dateLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return 'Hari Ini';
  if (diff === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return 'Hari Ini';
  if (diff === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function Progress({ item }: { item: HistoryItem }) {
  const pct = Math.min(100, Math.max(0, Math.round(item.percent || 0)));
  return (
    <span className="hn-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span className="hn-progressbar" style={{ position: 'static', flex: 1, marginTop: 0 }}>
        <span className="hn-progressbar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>
        {mmss(item.positionSec)} / {mmss(item.durationSec)}
      </span>
    </span>
  );
}

export function History() {
  const navigate = useNavigate();
  const history = useLibrary(s => s.history);
  const removeHistory = useLibrary(s => s.removeHistory);
  const clearHistory = useLibrary(s => s.clearHistory);

  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const press = useRef<number | null>(null);
  const startPress = () => {
    if (selecting) return;
    press.current = window.setTimeout(() => {
      press.current = null;
      setSelecting(true);
    }, 420);
  };
  const cancelPress = () => {
    if (press.current) {
      clearTimeout(press.current);
      press.current = null;
    }
  };

  const grouped = useMemo(() => {
    const sorted = history.slice().sort((a, b) => b.watchedAt - a.watchedAt);
    const out: { label: string; items: HistoryItem[] }[] = [];
    for (const h of sorted) {
      const label = dateLabel(h.watchedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(h);
      else out.push({ label, items: [h] });
    }
    return out;
  }, [history]);

  const series = useMemo(() => {
    const sorted = history.slice().sort((a, b) => b.watchedAt - a.watchedAt);
    const map = new Map<string, { animeId: string; title: string; poster: string; items: HistoryItem[] }>();
    for (const h of sorted) {
      const cur = map.get(h.animeId);
      if (cur) cur.items.push(h);
      else map.set(h.animeId, { animeId: h.animeId, title: h.title, poster: h.poster, items: [h] });
    }
    return [...map.values()];
  }, [history]);

  const toggleSel = (h: HistoryItem) => {
    cancelPress();
    setSel(prev => {
      const next = new Set(prev);
      const k = keyOf(h);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const activate = (h: HistoryItem) => {
    cancelPress();
    if (selecting) toggleSel(h);
    else navigate(detailPath(h.animeId, h.title));
  };

  const doRemove = () => {
    const keys = [...sel].map(k => {
      const [animeId, episode] = k.split('|');
      return { animeId, episode };
    });
    removeHistory(keys);
    setSel(new Set());
    setSelecting(false);
    toast('Riwayat terpilih dihapus', 'ok');
  };

  const SelDot = ({ on }: { on: boolean }) => (
    <span
      style={{
        width: 20, height: 20, borderRadius: 999, flexShrink: 0,
        display: 'grid', placeItems: 'center', border: '2px solid var(--border-strong)',
        background: on ? 'var(--accent-primary)' : 'transparent', color: '#fff'
      }}
    >
      {on ? <Icon name="check" size={12} strokeWidth={3} /> : null}
    </span>
  );

  return (
    <>
      <header className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <h1 className="hn-pagehead-title">Riwayat Menonton</h1>
        {history.length ? (
          <button type="button" className="hn-iconbtn" aria-label="Bersihkan riwayat" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={17} />
          </button>
        ) : <span style={{ width: 40 }} />}
      </header>
      <p className="hn-profilehero-sub" style={{ textAlign: 'center', paddingBottom: 8 }}>Tahan series untuk pilih &amp; hapus</p>

      {mode === 'single'
        ? grouped.map(g => (
            <section className="hn-section" key={g.label}>
              <div className="hn-section-head"><span className="hn-section-title">{g.label}</span></div>
              <div className="hn-rowlist">
                {g.items.map(h => {
                  const k = keyOf(h);
                  const on = sel.has(k);
                  return (
                    <button
                      type="button"
                      className="hn-row"
                      key={k}
                      onPointerDown={startPress}
                      onPointerUp={cancelPress}
                      onPointerLeave={cancelPress}
                      onClick={() => activate(h)}
                    >
                      {selecting ? <SelDot on={on} /> : null}
                      <span className="hn-card-poster" style={{ width: 66, borderRadius: 8, flexShrink: 0 }}>
                        <SmartImage src={h.poster} alt={h.title} />
                      </span>
                      <span className="hn-row-main">
                        <span className="hn-row-title">{h.title}</span>
                        <span className="hn-row-sub">Episode {h.episode} • {g.label}</span>
                        <Progress item={h} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        : series.map(s => (
            <section className="hn-section" key={s.animeId}>
              <button type="button" className="hn-row" style={{ width: 'calc(100% - 32px)', margin: '0 16px 8px' }} onClick={() => navigate(detailPath(s.animeId, s.title))}>
                <span className="hn-card-poster" style={{ width: 66, borderRadius: 8, flexShrink: 0 }}>
                  <SmartImage src={s.poster} alt={s.title} />
                </span>
                <span className="hn-row-main">
                  <span className="hn-row-title">{s.title}</span>
                  <span className="hn-row-sub">{s.items.length} episode</span>
                </span>
                <Icon name="right" size={15} />
              </button>
              <div className="hn-rowlist">
                {s.items.map(h => {
                  const k = keyOf(h);
                  const on = sel.has(k);
                  return (
                    <button
                      type="button"
                      className="hn-row"
                      key={k}
                      onPointerDown={startPress}
                      onPointerUp={cancelPress}
                      onPointerLeave={cancelPress}
                      onClick={() => activate(h)}
                    >
                      {selecting ? <SelDot on={on} /> : null}
                      <span className="hn-row-main">
                        <span className="hn-row-title">Episode {h.episode}</span>
                        <span className="hn-row-sub">{shortDate(h.watchedAt)}</span>
                        <Progress item={h} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

      {!history.length ? (
        <EmptyState icon="clock" title="Riwayat masih kosong" sub="Tayangan yang kamu tonton akan muncul di sini." />
      ) : null}

      {history.length ? (
        <div className="hn-chiprow" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className={`hn-chip${mode === 'single' ? ' hn-active' : ''}`} onClick={() => setMode('single')}>SINGLE</button>
          <button type="button" className={`hn-chip${mode === 'multi' ? ' hn-active' : ''}`} onClick={() => setMode('multi')}>MULTI</button>
        </div>
      ) : null}

      {selecting ? (
        <div className="hn-formactions" style={{ marginTop: 16 }}>
          <Button
            variant="ghost"
            style={{ flex: 1 }}
            onClick={() => {
              setSelecting(false);
              setSel(new Set());
            }}
          >
            Batal
          </Button>
          <Button variant="danger" style={{ flex: 1 }} disabled={!sel.size} onClick={doRemove}>
            Hapus ({sel.size})
          </Button>
        </div>
      ) : null}

      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearHistory();
          toast('Riwayat dibersihkan', 'ok');
        }}
        title="Bersihkan Riwayat?"
        message="Semua riwayat tontonan akan dihapus dari perangkat dan akunmu. Tindakan ini tidak bisa dibatalkan."
        confirmText="Bersihkan"
      />
    </>
  );
}
