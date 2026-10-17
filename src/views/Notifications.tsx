import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard } from '../core/types';
import { EmptyState, ErrorState, ListSkel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { detailPath } from '../lib/nav';

/** Notifikasi — ringkasan update terbaru dengan aksen belum dibaca. */

export function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AggregatedCard[] | null>(null);
  const [error, setError] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [readAll, setReadAll] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const feed = await Catalog.home();
      setItems(feed.newUpdate);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = (items || []).filter(c => !removed.has(c.canonicalId));

  return (
    <>
      <header className="notif-head">
        <button type="button" className="ibtn back-btn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <h1 className="notif-title">Notifikasi</h1>
        <span style={{ width: 40 }} />
      </header>

      {error && !items ? <ErrorState onRetry={() => void load()} /> : null}
      {!items && !error ? <ListSkel count={5} /> : null}

      {items
        ? visible.map(c => {
            const unread = !readAll;
            return (
              <div className={'notif-card' + (unread ? ' unread' : '')} key={c.canonicalId}>
                <button type="button" className="nf-main" onClick={() => navigate(detailPath(c.canonicalId, c.title))}>
                  <span className="nf-icon">
                    <Icon name="play" size={16} strokeWidth={0} />
                  </span>
                  <span className="nf-body">
                    <span className="nf-title">Update anime baru</span>
                    <span className="nf-text clamp-2">
                      {c.title} baru saja merilis episode terbaru.
                    </span>
                    <span className="nf-time">Hari ini</span>
                  </span>
                </button>
                <span className="nf-side">
                  {unread ? <span className="nf-dot" /> : null}
                  <button
                    type="button"
                    className="nf-trash"
                    aria-label="Hapus notifikasi"
                    onClick={() =>
                      setRemoved(prev => {
                        const next = new Set(prev);
                        next.add(c.canonicalId);
                        return next;
                      })
                    }
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </div>
            );
          })
        : null}

      {items && !visible.length ? (
        <EmptyState icon="bell" title="Belum ada notifikasi" sub="Update anime terbaru akan muncul di sini." />
      ) : null}

      {items && visible.length ? (
        <button type="button" className="notif-read-all" onClick={() => setReadAll(true)}>
          <Icon name="check" size={15} strokeWidth={3} />
          Baca semua notifikasi
        </button>
      ) : null}
    </>
  );
}
