import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../ui/icons';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { closeWatchParty, createWatchParty, getWatchParty, joinWatchParty, leaveWatchParty, listPartyMessages, sendPartyMessage, type WatchParty, type WatchPartyMessage } from '../lib/watchParty';
import { useWatchParty } from '../state/watchParty';

export function WatchPartyView() {
  const { id } = useParams(); const navigate = useNavigate(); const location = useLocation(); const [params] = useSearchParams();
  const active = useWatchParty(s => s.active); const setActive = useWatchParty(s => s.set); const clear = useWatchParty(s => s.clear);
  const [party, setParty] = useState<WatchParty | null>(null); const [messages, setMessages] = useState<WatchPartyMessage[]>([]);
  const [code, setCode] = useState(''); const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const queryAnime = params.get('animeId');
  const anime = (location.state as { anime?: { anime_id: string; title: string; poster: string; episode: string } } | null)?.anime || (queryAnime ? { anime_id: queryAnime, title: params.get('title') || queryAnime, poster: params.get('poster') || '', episode: params.get('episode') || '1' } : null);
  const load = useCallback(async (partyId: string) => {
    try { const [p, m] = await Promise.all([getWatchParty(partyId), listPartyMessages(partyId)]); setParty(p); setMessages(m); setActive(p); setError(''); }
    catch (e) { setError((e as Error).message || 'Gagal memuat room Nobar'); }
  }, [setActive]);
  useEffect(() => { if (id && id !== 'new') void load(id); else if (active && !id) { setParty(active); navigate(`/watch-party/${active.id}`, { replace: true }); } }, [id, active?.id, load, navigate]);
  useEffect(() => {
    if (!party) return;
    const client = getClient();
    const channel = client?.channel(`nanime-party-${party.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'nanime_watch_party_messages', filter: `party_id=eq.${party.id}` }, () => { void load(party.id); }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nanime_watch_parties', filter: `id=eq.${party.id}` }, () => { void load(party.id); }).subscribe();
    const poll = window.setInterval(() => { void load(party.id); }, 10000);
    return () => { window.clearInterval(poll); if (channel) void client?.removeChannel(channel); };
  }, [party?.id, load]);
  const withBusy = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message || 'Aksi gagal'); } finally { setBusy(false); } };
  const create = () => anime && withBusy(async () => { const created = await createWatchParty(anime); setActive(created); setParty(created); navigate(`/watch-party/${created.id}`); });
  const join = (event: FormEvent) => { event.preventDefault(); void withBusy(async () => { const joined = await joinWatchParty(code); setActive(joined); setParty(joined); setCode(''); navigate(`/watch-party/${joined.id}`); }); };
  const message = (event: FormEvent) => { event.preventDefault(); if (!party) return; const value = draft; setDraft(''); void withBusy(async () => { await sendPartyMessage(party.id, value); setMessages(await listPartyMessages(party.id)); }); };
  const leave = () => party && withBusy(async () => { if (party.host_id !== currentUserId()) await leaveWatchParty(party.id); else await closeWatchParty(party.id); clear(); setParty(null); setMessages([]); navigate('/watch-party'); });

  return <main className="friends-page watch-party-page">
    <header className="friends-heading"><button className="ibtn" type="button" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button><div><span className="community-kicker"><Icon name="play" size={14} /> NANIME NOBAR</span><h1>{party ? 'Watch Party' : 'Nobar bareng'}</h1><p>Nonton episode yang sama dan ngobrol dalam satu room.</p></div></header>
    {error ? <div className="community-error" role="alert">{error}<button onClick={() => party ? void load(party.id) : setError('')}>Coba lagi</button></div> : null}
    {!party ? <>
      {anime ? <section className="watch-party-create"><span className="wp-poster">{anime.poster ? <img src={anime.poster} alt="" /> : <Icon name="film" />}</span><div><strong>{anime.title}</strong><small>Episode {anime.episode}</small><button className="community-submit" disabled={busy} type="button" onClick={() => void create()}><Icon name="play" size={16} /> Buat room Nobar</button></div></section> : null}
      <form className="friends-search" onSubmit={join}><label htmlFor="watch-party-code">Gabung dengan kode undangan</label><div className="friends-search-input"><Icon name="users" size={18} /><input id="watch-party-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Masukkan kode room" autoCapitalize="none" required /></div><button className="community-submit" disabled={busy || !code.trim()}><Icon name="right" size={16} /> Gabung Nobar</button></form>
      {active ? <button type="button" className="community-secondary" onClick={() => { setParty(active); navigate(`/watch-party/${active.id}`); }}>Kembali ke room aktif · {active.title}</button> : null}
      <p className="wp-note">Sinkronisasi memerlukan koneksi internet dan setiap peserta memutar sumber video dari Nanime masing-masing.</p>
    </> : <>
      <section className="wp-room-head"><span className="wp-poster">{party.poster ? <img src={party.poster} alt="" /> : <Icon name="film" />}</span><div><strong>{party.title}</strong><small>Episode {party.episode} · {party.is_playing ? 'Sedang diputar' : 'Dijeda'}</small><span>Kode undangan <b>{party.invite_code}</b></span></div><button className="community-secondary" type="button" onClick={() => void navigator.clipboard?.writeText(party.invite_code)}>Salin kode</button></section>
      <button className="community-submit wp-open-anime" type="button" onClick={() => navigate(`/detail/${encodeURIComponent(party.anime_id)}?title=${encodeURIComponent(party.title)}&episode=${encodeURIComponent(party.episode)}&partyId=${encodeURIComponent(party.id)}`)}><Icon name="play" size={16} /> Buka anime dan putar episode {party.episode}</button>
      <section className="dm-panel"><div className="dm-messages" aria-live="polite">{messages.map(item => <article key={item.id} className={'dm-bubble' + (item.user_id === currentUserId() ? ' mine' : '')}><header><CommunityAvatar name={item.username || 'Pengguna'} src={item.avatar_url} /><strong>{item.user_id === currentUserId() ? 'Kamu' : item.username || 'Pengguna Nanime'}</strong></header><p>{item.content}</p><time>{new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</time></article>)}{!messages.length ? <div className="community-state-card"><Icon name="chat" /><strong>Chat room Nobar</strong><span>Ajak teman ngobrol sambil menonton.</span></div> : null}</div><form className="dm-compose" onSubmit={message}><input maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Kirim pesan ke room…" aria-label="Kirim pesan ke room" /><button className="community-submit" disabled={busy || !draft.trim()}><Icon name="send" size={16} /> Kirim</button></form></section>
      <button type="button" className="community-secondary wp-leave" disabled={busy} onClick={() => void leave()}>{party.host_id === currentUserId() ? 'Tutup room untuk semua peserta' : 'Keluar dari room'}</button>
    </>}
  </main>;
}
