import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getClient } from '../lib/supabase';
import { currentUserId } from '../state/auth';
import { Icon } from '../ui/icons';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { sendFriendRequest } from '../lib/friends';
import { loadPublicAffinities, type AffinityBond } from '../lib/affinity';
import { AffinityMark } from '../ui/AffinityMark';

type PublicPerson = { id: string; username: string; avatar_url: string | null; is_developer: boolean; rank: string };

export function PublicProfile() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PublicPerson | null>(null);
  const [relation, setRelation] = useState<'self' | 'friend' | 'incoming' | 'outgoing' | 'none'>('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [affinities, setAffinities] = useState<AffinityBond[]>([]);

  async function load() {
    const sb = getClient();
    if (!sb || !userId) { setError('Profil tidak dapat dimuat.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: profileError } = await sb.rpc('get_public_profiles', { p_user_ids: [userId] });
      if (profileError) throw profileError;
      const row = ((data || []) as PublicPerson[])[0];
      if (!row) { setPerson(null); setLoading(false); return; }
      setPerson(row);
      const uid = currentUserId();
      if (uid === userId) setRelation('self');
      else if (uid) {
        const { data: rel, error: relError } = await sb.from('nanime_friend_requests').select('requester_id,recipient_id,status').or(`and(requester_id.eq.${uid},recipient_id.eq.${userId}),and(requester_id.eq.${userId},recipient_id.eq.${uid})`).in('status', ['pending','accepted']).maybeSingle();
        if (relError) throw relError;
        setRelation(!rel ? 'none' : rel.status === 'accepted' ? 'friend' : rel.requester_id === uid ? 'outgoing' : 'incoming');
      }
    } catch { setError('Profil belum dapat dimuat. Periksa koneksi lalu coba lagi.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [userId]);
  useEffect(() => {
    let alive = true;
    void loadPublicAffinities(userId).then(rows => { if (alive) setAffinities(rows); }).catch(() => { if (alive) setAffinities([]); });
    return () => { alive = false; };
  }, [userId]);

  async function addFriend() {
    setBusy(true);
    try { await sendFriendRequest(userId); setRelation('outgoing'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Permintaan teman gagal dikirim.'); }
    finally { setBusy(false); }
  }

  return <main className="friends-page public-profile">
    <header className="friends-heading"><button className="ibtn" type="button" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button><div><span className="eyebrow">NANIME COMMUNITY</span><h1>Profil</h1><p>Profil publik dan koneksi komunitas.</p></div></header>
    {loading ? <div className="community-state-card" role="status">Memuat profil…</div> : error ? <div className="community-state-card" role="alert">{error}<button className="community-secondary" type="button" onClick={() => void load()}>Coba lagi</button></div> : !person ? <div className="community-state-card">Profil tidak ditemukan.</div> : <>
      <section className="public-profile-card"><div className="public-profile-banner" /><div className="public-profile-info"><CommunityAvatar name={person.username} src={person.avatar_url || undefined} /><div><h2>{person.username}</h2><p>{person.is_developer ? '#1 · Developer · Level 9999' : `#${person.id.replace(/-/g, '').slice(0, 8)} · Rank ${person.rank}`}</p></div></div>{person.is_developer ? <span className="community-badge developer-chip">Developer · Lvl. 9999</span> : null}
        {relation === 'self' ? <button type="button" className="community-submit" onClick={() => navigate('/profile')}>Buka profil saya</button> : relation === 'friend' ? <button type="button" className="community-submit" onClick={() => navigate(`/friends/${person.id}`)}><Icon name="chat" size={15} /> Kirim pesan</button> : relation === 'none' ? <button type="button" className="community-submit" disabled={busy} onClick={() => void addFriend()}><Icon name="user" size={15} /> {busy ? 'Mengirim…' : 'Tambah teman'}</button> : <span className="public-profile-status">{relation === 'incoming' ? 'Permintaan teman menunggu jawaban di Teman' : 'Permintaan teman terkirim'}</span>}
      </section>
      {affinities.length ? <section className="affinity-public-card"><div className="games-section-head"><div><h2>Ikatan Afinitas</h2><p>Ikatan yang dibagikan oleh akun ini.</p></div></div>{affinities.map(bond => <div className="affinity-public-row" key={bond.id}><CommunityAvatar name={bond.person?.username || 'Teman'} src={bond.person?.avatar_url} /><AffinityMark tier={bond.tier} size={24} active /><div><strong>{bond.person?.username || 'Teman Nanime'}</strong><span>{bond.tier === 'partner' ? 'Pasangan' : bond.tier === 'bros' ? 'Saudara' : bond.tier === 'besties' ? 'Sahabat' : 'Confidant'} · Level {bond.level || 1}</span></div><b>{bond.xp} XP</b></div>)}</section> : null}
      <section className="community-state-card public-profile-private"><Icon name="shield" /><strong>Aktivitas privat</strong><span>Favorit dan riwayat tontonan hanya terlihat oleh pemilik akun.</span></section>
    </>}
  </main>;
}
