import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import type { HistoryItem } from '../lib/remote/types';
import { Button } from '../ui/Button';
import { DateBadge, EmptyState, ProgressBar } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { ConfirmModal } from '../ui/Sheet';
import { Topbar } from '../shell/Topbar';
import { watchPath } from '../lib/nav';

/** Riwayat tontonan — dikelompokkan per tanggal, dengan mode pilih & hapus. */

const keyOf = (h: HistoryItem) => h.animeId + '|' + h.episode;

function dateLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff <= 0) return 'Hari Ini';
  if (diff === 1) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function History() {
  const navigate = useNavigate();
  const history = useLibrary(s => s.history);
  const removeHistory = useLibrary(s => s.removeHistory);
  const clearHistory = useLibrary(s => s.clearHistory);

  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

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

  const toggleSel = (h: HistoryItem) => {
    setSel(prev => {
      const next = new Set(prev);
      const k = keyOf(h);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
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
      <Topbar
        back
        title="Riwayat"
        right={
          history.length ? (
            selecting ? (
              <button type="button" className="section-link" onClick={() => { setSelecting(false); setSel(new Set()); }}>
                Batal
              </button>
            ) : (
              <>
                <button type="button" className="section-link" onClick={() => setSelecting(true)}>
                  Pilih
                </button>
                <button type="button" className="ibtn ripple-host" aria-label="Bersihkan riwayat" onClick={() => setConfirmClear(true)}>
                  <Icon name="trash" />
                </button>
              </>
            )
          ) : null
        }
      />

      {grouped.map(g => (
        <section key={g.label}>
          <DateBadge label={g.label} />
          <div style={{ display: 'grid', gap: 10 }}>
            {g.items.map(h => {
              const k = keyOf(h);
              const on = sel.has(k);
              return (
                <div
                  key={k}
                  className={'hist-row' + (selecting ? ' selecting' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => (selecting ? toggleSel(h) : navigate(watchPath(h.animeId, h.episode, h.title)))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') selecting ? toggleSel(h) : navigate(watchPath(h.animeId, h.episode, h.title));
                  }}
                >
                  {selecting ? (
                    <span className={'hist-check' + (on ? ' on' : '')}>
                      {on ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                    </span>
                  ) : null}
                  <span className="hist-thumb">
                    <SmartImage src={h.poster} alt={h.title} />
                  </span>
                  <span className="hist-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="ep-title clamp-2" style={{ fontWeight: 700 }}>
                      {h.title}
                    </span>
                    <span className="ep-sub" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      Episode {h.episode} • {timeLabel(h.watchedAt)}
                    </span>
                    <ProgressBar value={(h.percent || 0) / 100} />
                  </span>
                  {h.completed ? (
                    <span className="badge green">Selesai</span>
                  ) : (
                    <span className="badge blue">{Math.round(h.percent || 0)}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {!history.length ? (
        <EmptyState icon="clock" title="Riwayat masih kosong" sub="Tayangan yang kamu tonton akan muncul di sini." />
      ) : null}

      {selecting ? (
        <div className="action-bar">
          <Button variant="ghost" onClick={() => { setSelecting(false); setSel(new Set()); }}>
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
