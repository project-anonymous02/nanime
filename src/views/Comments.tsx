import { useCallback, useEffect, useMemo, useState } from 'react';
import { listComments, removeComment, saveComment, type CommentRow } from '../lib/community';
import { RANK_META } from '../lib/rank';
import { currentAuthUser, currentUserId, useAuth } from '../state/auth';
import { toast } from '../state/ui';
import { CommunityAvatar } from '../ui/CommunityAvatar';

export function Comments({ animeId }: { animeId: string }) {
  const signedIn = useAuth(s => s.signedIn);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string>();
  const [replying, setReplying] = useState<CommentRow>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const topLevel = useMemo(() => rows.filter(row => !row.parent_comment_id), [rows]);
  const replies = useMemo(() => rows.reduce<Record<string, CommentRow[]>>((map, row) => { if (row.parent_comment_id) (map[row.parent_comment_id] ||= []).push(row); return map; }, {}), [rows]);
  const load = useCallback(async () => { setLoading(true); setError(false); try { setRows(await listComments(animeId)); } catch { setError(true); } finally { setLoading(false); } }, [animeId]);
  useEffect(() => { void load(); }, [load]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await saveComment(animeId, text, editing, replying?.id); setText(''); setEditing(undefined); setReplying(undefined); await load(); }
    catch (err) { toast((err as Error).message, 'err'); }
    finally { setBusy(false); }
  }
  function edit(row: CommentRow) { setEditing(row.id); setReplying(undefined); setText(row.content); }
  function reply(row: CommentRow) { setEditing(undefined); setReplying(row); setText(''); }
  const identity = (row: CommentRow) => row.profile?.username || currentAuthUser()?.name || currentAuthUser()?.email || 'Pengguna';
  const card = (row: CommentRow, nested = false) => <article className={'comment-card' + (nested ? ' comment-reply' : '')} key={row.id}>
    <div className="comment-identity"><CommunityAvatar name={identity(row)} src={row.profile?.avatar_url} /><div><b style={row.profile ? { color: RANK_META[row.profile.rank].color } : undefined}>{identity(row)}</b><small> · {row.profile ? RANK_META[row.profile.rank].label : ''}</small></div></div>
    <p>{row.content}</p><div className="comment-actions">{signedIn && !nested ? <button type="button" className="dt-syn-toggle" onClick={() => reply(row)}>Balas{replies[row.id]?.length ? ` · ${replies[row.id].length}` : ''}</button> : null}{row.user_id === currentUserId() ? <><button type="button" className="dt-syn-toggle" onClick={() => edit(row)}>Edit</button><button type="button" className="dt-syn-toggle" onClick={async () => { try { await removeComment(row.id); await load(); } catch (err) { toast((err as Error).message, 'err'); } }}>Hapus</button></> : null}</div>
    {(replies[row.id] || []).map(replyRow => card(replyRow, true))}
  </article>;
  return <section className="community-comments"><h2 className="dt-h2">Komentar</h2>
    {signedIn ? <form className="comment-composer" onSubmit={submit}>{replying ? <div className="comment-reply-context">Membalas {identity(replying)}<button type="button" onClick={() => { setReplying(undefined); setText(''); }}>Batal</button></div> : null}<textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder={replying ? 'Tulis balasan…' : 'Tulis komentar…'} required /><button className="dt-btn primary" type="submit" disabled={busy}>{busy ? 'Mengirim…' : editing ? 'Simpan' : replying ? 'Kirim balasan' : 'Kirim'}</button></form> : <p className="community-empty">Masuk untuk menulis komentar.</p>}
    {loading ? <p className="community-empty" role="status">Memuat komentar…</p> : error ? <p className="community-empty" role="alert">Komentar gagal dimuat. <button type="button" onClick={() => void load()}>Coba lagi</button></p> : !rows.length ? <p className="community-empty">Jadilah yang pertama berkomentar.</p> : topLevel.map(row => card(row))}
  </section>;
}
