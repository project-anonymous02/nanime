import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../ui/icons';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { sendFriendRequest, listFriendRequests, listMessages, removeFriend, respondFriendRequest, searchPeople, sendMessage, type DirectMessage, type FriendProfile, type FriendRequest } from '../lib/friends';

type FriendData = Awaited<ReturnType<typeof listFriendRequests>>;

export function Friends() {
  const navigate = useNavigate();
  const { friendId } = useParams();
  const [data, setData] = useState<FriendData>({ friends: [], incoming: [], outgoing: [] });
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'friends' | 'requests'>('friends');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selected = useMemo(() => data.friends.find(row => row.person.id === friendId), [data.friends, friendId]);
  const refresh = useCallback(async () => {
    setError('');
    try { setData(await listFriendRequests()); }
    catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 3) { setResults([]); return; }
    let alive = true;
    const timer = window.setTimeout(() => {
      void searchPeople(value).then(rows => { if (alive) setResults(rows); }).catch(e => { if (alive) setError(message(e)); });
    }, 300);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [query]);
  useEffect(() => {
    if (!friendId || !selected) { setMessages([]); return; }
    let alive = true;
    const load = async () => {
      try { const rows = await listMessages(friendId); if (alive) setMessages(rows); }
      catch (e) { if (alive) setError(message(e)); }
    };
    void load();
    const client = getClient();
    const channel = client?.channel(`nanime-dm-${[currentUserId(), friendId].sort().join('-')}`).on('postgres_changes', { event: '*', schema: 'public', table: 'nanime_direct_messages' }, () => { void load(); }).subscribe();
    const poll = window.setInterval(() => { void load(); }, 12000);
    return () => { alive = false; window.clearInterval(poll); if (channel) void client?.removeChannel(channel); };
  }, [friendId, selected]);

  const act = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); await refresh(); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  };
  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!friendId || !draft.trim()) return;
    const content = draft;
    setDraft('');
    await act(async () => { await sendMessage(friendId, content); setMessages(await listMessages(friendId)); });
  };

  return <main className="friends-page">
    <header className="friends-heading">
      {friendId ? <button className="ibtn" type="button" aria-label="Kembali ke daftar teman" onClick={() => navigate('/friends')}><Icon name="left" /></button> : null}
      <div><span className="community-kicker"><Icon name="user" size={14} /> NANIME SOCIAL</span><h1>{friendId ? selected?.person.username || 'Percakapan' : 'Teman & Chat'}</h1><p>Temukan teman Nanime dan lanjutkan percakapan secara pribadi.</p></div>
      <button type="button" className="ibtn" aria-label="Muat ulang" onClick={() => { setLoading(true); void refresh(); }}><Icon name="refresh" /></button>
    </header>
    {error ? <div className="community-error" role="alert">{error}<button type="button" onClick={() => void refresh()}>Coba lagi</button></div> : null}
    {friendId ? <section className="dm-panel">
      {!selected ? <div className="community-state-card"><strong>Teman tidak ditemukan</strong><span>Pastikan permintaan pertemanan sudah diterima.</span></div> : <>
        <div className="dm-messages" aria-live="polite">{messages.length ? messages.map(item => <article key={item.id} className={'dm-bubble' + (item.sender_id === currentUserId() ? ' mine' : '')}><p>{item.content}</p><time>{new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}{item.sender_id === currentUserId() && item.read_at ? ' · Dibaca' : ''}</time></article>) : <div className="community-state-card"><Icon name="chat" /><strong>Mulai percakapan</strong><span>Kirim pesan pertama ke {selected.person.username}.</span></div>}</div>
        <form className="dm-compose" onSubmit={submitMessage}><input value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Tulis pesan…" aria-label="Tulis pesan" /><button className="community-submit" disabled={busy || !draft.trim()}><Icon name="send" size={17} /> Kirim</button></form>
      </>}
    </section> : <>
      <section className="friends-search"><div className="friends-search-input"><Icon name="search" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari username (min. 3 karakter)" aria-label="Cari teman" /></div>
        {results.map(person => <div className="friend-row" key={person.id}><CommunityAvatar name={person.username} src={person.avatar_url || undefined} /><div className="friend-copy"><strong>{person.username}</strong><small>Rank {person.rank}</small></div><button type="button" className="community-submit" disabled={busy} onClick={() => void act(() => sendFriendRequest(person.id))}>Tambah</button></div>)}
        {query.trim().length >= 3 && !results.length ? <p className="friends-hint">Tidak ada akun yang cocok atau sudah mencapai batas pencarian.</p> : null}
      </section>
      <div className="friends-tabs" role="tablist"><button role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Teman <b>{data.friends.length}</b></button><button role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Permintaan <b>{data.incoming.length}</b></button></div>
      {loading ? <div className="community-state-card" role="status">Memuat daftar teman…</div> : tab === 'friends' ? <section className="friends-list">{data.friends.map(row => <div className="friend-row" key={row.id}><button type="button" className="friend-open" onClick={() => navigate(`/profile/${row.person.id}`)}><CommunityAvatar name={row.person.username} src={row.person.avatar_url || undefined} /><span className="friend-copy"><strong>{row.person.username}</strong><small>Rank {row.person.rank} · Profil</small></span></button><button type="button" className="community-secondary" onClick={() => navigate(`/friends/${row.person.id}`)}>Chat</button><button type="button" className="community-secondary" disabled={busy} onClick={() => void act(() => removeFriend(row.id))}>Hapus</button></div>)}{!data.friends.length ? <div className="community-state-card"><Icon name="user" /><strong>Belum ada teman</strong><span>Cari username di atas untuk mengirim permintaan.</span></div> : null}</section> : <section className="friends-list">{data.incoming.map(row => <RequestRow key={row.id} row={row} busy={busy} onRespond={(id, accepted) => void act(() => respondFriendRequest(id, accepted))} />)}{data.outgoing.map(row => <div className="friend-row" key={row.id}><CommunityAvatar name={row.person.username} src={row.person.avatar_url || undefined} /><span className="friend-copy"><strong>{row.person.username}</strong><small>Menunggu jawaban</small></span></div>)}{!data.incoming.length && !data.outgoing.length ? <div className="community-state-card"><strong>Tidak ada permintaan</strong><span>Permintaan baru akan muncul di sini.</span></div> : null}</section>}
    </>}
  </main>;
}

function RequestRow({ row, busy, onRespond }: { row: FriendRequest; busy: boolean; onRespond: (id: string, accepted: boolean) => void }) {
  return <div className="friend-row"><CommunityAvatar name={row.person.username} src={row.person.avatar_url || undefined} /><span className="friend-copy"><strong>{row.person.username}</strong><small>Ingin berteman</small></span><button type="button" className="community-secondary" disabled={busy} onClick={() => onRespond(row.id, false)}>Tolak</button><button type="button" className="community-submit" disabled={busy} onClick={() => onRespond(row.id, true)}>Terima</button></div>;
}
function message(error: unknown): string { return error instanceof Error ? error.message : 'Permintaan gagal. Periksa koneksi lalu coba lagi.'; }
