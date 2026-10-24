import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { Icon } from '../ui/icons';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { sendFriendRequest } from '../lib/friends';
import { formatUsage, RANK_META, rankFor, type RankTier } from '../lib/rank';
import { RankInsignia } from '../ui/RankInsignia';

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

  async function load() {
    const sb = getClient();
    if (!sb || !userId) { setError('Profil tidak dapat dimuat.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: profileError } = await sb.rpc('get_public_profiles', { p_user_ids: [userId] });
      if (profileError) throw profileError;
      const row = ((data || []) as (PublicPerson & { app_usage_seconds?: number })[])[0];
      if (!row) { setPerson(null); setLoading(false); return; }
      const seconds = Number(row.app_usage_seconds) || 0;
      setPerson({ ...row, seconds });
      const uid = currentUserId();
      if (uid === userId) setRelation('self');
      else if (uid) {
        const { data: rel, error: relError } = await sb.from('nanime_friend_requests').select('requester_id,recipient_id,status').or(`and(requester_id.eq.${uid},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${uid})`).in('status', ['pending', 'accepted']).maybeSingle();
        if (relError) throw relError;
        setRelation(!rel ? 'none' : rel.status === 'accepted' ? 'friend' : rel.requester_id === uid ? 'outgoing' : 'incoming');
      }
    } catch { setError('Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [userId]);

  async function addFriend() {
    setBusy(true);
    try { await sendFriendRequest(userId); setRelation('outgoing'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Permintaan teman gagal dikirim.'); }
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
    </div>

    <div className="hn-row" style={{ margin: '18px var(--pad-x)', width: 'auto' }}>
      <span className="hn-menuitem-icon"><Icon name="shield" size={16} strokeWidth={2} /></span>
      <span className="hn-row-main">
        <span className="hn-row-title">Aktivitas privat</span>
        <span className="hn-row-sub">Favorit dan riwayat tontonan hanya terlihat oleh pemilik akun.</span>
      </span>
    </div>
  </main>;
}
