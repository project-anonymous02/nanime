import { useCallback, useEffect, useState } from 'react';
import {
  createDiscussion,
  createReply,
  deleteDiscussion,
  deleteReply,
  formatWatchDuration,
  leaderboard,
  listDiscussions,
  listReplies,
  updateDiscussion,
  updateReply,
  type CommunityProfile,
  type DiscussionRow,
  type ReplyRow
} from '../lib/community';
import { RANK_META } from '../lib/rank';
import { currentAuthUser, useAuth } from '../state/auth';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { CommunityAvatar } from '../ui/CommunityAvatar';

function Identity({ profile, userId }: { profile?: CommunityProfile; userId?: string }) {
  const authUser = currentAuthUser();
  const fallback = !userId || userId === authUser?.id ? authUser : null;
  const name = profile?.username || fallback?.name || fallback?.email || 'Profil belum tersinkron';
  const rank = profile ? RANK_META[profile.rank] : null;
  const developer = profile?.rank === 'developer';
  return (
    <span className="community-identity">
      <CommunityAvatar name={name} src={profile?.avatar_url} />
      <span className="community-identity-copy">
        <span className={developer ? 'community-user developer' : 'community-user'}>{name}</span>
        {rank ? <span className="community-rank" style={developer ? undefined : { color: rank.color }}>{rank.label}</span> : null}
      </span>
    </span>
  );
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function Replies({ discussion, signedIn, currentId }: { discussion: DiscussionRow; signedIn: boolean; currentId?: string }) {
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string>();

  const load = async () => {
    setLoading(true);
    setError('');
    try { setRows(await listReplies(discussion.id)); }
    catch (cause) { setError((cause as Error).message || 'Balasan gagal dimuat'); }
    finally { setLoading(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (editing) await updateReply(editing, value);
      else await createReply(discussion.id, value);
      setText(''); setEditing(undefined); await load();
    } catch (cause) { toast((cause as Error).message || 'Balasan gagal disimpan', 'err'); }
    finally { setBusy(false); }
  };

  const saveReply = async () => {
    if (!editing || !text.trim() || busy) return;
    setBusy(true);
    try { await updateReply(editing, text); setText(''); setEditing(undefined); await load(); }
    catch (cause) { toast((cause as Error).message || 'Balasan gagal disimpan', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="community-replies">
      <button type="button" className="community-reply-toggle" onClick={() => { if (!open) void load(); setOpen(value => !value); }} aria-expanded={open}>
        <Icon name="chat" size={16} />
        <span>{open ? 'Tutup balasan' : 'Lihat balasan'}</span>
        <Icon name={open ? 'up' : 'down'} size={14} />
      </button>
      {open ? (
        <div className="community-replies-panel">
          {loading ? <p className="community-state">Memuat balasan…</p> : null}
          {error ? <div className="community-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Coba lagi</button></div> : null}
          {!loading && !error && !rows.length ? <p className="community-state">Belum ada balasan. Mulai percakapan dengan sopan.</p> : null}
          {rows.map(reply => (
            <article className="community-reply" key={reply.id}>
              <Identity profile={reply.profile} userId={reply.user_id} />
              {editing === reply.id ? <textarea className="community-edit-input" value={text} onChange={event => setText(event.target.value)} maxLength={2000} aria-label="Edit balasan" /> : <p>{reply.content}</p>}
              <div className="community-reply-foot"><time>{dateLabel(reply.created_at)}</time>
                {currentId === reply.user_id ? editing === reply.id ? <><button type="button" disabled={busy} onClick={() => void saveReply()}>Simpan</button><button type="button" onClick={() => { setEditing(undefined); setText(''); }}>Batal</button></> : <><button type="button" onClick={() => { setEditing(reply.id); setText(reply.content); }}>Edit</button><button type="button" onClick={async () => { try { await deleteReply(reply.id); await load(); } catch (cause) { toast((cause as Error).message, 'err'); } }}>Hapus</button></> : null}
              </div>
            </article>
          ))}
          {signedIn ? <form className="community-reply-form" onSubmit={event => void submit(event)}><textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} placeholder={editing ? 'Ubah balasan…' : 'Tulis balasan…'} aria-label="Tulis balasan" required /><button type="submit" disabled={busy || !text.trim()}><Icon name="send" size={16} />{busy ? 'Menyimpan…' : editing ? 'Simpan' : 'Balas'}</button></form> : <p className="community-state">Masuk untuk membalas diskusi.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function Community() {
  const signedIn = useAuth(state => state.signedIn);
  const authUser = useAuth(state => state.user);
  const [rows, setRows] = useState<DiscussionRow[]>([]);
  const [leaders, setLeaders] = useState<CommunityProfile[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [leaderError, setLeaderError] = useState('');
  const [leaderLoading, setLeaderLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const currentId = authUser?.id;

  const load = useCallback(async (nextPage = 0, refresh = false) => {
    if (refresh || nextPage === 0) setRefreshing(refresh);
    else setLoading(true);
    setError('');
    if (nextPage === 0) setLeaderLoading(true);
    try {
      const [discussionResult, rankingResult] = await Promise.allSettled([listDiscussions(nextPage), leaderboard()]);
      if (discussionResult.status === 'rejected') throw discussionResult.reason;
      const discussions = discussionResult.value;
      setRows(previous => nextPage === 0 ? discussions : [...previous, ...discussions.filter(row => !previous.some(item => item.id === row.id))]);
      if (rankingResult.status === 'fulfilled') { setLeaders(rankingResult.value); setLeaderError(''); }
      else setLeaderError((rankingResult.reason as Error)?.message || 'Leaderboard gagal dimuat');
      setLeaderLoading(false);
      setPage(nextPage);
      setHasMore(discussions.length === 20);
    } catch (cause) { setError((cause as Error).message || 'Diskusi gagal dimuat'); }
    finally { setLoading(false); setRefreshing(false); setLeaderLoading(false); }
  }, []);

  useEffect(() => { void load(0); }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void leaderboard().then(setLeaders).catch(cause => setLeaderError((cause as Error)?.message || 'Leaderboard gagal dimuat'));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (editing) await updateDiscussion(editing, editTitle, editContent);
      else await createDiscussion(title, content);
      setTitle(''); setContent(''); setEditing(undefined); setEditTitle(''); setEditContent('');
      await load(0, true);
      toast(editing ? 'Diskusi diperbarui' : 'Diskusi dibuat', 'ok');
    } catch (cause) { toast((cause as Error).message || 'Diskusi gagal disimpan', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="community-page">
      <header className="community-heading">
        <span className="community-kicker"><Icon name="globe" size={15} /> Nanime Community</span>
        <div className="community-title-row"><div><h1>Diskusi publik</h1><p>Berbagi pendapat dan ngobrol bareng komunitas anime.</p></div><button type="button" className="community-refresh" onClick={() => void load(0, true)} disabled={refreshing} aria-label="Muat ulang diskusi"><Icon name="refresh" size={17} />{refreshing ? 'Memuat' : 'Segarkan'}</button></div>
      </header>

      {signedIn ? <form className="community-compose" onSubmit={event => void submit(event)}>
        <div className="community-compose-title"><span className="community-compose-icon"><Icon name={editing ? 'edit' : 'chat'} size={18} /></span><div><strong>{editing ? 'Edit topik' : 'Mulai topik baru'}</strong><small>Gunakan judul jelas dan jaga percakapan tetap nyaman.</small></div></div>
        <input value={editing ? editTitle : title} onChange={event => editing ? setEditTitle(event.target.value) : setTitle(event.target.value)} placeholder="Judul diskusi" maxLength={160} required />
        <textarea value={editing ? editContent : content} onChange={event => editing ? setEditContent(event.target.value) : setContent(event.target.value)} placeholder="Apa yang ingin kamu bahas?" maxLength={5000} required />
        <div className="community-compose-foot"><span>{(editing ? editContent : content).trim().length}/5000</span><div>{editing ? <button type="button" className="community-secondary" onClick={() => { setEditing(undefined); setEditTitle(''); setEditContent(''); }}>Batal</button> : null}<button className="community-submit" type="submit" disabled={busy || !(editing ? editTitle.trim() && editContent.trim() : title.trim() && content.trim())}><Icon name="send" size={16} />{busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Buat diskusi'}</button></div></div>
      </form> : <div className="community-signin"><Icon name="user" size={18} /><span>Masuk untuk membuat topik dan membalas diskusi.</span></div>}

      <div className="community-content-grid">
        <section className="community-feed" aria-label="Daftar diskusi">
          <div className="community-feed-head"><div><h2>Topik terbaru</h2><p>Diskusi publik dari anggota Nanime</p></div><span className="community-count">{rows.length} topik</span></div>
          {error ? <div className="community-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load(0, true)}>Coba lagi</button></div> : null}
          {loading && !rows.length ? <div className="community-state-card"><span className="spinner-sm" />Memuat diskusi…</div> : null}
          {!loading && !error && !rows.length ? <div className="community-state-card"><span className="community-empty-icon"><Icon name="chat" size={22} /></span><strong>Belum ada diskusi</strong><span>Jadilah yang pertama membuka topik.</span></div> : null}
          <div className="community-list">{rows.map(discussion => <article className="community-card" key={discussion.id}>
            <div className="community-card-head"><Identity profile={discussion.profile} userId={discussion.user_id} /><time>{dateLabel(discussion.created_at)}</time></div>
            {editing === discussion.id ? <div className="community-edit-note">Topik sedang diedit di formulir.</div> : <><h3>{discussion.title}</h3><p className="community-post-content">{discussion.content}</p></>}
            <div className="community-card-actions"><Replies discussion={discussion} signedIn={signedIn} currentId={currentId} />{currentId === discussion.user_id ? <div className="community-owner-actions">{editing === discussion.id ? null : <><button type="button" onClick={() => { setEditing(discussion.id); setEditTitle(discussion.title); setEditContent(discussion.content); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button type="button" onClick={async () => { if (!window.confirm('Hapus topik ini beserta balasannya?')) return; try { await deleteDiscussion(discussion.id); await load(0, true); toast('Diskusi dihapus', 'ok'); } catch (cause) { toast((cause as Error).message, 'err'); } }}>Hapus</button></>}</div> : null}</div>
          </article>)}</div>
          {loading && rows.length ? <p className="community-state">Memuat topik berikutnya…</p> : null}
          {!loading && hasMore && !error ? <button type="button" className="community-load-more" onClick={() => void load(page + 1)} disabled={loading}>Muat diskusi lainnya</button> : null}
        </section>

        <aside className="community-leaderboard"><div className="community-board-heading"><span className="community-board-icon"><Icon name="chart" size={17} /></span><div><h2>Leaderboard</h2><p>Waktu aktif menggunakan Nanime</p></div></div>
          {leaderLoading ? <p className="community-state" role="status">Memuat leaderboard…</p> : null}
          {leaderError ? <div className="community-error" role="alert"><span>{leaderError}</span><button type="button" onClick={() => void load(0, true)}>Coba lagi</button></div> : null}
          {!leaderLoading && leaders.length ? leaders.slice(0, 10).map((profile, index) => <div className="leader-row" key={profile.id}><b className={'leader-position' + (index < 3 ? ` rank-${index + 1}` : '')}>{String(index + 1).padStart(2, '0')}</b><Identity profile={profile} userId={profile.id} /><span className="leader-time">{formatWatchDuration(profile.app_usage_seconds)}</span></div>) : !leaderLoading && !leaderError ? <p className="community-state">Leaderboard belum memiliki data.</p> : null}
        </aside>
      </div>
    </div>
  );
}
