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

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return <main>
    <header className="hn-pagehead">
      {friendId ? <button className="hn-back" type="button" aria-label="Kembali ke daftar teman" onClick={() => navigate('/friends')}><Icon name="left" /></button> : <span style={{ width: 40 }} />}
      <div style={{ flex: 1 }}>
        <span className="hn-profilehero-sub" style={{ gap: 4 }}><Icon name="user" size={14} /> NANIME SOCIAL</span>
        <h1 className="hn-pagehead-title">{friendId ? selected?.person.username || 'Percakapan' : 'Teman & Chat'}</h1>
      </div>
      <button type="button" className="hn-iconbtn" aria-label="Muat ulang" onClick={() => { setLoading(true); void refresh(); }}><Icon name="refresh" /></button>
    </header>
    {error ? <div className="hn-inline-warn" role="alert">{error}<button type="button" className="hn-textbtn" onClick={() => void refresh()}> Coba lagi</button></div> : null}

    {friendId ? <section className="hn-chatscreen" style={{ height: 'auto', minHeight: '60dvh' }}>
      {!selected ? <div className="hn-state"><strong className="hn-state-title">Teman tidak ditemukan</strong><span className="hn-state-sub">Pastikan permintaan pertemanan sudah diterima.</span></div> : <>
        <div className="hn-chatlog" aria-live="polite">
          {messages.length ? messages.map(item => {
            const mine = item.sender_id === currentUserId();
            return <article key={item.id} className={`hn-chatrow${mine ? ' hn-mine' : ''}`}>
              <div className="hn-bubble">
                <p className="hn-bubble-text">{item.content}</p>
                <time className="hn-bubble-time">{timeOf(item.created_at)}{mine && item.read_at ? ' · Dibaca' : ''}</time>
              </div>
            </article>;
          }) : <div className="hn-state"><span className="hn-state-icon"><Icon name="chat" size={26} /></span><strong className="hn-state-title">Mulai percakapan</strong><span className="hn-state-sub">Kirim pesan pertama ke {selected.person.username}.</span></div>}
        </div>
        <form className="hn-chatbar" onSubmit={submitMessage}>
          <input className="hn-chatinput" style={{ width: 'auto', flex: 1, minWidth: 0 }} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Tulis pesan…" aria-label="Tulis pesan" />
          <button className="hn-chatsend" type="submit" disabled={busy || !draft.trim()}><Icon name="send" size={17} /> Kirim</button>
        </form>
      </>}
    </section> : <>
      <section className="hn-section">
        <div className="hn-searchbar" style={{ margin: '8px var(--pad-x) 12px' }}>
          <Icon name="search" size={17} />
          <input className="hn-searchinput" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari username (min. 3 karakter)" aria-label="Cari teman" />
        </div>
        {results.map(person => <div className="hn-avatarrow" key={person.id} style={{ padding: '6px var(--pad-x)', color: 'inherit' }}>
          <CommunityAvatar name={person.username} src={person.avatar_url || undefined} />
          <span className="hn-avatarrow-main">
            <span className="hn-avatarrow-name">{person.username}</span>
            <small className="hn-avatarrow-sub">Rank {person.rank}</small>
          </span>
          <button type="button" className="hn-ghostbtn" disabled={busy} onClick={() => void act(() => sendFriendRequest(person.id))}>Tambah</button>
        </div>)}
        {query.trim().length >= 3 && !results.length ? <p className="hn-typinghint">Tidak ada akun yang cocok atau sudah mencapai batas pencarian.</p> : null}
      </section>
      <div className="hn-chiprow" role="tablist" style={{ marginTop: 8 }}>
        <button role="tab" aria-selected={tab === 'friends'} className={`hn-chip${tab === 'friends' ? ' hn-active' : ''}`} onClick={() => setTab('friends')}>Teman <b>{data.friends.length}</b></button>
        <button role="tab" aria-selected={tab === 'requests'} className={`hn-chip${tab === 'requests' ? ' hn-active' : ''}`} onClick={() => setTab('requests')}>Permintaan <b>{data.incoming.length}</b></button>
      </div>
      {loading ? <div className="hn-spin" role="status" style={{ width: 'fit-content', margin: '20px auto' }} /> : tab === 'friends' ? <section className="hn-section">
        <div className="hn-rowlist">
          {data.friends.map(row => <div className="hn-row" key={row.id} style={{ color: 'inherit' }}>
            <button type="button" className="hn-avatarrow" style={{ flex: 1, color: 'inherit' }} onClick={() => navigate(`/profile/${row.person.id}`)}>
              <CommunityAvatar name={row.person.username} src={row.person.avatar_url || undefined} />
              <span className="hn-avatarrow-main">
                <span className="hn-avatarrow-name">{row.person.username}</span>
                <small className="hn-avatarrow-sub">Rank {row.person.rank} · Profil</small>
              </span>
            </button>
            <span className="hn-row-actions">
              <button type="button" className="hn-ghostbtn" onClick={() => navigate(`/friends/${row.person.id}`)}>Chat</button>
              <button type="button" className="hn-ghostbtn" disabled={busy} onClick={() => void act(() => removeFriend(row.id))}>Hapus</button>
            </span>
          </div>)}
        </div>
        {!data.friends.length ? <div className="hn-state"><span className="hn-state-icon"><Icon name="user" size={26} /></span><strong className="hn-state-title">Belum ada teman</strong><span className="hn-state-sub">Cari username di atas untuk mengirim permintaan.</span></div> : null}
      </section> : <section className="hn-section">
        <div className="hn-rowlist">
          {data.incoming.map(row => <RequestRow key={row.id} row={row} busy={busy} onRespond={(id, accepted) => void act(() => respondFriendRequest(id, accepted))} />)}
          {data.outgoing.map(row => <div className="hn-row" key={row.id} style={{ color: 'inherit' }}>
            <CommunityAvatar name={row.person.username} src={row.person.avatar_url || undefined} />
            <span className="hn-avatarrow-main">
              <span className="hn-avatarrow-name">{row.person.username}</span>
              <small className="hn-avatarrow-sub">Menunggu jawaban</small>
            </span>
          </div>)}
        </div>
        {!data.incoming.length && !data.outgoing.length ? <div className="hn-state"><strong className="hn-state-title">Tidak ada permintaan</strong><span className="hn-state-sub">Permintaan baru akan muncul di sini.</span></div> : null}
      </section>}
    </>}
  </main>;
}

function RequestRow({ row, busy, onRespond }: { row: FriendRequest; busy: boolean; onRespond: (id: string, accepted: boolean) => void }) {
  return <div className="hn-row" style={{ color: 'inherit' }}>
    <CommunityAvatar name={row.person.username} src={row.person.avatar_url || undefined} />
    <span className="hn-avatarrow-main">
      <span className="hn-avatarrow-name">{row.person.username}</span>
      <small className="hn-avatarrow-sub">Ingin berteman</small>
    </span>
    <span className="hn-row-actions">
      <button type="button" className="hn-ghostbtn" disabled={busy} onClick={() => onRespond(row.id, false)}>Tolak</button>
      <button type="button" className="hn-ghostbtn" disabled={busy} onClick={() => onRespond(row.id, true)}>Terima</button>
    </span>
  </div>;
}
function message(error: unknown): string { return error instanceof Error ? error.message : 'Permintaan gagal. Periksa koneksi lalu coba lagi.'; }
