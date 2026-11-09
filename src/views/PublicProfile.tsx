import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { Icon } from '../ui/icons';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { sendFriendRequest } from '../lib/friends';
import { formatUsage, RANK_META, rankFor, type RankTier } from '../lib/rank';
import { RankInsignia } from '../ui/RankInsignia';
import { history as remoteHistory } from '../lib/remote/history';
import type { HistoryItem } from '../lib/remote/types';
import { SmartImage } from '../ui/SmartImage';

type PublicPerson = { id: string; username: string; avatar_url: string | null; is_developer: boolean; rank: string };

/** Profil publik: identitas + relasi pertemanan (tanpa fitur ikatan). */
export function PublicProfile() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState<(PublicPerson & { seconds: number }) | null>(null);
  const [relation, setRelation] = useState<'self' | 'friend' | 'incoming' | 'outgoing' | 'none'>('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [publicHistory, setPublicHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const requestId = useRef(0);

  async function load() {
    const request = ++requestId.current;
    const sb = getClient();
    if (!sb || !userId) { setError('Profil tidak dapat dimuat.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: profileError } = await sb.rpc('get_public_profiles', { p_user_ids: [userId] });
      if (profileError) throw profileError;
      const row = ((data || []) as (PublicPerson & { app_usage_seconds?: number })[])[0];
      if (request !== requestId.current) return;
      if (!row) { setPerson(null); setLoading(false); return; }
      const seconds = Number(row.app_usage_seconds) || 0;
      setPerson({ ...row, seconds });
      // Public projection of watch history (excludes sensitive fields)
      void (async () => {
        setHistoryLoading(true);
        try {
          const items = await remoteHistory.pull(userId);
          if (request === requestId.current) setPublicHistory(items.slice(0, 20));
        } catch {
          // RLS may deny or offline – silently hide public history
          if (request === requestId.current) setPublicHistory([]);
        } finally {
          if (request === requestId.current) setHistoryLoading(false);
        }
      })();
      const uid = currentUserId();
      if (uid === userId) setRelation('self');
      else if (uid) {
        const { data: rel, error: relError } = await sb.from('nanime_friend_requests').select('requester_id,recipient_id,status').or(`and(requester_id.eq.${uid},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${uid})`).in('status', ['pending', 'accepted']).maybeSingle();
        if (relError) throw relError;
        if (request !== requestId.current) return;
        setRelation(!rel ? 'none' : rel.status === 'accepted' ? 'friend' : rel.requester_id === uid ? 'outgoing' : 'incoming');
      } else setRelation('none');
    } catch { if (request === requestId.current) setError('Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.'); }
    finally { if (request === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    void load();
    return () => { requestId.current++; };
  }, [userId]);

  async function addFriend() {
    setActionError('');
    setBusy(true);
    try { await sendFriendRequest(userId); setRelation('outgoing'); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Permintaan teman gagal dikirim.'); }
    finally { setBusy(false); }
  }

  if (loading) return <main><div className="hn-spin" role="status" /></main>;
  if (error) return <main>
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <h1 className="hn-pagehead-title">Profil</h1>
      <span style={{ width: 40 }} />
    </header>
    <div className="hn-inline-warn" role="alert">{error}
      <button className="hn-textbtn" type="button" onClick={() => void load()}>Coba lagi</button>
    </div>
  </main>;
  if (!person) return <main>
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <h1 className="hn-pagehead-title">Profil</h1>
      <span style={{ width: 40 }} />
    </header>
    <p className="hn-state">Profil tidak ditemukan.</p>
  </main>;

  const rank: RankTier = rankFor(person.seconds, person.is_developer);

  return <main>
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <h1 className="hn-pagehead-title">Profil Publik</h1>
      <span style={{ width: 40 }} />
    </header>

    <div className="hn-profilehero">
      <CommunityAvatar name={person.username} src={person.avatar_url || undefined} />
      <div className="hn-profilehero-name">
        {person.username}
        {person.is_developer ? <span style={{ color: 'var(--accent-pink)', fontSize: 13, fontWeight: 700 }}>Developer</span> : null}
      </div>
      <span className="hn-profilehero-sub">#{person.id.replace(/-/g, '').slice(0, 8)}</span>
      <div className="hn-avatarrow" style={{ gap: 6 }}>
        <RankInsignia rank={rank} size={18} />
        <span className="hn-profilehero-sub" style={{ color: RANK_META[rank].color }}>{RANK_META[rank].label}</span>
      </div>
      {person.seconds > 0 ? <span className="hn-profilehero-sub">{formatUsage(person.seconds)} aktif</span> : null}
    </div>

    <div style={{ display: 'grid', placeItems: 'center', padding: '8px var(--pad-x) 4px' }}>
      {relation === 'self' ? (
        <button type="button" className="hn-ghostbtn" onClick={() => navigate('/profile')}>Buka profil saya</button>
      ) : relation === 'friend' ? (
        <button type="button" className="hn-btn" onClick={() => navigate(`/friends/${person.id}`)}><Icon name="chat" size={15} /> Kirim pesan</button>
      ) : relation === 'none' ? (
        <button type="button" className="hn-btn" disabled={busy} onClick={() => void addFriend()}><Icon name="user" size={15} /> {busy ? 'Mengirim…' : 'Tambah teman'}</button>
      ) : (
        <span className="hn-profilehero-sub">{relation === 'incoming' ? 'Permintaan teman menunggu jawaban di Teman' : 'Permintaan teman terkirim'}</span>
      )}
      {actionError ? <p className="hn-inline-warn" role="alert">{actionError}</p> : null}
    </div>

    <div className="hn-row" style={{ margin: '18px var(--pad-x)', width: 'auto' }}>
      <span className="hn-menuitem-icon"><Icon name="eye" size={16} strokeWidth={2} /></span>
      <span className="hn-row-main">
        <span className="hn-row-title">Riwayat tontonan publik</span>
        <span className="hn-row-sub">Menampilkan anime & episode yang terakhir ditonton.</span>
      </span>
    </div>
    {historyLoading ? <div className="hn-spin" role="status" /> : publicHistory.length ? (
      <div className="hn-rowlist" style={{ margin: '0 var(--pad-x)' }}>
        {publicHistory.map(h => (
          <button key={`${h.animeId}:${h.episode}`} type="button" className="hn-row" onClick={() => navigate(`/detail/${encodeURIComponent(h.animeId)}`)} style={{ width: '100%' }}>
            {h.poster ? <SmartImage src={h.poster} alt={h.title} animeId={h.animeId} style={{ width: 42, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }} /> : null}
            <span className="hn-row-main">
              <span className="hn-row-title" style={{ display: 'block' }}>{h.title}</span>
              <span className="hn-row-sub">Episode {h.episode} · {h.percent}%{h.completed ? ' · Selesai' : ''}</span>
            </span>
            <Icon name="right" size={16} strokeWidth={2.4} />
          </button>
        ))}
      </div>
    ) : <p className="hn-state-sub" style={{ padding: '0 var(--pad-x)' }}>Belum ada riwayat publik.</p>}
  </main>;
}
