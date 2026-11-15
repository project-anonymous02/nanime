import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { deletePublicChatMessage, listPublicChatChannels, listPublicChatMessages, replyPreviewText, sendPublicChatMessage, type PublicChatChannel, type PublicChatMessage } from '../lib/publicChat';
import { RANK_META, type RankTier } from '../lib/rank';
import { clockLabel } from '../lib/format';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { RankInsignia } from '../ui/RankInsignia';
import { Icon } from '../ui/icons';

/** Batas tinggi textarea komposer (sama dengan --chat input max-height). */
const INPUT_MAX_HEIGHT = 144;
const INPUT_MIN_HEIGHT = 44;

interface MessageRowProps {
  id: string;
  content: string;
  createdAt: string;
  mine: boolean;
  name: string;
  avatarUrl: string | null;
  rank: RankTier | null;
  isDeveloper: boolean;
  /** Konteks balasan — primitif agar memo tidak selalu berlaku. */
  replyId: string | null;
  replyAuthor: string | null;
  replyPreview: string | null;
  replyAvailable: boolean;
  /** Pesan induk masih ada di daftar yang tampil → bisa dituju. */
  canJump: boolean;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  onJump: (id: string) => void;
  registerRow: (id: string, node: HTMLDivElement | null) => void;
}

/**
 * Satu baris pesan.
 *
 * Semua prop sengaja berupa primitif + callback stabil, dan komponen ini
 * dibungkus `memo`: menulis di komposer (state teks) tidak boleh
 * me-render ulang seluruh daftar.
 */
const MessageRow = memo(function MessageRow({
  id, content, createdAt, mine, name, avatarUrl, rank, isDeveloper,
  replyId, replyAuthor, replyPreview, replyAvailable,
  canJump, onReply, onDelete, onJump, registerRow
}: MessageRowProps) {
  const replyBody = replyId ? (
    <>
      <span className="hn-bubble-reply-name">{replyAuthor}</span>
      <span className="hn-bubble-reply-text">{replyPreview}</span>
    </>
  ) : null;

  return <article className={`hn-chatrow${mine ? ' hn-mine' : ''}`} data-message-id={id}>
    {mine ? null : <CommunityAvatar name={name} src={avatarUrl} />}
    <div className="hn-bubble" ref={node => registerRow(id, node)}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {rank ? <RankInsignia rank={rank} size={14} /> : null}
        <span className="hn-bubble-name">{name}</span>
        {isDeveloper ? <span style={{ color: 'var(--accent-pink)', fontSize: 9, fontWeight: 800 }}>DEV</span> : null}
      </header>
      {replyId ? (canJump && replyAvailable
        ? <button type="button" className="hn-bubble-reply" onClick={() => onJump(replyId)} aria-label={`Lihat pesan ${replyAuthor} yang dibalas`}>{replyBody}</button>
        : <div className={`hn-bubble-reply${replyAvailable ? '' : ' hn-missing'}`}>{replyBody}</div>) : null}
      <p className="hn-bubble-text">{content}</p>
      <footer style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        <time className="hn-bubble-time">{clockLabel(createdAt)}</time>
        <button type="button" className="hn-textbtn" onClick={() => onReply(id)} aria-label="Balas pesan"><Icon name="reply" size={11} /> Balas</button>
        {mine ? (
          <button type="button" className="hn-textbtn" style={{ pointerEvents: 'auto' }} onClick={() => onDelete(id)} aria-label="Hapus pesan"><Icon name="trash" size={11} /></button>
        ) : null}
      </footer>
    </div>
  </article>;
});

interface ComposerProps {
  channelId: string;
  channelName: string;
  reply: PublicChatMessage | null;
  sending: boolean;
  onCancelReply: () => void;
  onSend: (text: string) => Promise<boolean>;
}

/**
 * Komposer pesan. State teks hidup DI SINI, bukan di level halaman: sehingga
 * mengetik tidak memicu render ulang seluruh daftar pesan.
 */
