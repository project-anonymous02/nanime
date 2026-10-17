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
import { watchPath } from '../lib/nav';

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
  const pct = Math.min(1, Math.max(0, item.percent || 0));
  return (
    <span className="hist-progress">
      <span className="hp-bar">
        <span className="hp-fill" style={{ '--pct': pct } as React.CSSProperties} />
      </span>
      <span className="hp-time">
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
    else navigate(watchPath(h.animeId, h.episode, h.title));
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

  return (
    <>
      <div className="hist-head">
        <h1 className="hist-title">Riwayat Menonton</h1>
        {history.length ? (
          <button type="button" className="ibtn hist-trash ripple-host" aria-label="Bersihkan riwayat" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={17} />
          </button>
        ) : null}
      </div>
      <p className="hist-sub">Tahan series untuk pilih &amp; hapus</p>

      {mode === 'single'
        ? grouped.map(g => (
            <section className="hist-group" key={g.label}>
              <span className="hist-chip">{g.label}</span>
              <span className="hist-tick" />
              {g.items.map(h => {
                const k = keyOf(h);
                const on = sel.has(k);
                return (
                  <button
                    type="button"
                    className={'hist-single' + (selecting && on ? ' on' : '')}
                    key={k}
                    onPointerDown={startPress}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onClick={() => activate(h)}
                  >
                    {selecting ? (
                      <span className={'hist-check' + (on ? ' on' : '')}>
                        {on ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                      </span>
                    ) : null}
                    <span className="hs-thumb">
                      <SmartImage src={h.poster} alt={h.title} />
                    </span>
                    <span className="hs-body">
                      <span className="hs-title clamp-2">{h.title}</span>
                      <span className="hs-sub">
                        Episode {h.episode} • {g.label}
                      </span>
                      <Progress item={h} />
                    </span>
                  </button>
                );
              })}
            </section>
          ))
        : series.map(s => (
            <section className="hist-multi" key={s.animeId}>
              <button type="button" className="hm-head" onClick={() => navigate(watchPath(s.animeId, s.items[0].episode, s.title))}>
                <span className="hm-thumb">
                  <SmartImage src={s.poster} alt={s.title} />
                </span>
                <span className="hm-id">
                  <span className="hm-title clamp-2">{s.title}</span>
                  <span className="hm-chip">{s.items.length} episode</span>
                </span>
              </button>
              {s.items.map(h => {
                const k = keyOf(h);
                const on = sel.has(k);
                return (
                  <button
                    type="button"
                    className={'hm-row' + (selecting && on ? ' on' : '')}
                    key={k}
                    onPointerDown={startPress}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onClick={() => activate(h)}
                  >
                    {selecting ? (
                      <span className={'hist-check' + (on ? ' on' : '')}>
                        {on ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                      </span>
                    ) : null}
                    <span className="hm-rail">
                      <span className="hm-dot" />
                    </span>
                    <span className="hm-body">
                      <span className="hm-line">
                        <span className="hm-ep">Episode {h.episode}</span>
                        <span className="hm-date">{shortDate(h.watchedAt)}</span>
                      </span>
                      <Progress item={h} />
                    </span>
                  </button>
                );
              })}
            </section>
          ))}

      {!history.length ? (
        <EmptyState icon="clock" title="Riwayat masih kosong" sub="Tayangan yang kamu tonton akan muncul di sini." />
      ) : null}

      {history.length ? (
        <div className="hist-mode">
          <button type="button" className={'hm-seg' + (mode === 'single' ? ' on' : '')} onClick={() => setMode('single')}>
            SINGLE
          </button>
          <button type="button" className={'hm-seg' + (mode === 'multi' ? ' on' : '')} onClick={() => setMode('multi')}>
            MULTI
          </button>
        </div>
      ) : null}

      {selecting ? (
        <div className="action-bar">
          <Button
            variant="ghost"
            onClick={() => {
              setSelecting(false);
              setSel(new Set());
            }}
          >
            Batal
          </Button>
          <Button variant="danger" disabled={!sel.size} onClick={doRemove}>
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
