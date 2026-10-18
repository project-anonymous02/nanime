import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { Icon } from '../ui/icons';
import { AffinityMark } from '../ui/AffinityMark';
import { currentUserId } from '../state/auth';
import { ConfirmModal } from '../ui/Sheet';
import { closeAffinity, claimAffinityMission, loadAffinity, loadAffinityLeaderboard, loadBondMissions, proposeAffinity, respondAffinity, setAffinityPrivacy, type AffinityBond, type AffinityLeaderboardRow, type AffinityMission, type AffinityPrivacy, type AffinitySummary, type AffinityTier } from '../lib/affinity';
import { searchPeople, type FriendProfile } from '../lib/friends';

const tierNames: Record<AffinityTier, string> = { partner: 'Pasangan', bros: 'Saudara', besties: 'Sahabat', confidants: 'Confidant' };
const privacyNames: Record<AffinityPrivacy, string> = { private: 'Pribadi', friends: 'Teman saja', public: 'Publik' };

export function Affinity() {
  const navigate = useNavigate();
  const me = currentUserId();
  const [summary, setSummary] = useState<AffinitySummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<AffinityLeaderboardRow[]>([]);
  const [missions, setMissions] = useState<AffinityMission[]>([]);
  const [expanded, setExpanded] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [selected, setSelected] = useState<FriendProfile | null>(null);
  const [tier, setTier] = useState<AffinityTier>('partner');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [endingBond, setEndingBond] = useState<AffinityBond | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [next, ranks] = await Promise.all([loadAffinity(), loadAffinityLeaderboard()]);
      setSummary(next); setLeaderboard(ranks);
    } catch (cause) { setError((cause as Error).message || 'Afinitas belum dapat dimuat.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) { setResults([]); return; }
    let live = true;
    const timer = window.setTimeout(() => { void searchPeople(term).then(rows => { if (live) setResults(rows); }).catch(cause => { if (live) setError((cause as Error).message); }); }, 280);
    return () => { live = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!expanded) { setMissions([]); return; }
    let live = true;
    void loadBondMissions(expanded).then(rows => { if (live) setMissions(rows); }).catch(cause => { if (live) setError((cause as Error).message); });
    return () => { live = false; };
  }, [expanded, summary]);

  const pendingIn = useMemo(() => summary?.bonds.filter(b => b.status === 'pending' && b.partner_id === me) || [], [summary, me]);
  const pendingOut = useMemo(() => summary?.bonds.filter(b => b.status === 'pending' && b.proposer_id === me) || [], [summary, me]);
  const active = useMemo(() => summary?.bonds.filter(b => b.status === 'active') || [], [summary]);
  const older = useMemo(() => summary?.bonds.filter(b => ['broken', 'rejected', 'cancelled'].includes(b.status)) || [], [summary]);
  const selectedTier = summary?.tiers.find(item => item.tier === tier);

  async function act(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); await refresh(); }
    catch (cause) { setError((cause as Error).message || 'Aksi Afinitas gagal.'); }
    finally { setBusy(false); }
  }
  function submitProposal(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    void act(async () => { await proposeAffinity(selected.id, tier, message); setSelected(null); setQuery(''); setMessage(''); setResults([]); });
  }

  const renderBond = (bond: AffinityBond) => {
    const isIncoming = bond.status === 'pending' && bond.partner_id === me;
    const person = bond.person || { id: bond.proposer_id === me ? bond.partner_id : bond.proposer_id, username: 'Pengguna Nanime', avatar_url: null, rank: 'bronze' };
    const thisTier = summary?.tiers.find(item => item.tier === bond.tier);
    const currentLevel = [...(summary?.levels || [])].reverse().find(item => bond.xp >= item.xp_required) || summary?.levels[0];
    const nextLevel = summary?.levels.find(item => item.xp_required > bond.xp);
    const progress = nextLevel && currentLevel ? Math.min(100, Math.round((bond.xp - currentLevel.xp_required) / (nextLevel.xp_required - currentLevel.xp_required) * 100)) : 100;
    const open = expanded === bond.id;
    return <article className={'affinity-card' + (bond.status === 'active' ? ' is-active' : '')} key={bond.id}>
      <header className="affinity-card-person"><CommunityAvatar name={person.username} src={person.avatar_url} /><AffinityMark tier={bond.tier} active={bond.status === 'active'} /><div><strong>{person.username}</strong><span>{thisTier?.label || tierNames[bond.tier]} · {bond.status === 'active' ? 'Aktif' : bond.status === 'pending' ? (isIncoming ? 'Menunggu jawabanmu' : 'Menunggu jawaban') : bond.status === 'broken' ? 'Ikatan berakhir' : 'Tidak aktif'}</span></div>{bond.status === 'active' ? <button type="button" className="affinity-expand" aria-expanded={open} onClick={() => setExpanded(open ? '' : bond.id)}>{open ? 'Tutup' : 'Lihat'} <Icon name={open ? 'up' : 'down'} size={14} /></button> : null}</header>
      {bond.message ? <p className="affinity-message">“{bond.message}”</p> : null}
      {bond.status === 'active' ? <div className="affinity-progression"><div><strong>Level {currentLevel?.level || 1}</strong><span>{currentLevel?.unlock_title || 'Awal Kedekatan'} · {bond.xp} XP</span></div><div className="affinity-xp-track"><span style={{ width: `${progress}%` }} /></div><small>{nextLevel ? `${Math.max(0, nextLevel.xp_required - bond.xp)} XP ke level ${nextLevel.level}` : 'Level maksimal'}</small></div> : null}
      {isIncoming ? <div className="affinity-actions"><button type="button" className="community-submit" disabled={busy} onClick={() => void act(() => respondAffinity(bond.id, 'accept'))}><Icon name="check" size={15} /> Terima</button><button type="button" className="community-secondary" disabled={busy} onClick={() => void act(() => respondAffinity(bond.id, 'reject'))}>Tolak</button></div> : bond.status === 'pending' && bond.proposer_id === me ? <button type="button" className="community-secondary" disabled={busy} onClick={() => void act(() => closeAffinity(bond.id, 'cancel'))}>Batalkan proposal</button> : null}
      {open ? <div className="affinity-missions"><div className="games-section-head"><div><h2>Misi hari ini</h2><p>Hadiah menambah XP ikatan.</p></div></div>{missions.map(mission => <div className="affinity-mission" key={mission.mission_id}><div><strong>{mission.label}</strong><span>+{mission.xp_reward} XP</span></div><button type="button" disabled={busy || mission.claimed} onClick={() => void act(async () => { await claimAffinityMission(bond.id, mission.mission_id); setMissions(await loadBondMissions(bond.id)); })}>{mission.claimed ? 'Selesai' : 'Klaim'}</button></div>)}{!missions.length ? <p className="friends-hint">Memuat misi atau belum ada misi.</p> : null}<button type="button" className="affinity-break" disabled={busy} onClick={() => setEndingBond(bond)}>Akhiri ikatan</button></div> : null}
    </article>;
  };

  return <main className="friends-page affinity-page">
    <header className="friends-heading"><button className="ibtn" type="button" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button><div><span className="community-kicker"><Icon name="heartFill" size={14} /> NANIME SOCIAL</span><h1>Afinitas</h1><p>Bangun ikatan, selesaikan misi, dan kumpulkan XP bersama teman.</p></div></header>
    {error ? <div className="community-error" role="alert">{error}<button type="button" onClick={() => void refresh()}>Coba lagi</button></div> : null}
    {loading && !summary ? <div className="community-state-card" role="status">Memuat ikatan Afinitas…</div> : null}
    {summary ? <>
      <section className="affinity-privacy"><div><strong>Privasi Afinitas</strong><span>{privacyNames[summary.privacy]} dapat melihat ikatan aktifmu.</span></div><select aria-label="Privasi Afinitas" value={summary.privacy} disabled={busy} onChange={event => void act(() => setAffinityPrivacy(event.target.value as AffinityPrivacy))}>{Object.entries(privacyNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></section>
      <section className="affinity-slots"><div className="games-section-head"><div><h2>Slot ikatan</h2><p>Slot mengikuti batas kategori akun.</p></div></div><div className="affinity-slot-grid">{summary.tiers.map(item => <div className="affinity-slot" key={item.tier}><strong>{item.label}</strong><span>{item.used}/{item.max_slots}</span><i><b style={{ width: `${Math.min(100, item.used / item.max_slots * 100)}%` }} /></i></div>)}</div></section>
      <section className="affinity-propose"><div className="games-section-head"><div><h2>Ajukan ikatan</h2><p>Kamu dan teman perlu berteman di Nanime lebih dulu.</p></div></div><div className="friends-search-input"><Icon name="search" size={17} /><input value={query} onChange={event => { setQuery(event.target.value); setSelected(null); }} placeholder="Cari teman berdasarkan username" aria-label="Cari teman untuk Afinitas" /></div>{results.map(person => <button className={'affinity-result' + (selected?.id === person.id ? ' selected' : '')} key={person.id} type="button" onClick={() => { setSelected(person); setResults([]); }}><CommunityAvatar name={person.username} src={person.avatar_url} /><span>{person.username}</span><small>{selected?.id === person.id ? 'Dipilih' : 'Pilih'}</small></button>)}{selected ? <form className="affinity-proposal-form" onSubmit={submitProposal}><div className="affinity-selected"><CommunityAvatar name={selected.username} src={selected.avatar_url} /><strong>{selected.username}</strong><button type="button" aria-label="Hapus pilihan teman" onClick={() => setSelected(null)}><Icon name="x" size={16} /></button></div><label>Kategori ikatan<select value={tier} onChange={event => setTier(event.target.value as AffinityTier)}>{summary.tiers.map(item => <option key={item.tier} value={item.tier}>{item.label} · slot {item.used}/{item.max_slots}</option>)}</select></label><textarea maxLength={240} value={message} onChange={event => setMessage(event.target.value)} placeholder="Pesan untuk teman (opsional)" /><button className="community-submit" type="submit" disabled={busy || !!summary.cooldowns.some(item => item.tier === tier) || !!selectedTier && selectedTier.used >= selectedTier.max_slots}><Icon name="heartFill" size={15} /> {busy ? 'Mengirim…' : 'Kirim proposal'}</button>{summary.cooldowns.some(item => item.tier === tier) ? <small className="friends-hint">Kategori ini masih cooldown sampai {new Date(summary.cooldowns.find(item => item.tier === tier)!.until_at).toLocaleString('id-ID')}.</small> : null}</form> : null}</section>
      {pendingIn.length ? <section className="affinity-section"><div className="games-section-head"><div><h2>Undangan masuk</h2><p>{pendingIn.length} proposal menunggu jawabanmu.</p></div></div><div className="affinity-list">{pendingIn.map(renderBond)}</div></section> : null}
      {pendingOut.length ? <section className="affinity-section"><div className="games-section-head"><div><h2>Proposal terkirim</h2><p>Proposal yang masih menunggu.</p></div></div><div className="affinity-list">{pendingOut.map(renderBond)}</div></section> : null}
      <section className="affinity-section"><div className="games-section-head"><div><h2>Ikatan aktif</h2><p>{active.length} ikatan berkembang bersama.</p></div></div>{active.length ? <div className="affinity-list">{active.map(renderBond)}</div> : <div className="community-state-card"><Icon name="heart" /><strong>Belum ada ikatan aktif</strong><span>Terima proposal teman atau mulai dengan mengirim proposal.</span></div>}</section>
      {older.length ? <details className="affinity-history"><summary>Riwayat ikatan ({older.length})</summary><div className="affinity-list">{older.map(renderBond)}</div></details> : null}
      <section className="affinity-section"><div className="games-section-head"><div><h2>Leaderboard Afinitas</h2><p>Pasangan dengan XP tertinggi.</p></div></div>{leaderboard.length ? <div className="affinity-leaderboard">{leaderboard.map((row, index) => <article key={row.bond_id}><span className="affinity-rank">{index + 1}</span><CommunityAvatar name={row.user_a.username} src={row.user_a.avatar_url} /><CommunityAvatar name={row.user_b.username} src={row.user_b.avatar_url} /><AffinityMark tier={row.tier} size={21} active /><div><strong>{row.user_a.username} &amp; {row.user_b.username}</strong><small>{tierNames[row.tier]}</small></div><b>{row.xp} XP</b></article>)}</div> : <p className="friends-hint">Belum ada ikatan publik di leaderboard.</p>}</section>
    </> : null}
    <ConfirmModal open={!!endingBond} onClose={() => setEndingBond(null)} onConfirm={() => { const bond = endingBond; setEndingBond(null); if (bond) void act(() => closeAffinity(bond.id, 'break')); }} title="Akhiri ikatan?" message="Kedua akun mendapat cooldown 48 jam sebelum dapat mengajukan ikatan sejenis lagi." confirmText="Akhiri ikatan" />
  </main>;
}