function ChatComposer({ channelId, channelName, reply, sending, onCancelReply, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const textRef = useRef('');
  const draftsRef = useRef<Map<string, string>>(new Map());
  const prevChannelRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyText = useCallback((value: string) => {
    textRef.current = value;
    setText(value);
  }, []);

  /* Draf per kanal: pindah kanal menyimpan & memulihkan isi (perilaku lama). */
  useEffect(() => {
    const prev = prevChannelRef.current;
    if (prev === channelId) return;
    if (prev) draftsRef.current.set(prev, textRef.current);
    applyText(draftsRef.current.get(channelId) || '');
    prevChannelRef.current = channelId;
  }, [channelId, applyText]);

  /* Autosize: baca tinggi konten dulu, tulis hanya bila memang berubah.
     Versi lama menulis `height:auto` dulu (membatalkan layout) lalu membaca
     `scrollHeight` → 3 layout paksa per ketikan. */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const needed = Math.min(Math.max(ta.scrollHeight, INPUT_MIN_HEIGHT), INPUT_MAX_HEIGHT);
    const current = ta.clientHeight;
    if (Math.abs(needed - current) < 1) return;
    if (needed < current) ta.style.height = 'auto';
    ta.style.height = needed + 'px';
  }, [text]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = textRef.current;
    if (!value.trim() || sending) return;
    const ok = await onSend(value);
    if (!ok) return;
    applyText('');
    draftsRef.current.set(channelId, '');
  }

  return <form className="hn-chatbar hn-chatbar-v2" data-lg-role="dock" onSubmit={event => void submit(event)}>
    {reply ? <div className="hn-chat-reply">
      <span className="hn-typinghint">Membalas <b>{reply.profile?.username || 'Pengguna Nanime'}</b> · {replyPreviewText(reply.content)}</span>
      <button type="button" aria-label="Batal membalas" onClick={onCancelReply}><Icon name="x" size={14} /></button>
    </div> : null}
    <div className="hn-chat-inputrow">
      <textarea ref={textareaRef} className="hn-chatinput" value={text} onChange={event => applyText(event.target.value)} maxLength={2000} rows={1} placeholder={`Kirim pesan ke ${channelName}…`} aria-label="Kirim pesan publik" />
      <button className="hn-chatsend" type="submit" disabled={!text.trim() || sending} aria-label="Kirim"><Icon name="send" size={18} strokeWidth={2} /></button>
    </div>
  </form>;
}

/** Public Chat (Supabase 014): kanal publik, realtime, balas/hapus. */
export function PublicChat() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<PublicChatChannel[]>([]);
  const [active, setActive] = useState<PublicChatChannel | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [reply, setReply] = useState<PublicChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const prevActiveIdRef = useRef<string | null>(null);
  const messagesRef = useRef<PublicChatMessage[]>([]);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
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
      setReply(null); // prevent cross-channel reply
    }
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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && active?.id) {
        void refreshMessages(active.id).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [active?.id, refreshMessages]);

  /* Balasan yang dituju tidak boleh menggantung ke pesan yang sudah hilang. */
  useEffect(() => {
    if (!reply) return;
    if (!messages.some(message => message.id === reply.id)) setReply(null);
  }, [messages, reply]);

  /* Handler balasan membaca daftar terbaru tanpa harus dibuat ulang tiap render. */
  useEffect(() => { messagesRef.current = messages; }, [messages]);

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

  const onReply = useCallback((id: string) => {
    const target = messagesRef.current.find(message => message.id === id);
    if (target) setReply(target);
  }, []);

  const onDelete = useCallback(async (id: string) => {
    try {
      await deletePublicChatMessage(id);
      const channelId = activeIdRef.current;
      if (channelId) await refreshMessages(channelId);
    } catch (cause) { setError((cause as Error)?.message || 'Pesan gagal dihapus.'); }
  }, [refreshMessages]);

  const onJump = useCallback((id: string) => {
    const row = rowRefs.current.get(id);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('hn-flash');
    window.setTimeout(() => row.classList.remove('hn-flash'), 1400);
  }, []);

  const registerRow = useCallback((id: string, node: HTMLElement | null) => {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  }, []);

  const onSend = useCallback(async (value: string) => {
    if (!active) return false;
    const channelId = active.id;
    const replyId = reply?.id ?? null;
    setSending(true); setError('');
    try {
      await sendPublicChatMessage(channelId, value, replyId);
      if (activeIdRef.current === channelId) setReply(null);
      await refreshMessages(channelId);
      return true;
    } catch (cause) {
      setError((cause as Error)?.message || 'Pesan gagal dikirim.');
      return false;
    } finally { setSending(false); }
  }, [active, reply, refreshMessages]);

  const messageIds = useMemo(() => new Set(messages.map(message => message.id)), [messages]);

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
        return <MessageRow
          key={message.id}
          id={message.id}
          content={message.content}
          createdAt={message.created_at}
          mine={mine}
          name={name}
          avatarUrl={profile?.avatar_url ?? null}
          rank={rankMeta ? profile!.rank : null}
          isDeveloper={Boolean(profile?.is_developer)}
          replyId={message.reply?.id ?? null}
          replyAuthor={message.reply?.author ?? null}
          replyPreview={message.reply?.preview ?? null}
          replyAvailable={Boolean(message.reply?.available)}
          canJump={Boolean(message.reply && messageIds.has(message.reply.id))}
          onReply={onReply}
          onDelete={onDelete}
          onJump={onJump}
          registerRow={registerRow}
        />;
      })}
    </section>

    {active ? <ChatComposer
      channelId={active.id}
      channelName={active.name}
      reply={reply}
      sending={sending}
      onCancelReply={() => setReply(null)}
      onSend={onSend}
    /> : null}
  </div>;
}
