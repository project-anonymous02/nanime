import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import { TitleIndex, titleFromKey } from '../core/services/TitleIndex';
import type { AggregatedCard } from '../core/types';
import { listRepliesToOwnComments, type CommentReplyNotice } from '../lib/community';
import { EmptyState, ErrorState, ListSkel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { detailPath } from '../lib/nav';
import { useNotifications } from '../state/notifications';
import { useLibrary } from '../state/library';
import { filterSubscribedUpdates, subscriptionUpdateId } from '../lib/subscriptions';

type Notice =
  | { kind: 'anime'; id: string; card: AggregatedCard }
  | { kind: 'reply'; id: string; reply: CommentReplyNotice; title: string };

/** Notifikasi berisi update anime diikuti dan balasan komentar nyata dari Supabase. */
export function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [error, setError] = useState(false);
  const { read, removed, markRead, remove } = useNotifications();
  const favorites = useLibrary(s => s.favorites);

  const load = useCallback(async () => {
    setError(false);
    const [feedResult, replyResult] = await Promise.allSettled([Catalog.home(), listRepliesToOwnComments()]);
    if (feedResult.status === 'rejected' && replyResult.status === 'rejected') {
      setError(true);
      return;
    }
    const updates = feedResult.status === 'fulfilled' ? feedResult.value.newUpdate : [];
    const replies = replyResult.status === 'fulfilled' ? replyResult.value : [];
    const replyNotices = await Promise.all(replies.map(async reply => {
      const indexed = await TitleIndex.get(reply.anime_id).catch(() => null);
      return { kind: 'reply' as const, id: `reply:${reply.id}`, reply, title: indexed?.title || titleFromKey(reply.anime_id) };
    }));
    const animeNotices = updates.map(card => ({ kind: 'anime' as const, id: subscriptionUpdateId(card), card }));
    setItems([...replyNotices, ...animeNotices].sort((a, b) => noticeTime(b) - noticeTime(a)));
    setError(feedResult.status === 'rejected' || replyResult.status === 'rejected');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const updates = items?.filter((item): item is Extract<Notice, { kind: 'anime' }> => item.kind === 'anime') || [];
    const updateIds = new Set(filterSubscribedUpdates(updates.map(item => item.card), favorites).map(subscriptionUpdateId));
    return (items || []).filter(item => !removed.includes(item.id) && (item.kind === 'reply' || updateIds.has(item.id)));
  }, [items, favorites, removed]);

  return <>
    <header className="notif-head">
      <button type="button" className="ibtn back-btn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <h1 className="notif-title">Notifikasi</h1>
      <span style={{ width: 40 }} />
    </header>

    {items === null && !error ? <ListSkel count={5} /> : null}
    {error && !items ? <ErrorState onRetry={() => void load()} /> : null}
    {error && items ? <p className="notification-partial" role="status">Sebagian notifikasi tidak dapat dimuat. Tarik ulang halaman untuk mencoba lagi.</p> : null}

    {items ? visible.map(item => {
      const unread = !read.includes(item.id);
      const title = item.kind === 'reply' ? 'Komentar Kamu Dibalas' : 'Update Anime Baru';
      const message = item.kind === 'reply'
        ? `${item.reply.profile?.username || 'Pengguna'} di ${item.title}: ${item.reply.content}`
        : `${item.card.title} baru saja merilis episode terbaru.`;
      return <article className={'notif-card' + (unread ? ' unread' : '')} key={item.id}>
        <button type="button" className="nf-main" onClick={() => {
          markRead([item.id]);
          navigate(item.kind === 'reply' ? detailPath(item.reply.anime_id, item.title) : detailPath(item.card.canonicalId, item.card.title));
        }}>
          <span className="nf-icon"><Icon name="play" size={16} strokeWidth={0} /></span>
          <span className="nf-body">
            <span className="nf-title">{title}</span>
            <span className="nf-text clamp-2">{message}</span>
            <span className="nf-time">{relativeTime(noticeTime(item))}</span>
          </span>
        </button>
        <span className="nf-side">
          {unread ? <span className="nf-dot" /> : null}
          <button type="button" className="nf-trash" aria-label="Hapus notifikasi" onClick={() => remove(item.id)}><Icon name="trash" size={15} /></button>
        </span>
      </article>;
    }) : null}

    {items && !visible.length ? <EmptyState icon="bell" title={favorites.length ? 'Belum ada notifikasi' : 'Belum ada langganan anime'} sub={favorites.length ? 'Balasan komentar dan update anime yang kamu ikuti akan muncul di sini.' : 'Subscribe anime dari halaman detail untuk menerima update episode di sini.'} /> : null}
    {items && visible.length ? <button type="button" className="notif-read-all" onClick={() => markRead(visible.map(item => item.id))}><Icon name="check" size={15} strokeWidth={3} />Baca semua notifikasi</button> : null}
  </>;
}

function noticeTime(item: Notice): number {
  return item.kind === 'reply' ? new Date(item.reply.created_at).getTime() || 0 : 0;
}

function relativeTime(timestamp: number): string {
  if (!timestamp) return 'Waktu tidak tersedia';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
