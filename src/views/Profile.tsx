import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, signOutUser } from '../state/auth';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { Sheet } from '../ui/Sheet';
import { detailPath } from '../lib/nav';
import { formatWatchDuration, listOwnComments, ownAppUsageSeconds, type OwnCommentRow } from '../lib/community';
import { isNanimeDeveloper, DEVELOPER_LEVEL, listDeveloperMessages, sendDeveloperMessage, type DeveloperMessage } from '../lib/developer';

/** Profil — banner, statistik, tab Favorit/Histori, dan sheet foto profil ala referensi. */

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400000;
  if (diff < 3600000) return 'Baru saja';
  if (diff < day) return `${Math.floor(diff / 3600000)} jam lalu`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} hari lalu`;
  const months = Math.floor(diff / (30 * day));
  return months <= 1 ? '1 bulan lalu' : `${months} bulan lalu`;
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Profile() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const developer = isNanimeDeveloper(user?.email);
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);

  const [tab, setTab] = useState<'comments' | 'fav' | 'hist'>('comments');
  const [photo, setPhoto] = useState(false);
  const [validatedSeconds, setValidatedSeconds] = useState<number | null>(null);
  const [comments, setComments] = useState<OwnCommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [developerMessages, setDeveloperMessages] = useState<DeveloperMessage[]>([]);
  const [developerMessagesError, setDeveloperMessagesError] = useState(false);
  const [developerMessage, setDeveloperMessage] = useState('');
  const [developerMessageError, setDeveloperMessageError] = useState('');
  const [sendingDeveloperMessage, setSendingDeveloperMessage] = useState(false);

  useEffect(() => {
    let alive = true;
    setValidatedSeconds(null);
    if (user?.id) void ownAppUsageSeconds().then(seconds => {
      if (alive) setValidatedSeconds(seconds);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    void listDeveloperMessages().then(rows => { if (alive) { setDeveloperMessages(rows); setDeveloperMessagesError(false); } }).catch(() => { if (alive) setDeveloperMessagesError(true); });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    setCommentsLoading(true);
    setCommentsError(false);
    void listOwnComments().then(rows => {
      if (alive) setComments(rows);
    }).catch(() => {
      if (alive) setCommentsError(true);
    }).finally(() => {
      if (alive) setCommentsLoading(false);
    });
    return () => { alive = false; };
  }, [user?.id]);

  const stats = useMemo(() => {
    const done = history.filter(h => h.completed).length;
    return { favs: favorites.length, hist: history.length, done, seconds: validatedSeconds };
  }, [favorites.length, history, validatedSeconds]);

  const initial = (user?.name || user?.email || 'N').trim().charAt(0).toUpperCase();
  const tag = developer ? '#1' : user?.id ? '#' + user.id.replace(/-/g, '').slice(0, 6) : '';

  const favList = useMemo(() => favorites.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 30), [favorites]);
  const histList = useMemo(() => history.slice().sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 30), [history]);

  return (
    <>
      <div className="prof-banner">
        <button type="button" className="ibtn prof-back ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
      </div>

      <div className="prof-avatar-wrap">
        <button type="button" className="prof-avatar" onClick={() => setPhoto(true)} aria-label="Foto profil">
          {user?.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="prof-initial">{initial}</span>}
          <span className="prof-cam">
            <Icon name="camera" size={12} strokeWidth={2.4} />
          </span>
        </button>
      </div>

      <div className="prof-name">
        {user?.name || 'Pengguna Nanime'}
        {tag ? <span className="prof-tag">{tag}</span> : null}
      </div>

      <div className="prof-chips">
        {developer ? <span className="prof-chip developer-chip"><Icon name="shield" size={12} strokeWidth={2.2} />Developer · Lvl. {DEVELOPER_LEVEL}</span> : null}
        <span className="prof-chip">
          <Icon name="shield" size={12} strokeWidth={2.2} />
          Akun Google
        </span>
        <span className="prof-chip dark">
          <Icon name="check" size={12} strokeWidth={2.6} />
          Tersinkron
        </span>
      </div>

      <section className="developer-profile-messages" aria-label="Pesan developer">
        <header><div><span className="eyebrow">NANIME</span><h2>Pesan Developer</h2></div><span className="developer-message-mark">DEV</span></header>
        <p className="developer-message-intro">Pengumuman dan pesan langsung dari developer Nanime.</p>
        {developer && <form onSubmit={async event => {
          event.preventDefault(); setDeveloperMessageError(''); setSendingDeveloperMessage(true);
          try { await sendDeveloperMessage(developerMessage); setDeveloperMessage(''); setDeveloperMessages(await listDeveloperMessages()); }
          catch (error) { setDeveloperMessageError(error instanceof Error ? error.message : 'Pesan gagal dikirim.'); }
          finally { setSendingDeveloperMessage(false); }
        }} className="developer-message-form">
          <textarea aria-label="Pesan untuk pengguna Nanime" maxLength={2000} value={developerMessage} onChange={event => setDeveloperMessage(event.target.value)} placeholder="Tulis pesan untuk pengguna Nanime…" />
          <button type="submit" disabled={sendingDeveloperMessage || !developerMessage.trim()}>{sendingDeveloperMessage ? 'Mengirim…' : 'Kirim pesan'}</button>
          {developerMessageError ? <p role="alert">{developerMessageError}</p> : null}
        </form>}
        {developerMessagesError ? <p className="prof-empty" role="alert">Pesan developer belum dapat dimuat. Terapkan migration Supabase 013 lalu coba lagi. <button type="button" className="prof-comment-link" onClick={() => { setDeveloperMessagesError(false); void listDeveloperMessages().then(setDeveloperMessages).catch(() => setDeveloperMessagesError(true)); }}>Coba lagi</button></p> : developerMessages.length ? <div className="developer-message-list">{developerMessages.map(message => <article key={message.id}><p>{message.content}</p><time>{new Date(message.created_at).toLocaleString('id-ID')}</time></article>)}</div> : <p className="prof-empty">Belum ada pesan developer.</p>}
      </section>

      <div className="prof-stats">
        <div className="prof-stat">
          <span className="ps-val">{stats.favs}</span>
          <span className="ps-lab">favorit</span>
        </div>
        <div className="prof-stat">
          <span className="ps-val">{stats.done}</span>
          <span className="ps-lab">selesai</span>
        </div>
        <div className="prof-stat">
          <span className="ps-val">{stats.hist}</span>
          <span className="ps-lab">riwayat</span>
        </div>
        <div className="prof-stat">
          <span className="ps-val" title={stats.seconds == null ? 'Data penggunaan belum tersedia' : formatWatchDuration(stats.seconds)}>{stats.seconds == null ? '—' : formatWatchDuration(stats.seconds)}</span>
          <span className="ps-lab">penggunaan</span>
        </div>
      </div>

      <div className="prof-actions">
        <button type="button" className="prof-action" onClick={() => navigate('/favorites')}>
          <Icon name="starFill" size={16} strokeWidth={0} />
          Favorit
        </button>
        <button type="button" className="prof-action" onClick={() => navigate('/settings')}>
          <Icon name="settings" size={16} strokeWidth={2.2} />
          Pengaturan
        </button>
        <button type="button" className="prof-action" onClick={() => navigate('/affinity')}>
          <Icon name="heartFill" size={16} />
          Afinitas
        </button>
      </div>

      <div className="prof-tabs" role="tablist">
        <button
          type="button"
          className={'prof-tab' + (tab === 'comments' ? ' on' : '')}
          role="tab"
          aria-selected={tab === 'comments'}
          onClick={() => setTab('comments')}
        >Komentar</button>
        <button
          type="button"
          className={'prof-tab' + (tab === 'fav' ? ' on' : '')}
          role="tab"
          aria-selected={tab === 'fav'}
          onClick={() => setTab('fav')}
        >
          Favorit
        </button>
        <button
          type="button"
          className={'prof-tab' + (tab === 'hist' ? ' on' : '')}
          role="tab"
          aria-selected={tab === 'hist'}
          onClick={() => setTab('hist')}
        >
          Histori
        </button>
      </div>

      {tab === 'comments' ? <section role="tabpanel" aria-label="Komentar">
        {commentsLoading ? <p className="prof-empty" role="status">Memuat komentar…</p> : null}
        {commentsError ? <div className="prof-empty" role="alert">Komentar belum dapat dimuat. <button type="button" className="prof-comment-link" onClick={() => { setCommentsLoading(true); setCommentsError(false); void listOwnComments().then(setComments).catch(() => setCommentsError(true)).finally(() => setCommentsLoading(false)); }}>Coba lagi</button></div> : null}
        {!commentsLoading && !commentsError && !comments.length ? <p className="prof-empty">Belum ada komentar.</p> : null}
        {comments.map(comment => <article className="prof-comment" key={comment.id}>
          <div className="prof-comment-head"><span className="prof-comment-anime">{comment.anime_id}</span><time>{relativeTime(new Date(comment.created_at).getTime())}</time></div>
          <p>{comment.content}</p>
          <button type="button" className="prof-comment-link" onClick={() => navigate(detailPath(comment.anime_id, comment.anime_id))}>Buka anime</button>
        </article>)}
      </section> : tab === 'fav'
        ? favList.map(f => (
            <button
              type="button"
              className="prof-row"
              key={f.id}
              onClick={() => navigate(detailPath(f.id, f.title))}
              aria-label={f.title}
            >
              <span className="pr-thumb">
                <SmartImage src={f.poster} alt={f.title} />
              </span>
              <span className="pr-body">
                <span className="pr-title clamp-2">{f.title}</span>
                <span className="pr-sub">
                  Favorit • {relativeTime(f.addedAt)}
                </span>
              </span>
            </button>
          ))
        : histList.map(h => (
            <div className="prof-row" key={h.animeId + '|' + h.episode}>
              <button
                type="button"
                className="pr-main"
                onClick={() => navigate(detailPath(h.animeId, h.title))}
                aria-label={h.title}
              >
                <span className="pr-thumb">
                  <SmartImage src={h.poster} alt={h.title} />
                </span>
                <span className="pr-body">
                  <span className="pr-title clamp-2">{h.title}</span>
                  <span className="pr-sub">
                    Episode {h.episode} • {relativeTime(h.watchedAt)}
                  </span>
                  <span className="hp-bar pr-bar">
                    <span className="hp-fill" style={{ '--pct': Math.min(1, Math.max(0, h.percent || 0)) } as React.CSSProperties} />
                  </span>
                  <span className="pr-time">
                    {mmss(h.positionSec)} / {mmss(h.durationSec)}
                  </span>
                </span>
              </button>
            </div>
          ))}

      {tab === 'fav' && !favList.length ? <p className="prof-empty">Belum ada favorit.</p> : null}
      {tab === 'hist' && !histList.length ? <p className="prof-empty">Belum ada riwayat tontonan.</p> : null}

      <Sheet open={photo} onClose={() => setPhoto(false)}>
        <div className="photo-sheet">
          <span className="phc-icon">
            <Icon name="camera" size={22} strokeWidth={2.2} />
          </span>
          <h3 className="phc-title">Foto Profil</h3>
          {user?.avatar ? (
            <button
              type="button"
              className="phc-btn ghost"
              onClick={() => {
                window.open(user.avatar as string, '_blank', 'noopener');
              }}
            >
              Ubah di Google
            </button>
          ) : null}
          <button
            type="button"
            className="phc-btn primary"
            onClick={() => {
              setPhoto(false);
              toast('Foto profil tersinkron dari akun Google', 'ok');
            }}
          >
            Sinkronisasi Foto
          </button>
          <button type="button" className="phc-close" onClick={() => setPhoto(false)}>
            Tutup
          </button>
          <button
            type="button"
            className="phc-out"
            onClick={() => {
              setPhoto(false);
              void signOutUser().then(() => toast('Berhasil keluar', 'ok'));
            }}
          >
            Keluar dari akun
          </button>
        </div>
      </Sheet>
    </>
  );
}
