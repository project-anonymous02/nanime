import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard } from '../core/types';
import { EmptyState, ErrorState, ListSkel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { detailPath } from '../lib/nav';
import { useNotifications } from '../state/notifications';
import { useLibrary } from '../state/library';
import { filterSubscribedUpdates, subscriptionUpdateId } from '../lib/subscriptions';

type Notice = { kind: 'anime'; id: string; card: AggregatedCard };

/** Notifikasi: hanya update episode dari anime yang di-subscribe. */
export function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [error, setError] = useState(false);
  const { read, removed, markRead, remove } = useNotifications();
  const favorites = useLibrary(s => s.favorites);

  const load = useCallback(async () => {
    setError(false);
    try {
      const feed = await Catalog.home();
      const updates = feed.newUpdate || [];
      setItems(updates.map(card => ({ kind: 'anime' as const, id: subscriptionUpdateId(card), card })));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const updates = items || [];
    const updateIds = new Set(filterSubscribedUpdates(updates.map(item => item.card), favorites).map(subscriptionUpdateId));
    return updates.filter(item => !removed.includes(item.id) && updateIds.has(item.id));
  }, [items, favorites, removed]);

  return <>
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <h1 className="hn-pagehead-title">Notifikasi</h1>
      <span style={{ width: 40 }} />
    </header>

    {items === null && !error ? <ListSkel count={5} /> : null}
    {error && !items ? <ErrorState onRetry={() => void load()} /> : null}
    {error && items ? <p className="hn-inline-warn" role="status">Sebagian notifikasi tidak dapat dimuat. Tarik ulang halaman untuk mencoba lagi.</p> : null}

    {items ? visible.map(item => {
      const unread = !read.includes(item.id);
      return <article className="hn-notice" key={item.id}>
        <button type="button" className="hn-notice-open" onClick={() => {
          markRead([item.id]);
          navigate(detailPath(item.card.canonicalId, item.card.title));
        }}>
          <span className="hn-notice-icon"><Icon name="play" size={16} strokeWidth={0} /></span>
          <span className="hn-notice-body">
            <span className="hn-notice-title">Update Anime Baru</span>
            <span className="hn-notice-msg">{item.card.title} baru saja merilis episode terbaru.</span>
            <span className="hn-notice-time">Baru saja</span>
          </span>
        </button>
        <span className="hn-notice-actions">
          {unread ? <span className="hn-dot" /> : null}
          <button type="button" className="hn-iconbtn" aria-label="Hapus notifikasi" onClick={() => remove(item.id)}><Icon name="trash" size={15} /></button>
        </span>
      </article>;
    }) : null}

    {items && !visible.length ? <EmptyState icon="bell" title={favorites.length ? 'Belum ada notifikasi' : 'Belum ada langganan anime'} sub={favorites.length ? 'Update anime yang kamu ikuti akan muncul di sini.' : 'Subscribe anime dari halaman detail untuk menerima update episode di sini.'} /> : null}
    {items && visible.length ? <button type="button" className="hn-ghostbtn" onClick={() => markRead(visible.map(item => item.id))}><Icon name="check" size={15} strokeWidth={3} />Baca semua notifikasi</button> : null}
  </>;
}
