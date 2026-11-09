import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { deletePublicChatMessage, listPublicChatChannels, listPublicChatMessages, sendPublicChatMessage, type PublicChatChannel, type PublicChatMessage } from '../lib/publicChat';
import { RANK_META } from '../lib/rank';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { RankInsignia } from '../ui/RankInsignia';
import { Icon } from '../ui/icons';

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Public Chat (Supabase 014): kanal publik, realtime, balas/hapus. */
export function PublicChat() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<PublicChatChannel[]>([]);
  const [active, setActive] = useState<PublicChatChannel | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [reply, setReply] = useState<PublicChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const draftsRef = useRef<Map<string, string>>(new Map());
  const prevActiveIdRef = useRef<string | null>(null);
  const userId = currentUserId();

  const refreshMessages = useCallback(async (channelId: string) => {
    const seq = ++seqRef.current;
    const rows = await listPublicChatMessages(channelId);
    if (seq !== seqRef.current) return;
    if (activeIdRef.current === channelId) setMessages(rows);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingChannels(true);
    setError('');
    void listPublicChatChannels().then(rows => {
      if (!alive) return;
      setChannels(rows);
      setActive(current => current && rows.some(row => row.id === current.id) ? current : rows[0] || null);
    }).catch(cause => {
      if (alive) setError((cause as Error)?.message || 'Daftar kanal gagal dimuat.');
    }).finally(() => { if (alive) setLoadingChannels(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const prevId = prevActiveIdRef.current;
    const nextId = active?.id || null;
    if (prevId && prevId !== nextId) {
      draftsRef.current.set(prevId, text);
      setReply(null); // prevent cross-channel reply
    }
    if (nextId) setText(draftsRef.current.get(nextId) || '');
    prevActiveIdRef.current = nextId;
    activeIdRef.current = nextId;
    setMessages([]);
    if (!active) { setConnected(false); return; }
    let alive = true;
    setLoadingMessages(true);
    setError('');
    void refreshMessages(active.id).catch(cause => { if (alive) setError((cause as Error)?.message || 'Pesan gagal dimuat.'); })
      .finally(() => { if (alive) setLoadingMessages(false); });
    const sb = getClient();
    if (!sb) return () => { alive = false; };
    let pendingTimer: number | null = null;
    const channel = sb.channel(`nanime-public-chat-${active.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nanime_public_chat_messages', filter: `channel_id=eq.${active.id}` }, () => {
        if (pendingTimer) window.clearTimeout(pendingTimer);
        pendingTimer = window.setTimeout(() => { pendingTimer = null; void refreshMessages(active.id).catch(() => undefined); }, 250);
      })
      .subscribe(status => { if (alive) setConnected(status === 'SUBSCRIBED'); });
    return () => { alive = false; if (pendingTimer) window.clearTimeout(pendingTimer); if (activeIdRef.current === active.id) activeIdRef.current = null; setConnected(false); void sb.removeChannel(channel); };
  }, [active?.id, refreshMessages]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const onChatScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    nearBottomRef.current = distanceFromBottom < 120;
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list && nearBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [messages.length, active?.id]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 144) + 'px';
  }, [text]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !text.trim() || sending) return;
    const sentChannelId = active.id;
    const sentText = text;
    const sentReplyId = reply?.id;
    setSending(true); setError('');
    try {
      await sendPublicChatMessage(sentChannelId, sentText, sentReplyId);
      draftsRef.current.set(sentChannelId, '');
      if (activeIdRef.current === sentChannelId) {
        setText('');
        setReply(null);
      }
      await refreshMessages(sentChannelId);
    } catch (cause) { setError((cause as Error)?.message || 'Pesan gagal dikirim.'); }
    finally { setSending(false); }
  }

  async function remove(message: PublicChatMessage) {
    try { await deletePublicChatMessage(message.id); if (active) await refreshMessages(active.id); }
    catch (cause) { setError((cause as Error)?.message || 'Pesan gagal dihapus.'); }
  }

  return <div className="hn-chatscreen">
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <div style={{ flex: 1 }}>
        <h1 className="hn-pagehead-title">Public Chat</h1>
        <p className="hn-profilehero-sub"><span className="hn-dot" style={{ display: 'inline-block', background: connected ? 'var(--accent-green)' : 'var(--accent-orange)', boxShadow: 'none' }} /> {connected ? 'Terhubung langsung' : 'Menghubungkan…'}</p>
      </div>
    </header>

    {channels.length ? <div className="hn-datetabs no-scrollbar" role="tablist" aria-label="Kanal chat">
      {channels.map(channel => <button key={channel.id} type="button" role="tab" aria-selected={active?.id === channel.id} className={`hn-datetab${active?.id === channel.id ? ' hn-active' : ''}`} onClick={() => setActive(channel)}>#{channel.name}</button>)}
    </div> : null}

    {error ? <div className="hn-inline-warn" role="alert"><span>{error}{/nanime_public_chat_channels|nanime_public_chat_messages/.test(error) ? ' Terapkan migration 014_public_chat.sql di Supabase.' : ''}</span>
      <button type="button" className="hn-textbtn" onClick={() => active && void refreshMessages(active.id)}><Icon name="refresh" size={15} /> Coba lagi</button>
    </div> : null}
    {loadingChannels ? <div className="hn-spin" role="status" /> : !channels.length ? <div className="hn-state"><span className="hn-state-icon"><Icon name="chat" /></span><span className="hn-state-title">Kanal chat belum tersedia</span><span className="hn-state-sub">Terapkan migration Supabase 014 untuk menyiapkan kanal Umum.</span></div> : null}

    <section className="hn-chatlog" ref={listRef} onScroll={onChatScroll} aria-label="Pesan publik" aria-live="polite">
      {loadingMessages && !messages.length ? <div className="hn-spin" role="status" /> : null}
      {!loadingMessages && active && !messages.length ? <div className="hn-state"><span className="hn-state-icon"><Icon name="chat" /></span><span className="hn-state-title">Belum ada pesan di #{active.name}</span><span className="hn-state-sub">Mulai percakapan dengan komunitas.</span></div> : null}
      {messages.map(message => {
        const profile = message.profile;
        const mine = message.user_id === userId;
        const name = profile?.username || (mine ? 'Kamu' : 'Pengguna Nanime');
        const rankMeta = profile ? RANK_META[profile.rank] : null;
        return <article className={`hn-chatrow${mine ? ' hn-mine' : ''}`} key={message.id}>
          {mine ? null : <CommunityAvatar name={name} src={profile?.avatar_url} />}
          <div className="hn-bubble">
            <header style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {rankMeta ? <RankInsignia rank={profile!.rank} size={14} /> : null}
              <span className="hn-bubble-name">{name}</span>
              {profile?.is_developer ? <span style={{ color: 'var(--accent-pink)', fontSize: 9, fontWeight: 800 }}>DEV</span> : null}
            </header>
            <p className="hn-bubble-text">{message.content}</p>
            <footer style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <time className="hn-bubble-time">{timeLabel(message.created_at)}</time>
              {mine ? (
                <button type="button" className="hn-textbtn" style={{ pointerEvents: 'auto' }} onClick={() => void remove(message)} aria-label="Hapus pesan"><Icon name="trash" size={11} /></button>
              ) : (
                <button type="button" className="hn-textbtn" onClick={() => setReply(message)} aria-label="Balas pesan"><Icon name="reply" size={11} /> Balas</button>
              )}
            </footer>
          </div>
        </article>;
      })}
    </section>

    {active ? <form className="hn-chatbar hn-chatbar-v2" data-lg-role="dock" onSubmit={event => void submit(event)}>
      {reply ? <div className="hn-chat-reply">
        <span className="hn-typinghint">Membalas <b>{reply.profile?.username || 'Pengguna Nanime'}</b> · {reply.content.slice(0, 60)}</span>
        <button type="button" aria-label="Batal membalas" onClick={() => setReply(null)}><Icon name="x" size={14} /></button>
      </div> : null}
      <div className="hn-chat-inputrow">
        <textarea ref={textareaRef} className="hn-chatinput" value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={1} placeholder={`Kirim pesan ke ${active.name}…`} aria-label="Kirim pesan publik" />
        <button className="hn-chatsend" type="submit" disabled={!text.trim() || sending} aria-label="Kirim"><Icon name="send" size={18} strokeWidth={2} /></button>
      </div>
    </form> : null}
  </div>;
}
