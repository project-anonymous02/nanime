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
  const userId = currentUserId();

  const refreshMessages = useCallback(async (channelId: string) => {
    const rows = await listPublicChatMessages(channelId);
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
    activeIdRef.current = active?.id || null;
    setMessages([]);
    if (!active) { setConnected(false); return; }
    let alive = true;
    setLoadingMessages(true);
    setError('');
    void refreshMessages(active.id).catch(cause => { if (alive) setError((cause as Error)?.message || 'Pesan gagal dimuat.'); })
      .finally(() => { if (alive) setLoadingMessages(false); });
    const sb = getClient();
    if (!sb) return () => { alive = false; };
    const channel = sb.channel(`nanime-public-chat-${active.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nanime_public_chat_messages', filter: `channel_id=eq.${active.id}` }, () => {
        void refreshMessages(active.id).catch(() => undefined);
      })
      .subscribe(status => { if (alive) setConnected(status === 'SUBSCRIBED'); });
    return () => { alive = false; if (activeIdRef.current === active.id) activeIdRef.current = null; setConnected(false); void sb.removeChannel(channel); };
  }, [active?.id, refreshMessages]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, active?.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !text.trim() || sending) return;
    setSending(true); setError('');
    try {
      await sendPublicChatMessage(active.id, text, reply?.id);
      setText(''); setReply(null);
      await refreshMessages(active.id);
    } catch (cause) { setError((cause as Error)?.message || 'Pesan gagal dikirim.'); }
    finally { setSending(false); }
  }

  async function remove(message: PublicChatMessage) {
    try { await deletePublicChatMessage(message.id); if (active) await refreshMessages(active.id); }
    catch (cause) { setError((cause as Error)?.message || 'Pesan gagal dihapus.'); }
  }

  return <div className="public-chat-page">
    <header className="public-chat-header">
      <button type="button" className="ibtn" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <div className="public-chat-title"><span className="eyebrow">NANIME COMMUNITY</span><h1>Public Chat</h1><p><i className={connected ? 'chat-online' : 'chat-offline'} />{connected ? 'Terhubung' : 'Menghubungkan…'}</p></div>
      <button type="button" className="ibtn" aria-label="SocialLine" onClick={() => navigate('/community')}><Icon name="chart" /></button>
    </header>

    {channels.length ? <div className="public-chat-channels" role="tablist" aria-label="Kanal chat">
      {channels.map(channel => <button key={channel.id} type="button" role="tab" aria-selected={active?.id === channel.id} className={active?.id === channel.id ? 'active' : ''} onClick={() => setActive(channel)}># {channel.name}</button>)}
    </div> : null}

    {error ? <div className="public-chat-error" role="alert"><span>{error}{/nanime_public_chat_channels|nanime_public_chat_messages/.test(error) ? ' Terapkan migration 014_public_chat.sql di Supabase.' : ''}</span><button type="button" onClick={() => active && void refreshMessages(active.id)}><Icon name="refresh" size={15} /> Coba lagi</button></div> : null}
    {loadingChannels ? <div className="public-chat-state" role="status"><span className="spinner-sm" />Memuat kanal…</div> : !channels.length ? <div className="public-chat-state"><Icon name="chat" /><strong>Kanal chat belum tersedia</strong><span>Terapkan migration Supabase 014 untuk menyiapkan kanal Umum.</span></div> : null}

    <section className="public-chat-messages" ref={listRef} aria-label="Pesan publik" aria-live="polite">
      {loadingMessages && !messages.length ? <div className="public-chat-state" role="status"><span className="spinner-sm" />Memuat pesan…</div> : null}
      {!loadingMessages && active && !messages.length ? <div className="public-chat-state"><span className="public-chat-empty"><Icon name="chat" /></span><strong>Belum ada pesan di {active.name}</strong><span>Mulai percakapan dengan komunitas.</span></div> : null}
      {messages.map(message => {
        const profile = message.profile;
        const name = profile?.username || (message.user_id === userId ? 'Kamu' : 'Pengguna Nanime');
        const rank = profile ? RANK_META[profile.rank] : null;
        return <article className={'public-chat-message' + (message.user_id === userId ? ' own' : '')} key={message.id}>
          <CommunityAvatar name={name} src={profile?.avatar_url} />
          <div className="public-chat-bubble"><header><strong className={profile?.is_developer ? 'developer' : ''}>{name}</strong>{rank ? <span style={{ color: rank.color }}><RankInsignia rank={profile!.rank} size={14} />{rank.label}</span> : null}<time>{timeLabel(message.created_at)}</time></header>
            {message.reply_to_id ? <span className="public-chat-reply-tag">Membalas pesan</span> : null}
            <p>{message.content}</p>
            <footer>{message.user_id === userId ? <button type="button" onClick={() => void remove(message)} aria-label="Hapus pesan"><Icon name="trash" size={13} /> Hapus</button> : <button type="button" onClick={() => setReply(message)}><Icon name="reply" size={13} /> Balas</button>}</footer>
          </div>
        </article>;
      })}
    </section>

    {active ? <form className="public-chat-composer" onSubmit={event => void submit(event)}>
      {reply ? <div className="public-chat-replying"><span>Membalas <b>{reply.profile?.username || 'Pengguna Nanime'}</b>: {reply.content}</span><button type="button" aria-label="Batal membalas" onClick={() => setReply(null)}><Icon name="x" size={15} /></button></div> : null}
      <textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={1} placeholder={`Kirim pesan ke ${active.name}…`} aria-label="Kirim pesan publik" />
      <button type="submit" disabled={!text.trim() || sending} aria-label="Kirim"><Icon name="send" size={18} />{sending ? '…' : ''}</button>
    </form> : null}
  </div>;
}
