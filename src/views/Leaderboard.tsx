import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatWatchDuration, leaderboard, type CommunityProfile } from '../lib/community';
import { RANK_META } from '../lib/rank';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { RankInsignia } from '../ui/RankInsignia';
import { Icon } from '../ui/icons';

export function Leaderboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CommunityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await leaderboard()); }
    catch (cause) { setError((cause as Error)?.message || 'Leaderboard belum dapat dimuat.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="leaderboard-page">
    <header className="ranking-heading"><button type="button" className="ibtn" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button><div><span className="eyebrow">NANIME COMMUNITY</span><h1>Top Pengguna</h1><p>Peringkat berdasarkan waktu aktif di Nanime.</p></div></header>
    {loading ? <div className="community-state-card" role="status"><span className="spinner-sm" />Memuat leaderboard…</div> : null}
    {error ? <div className="community-error" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Coba lagi</button></div> : null}
    {!loading && !error && !rows.length ? <div className="community-state-card"><Icon name="chart" /><strong>Belum ada data peringkat</strong><span>Aktivitas komunitas akan muncul di sini.</span></div> : null}
    {!loading && !error ? <section className="leaderboard-list" aria-label="Peringkat pengguna">{rows.map((person, index) => <button type="button" className="leaderboard-user" key={person.id} onClick={() => navigate(`/profile/${person.id}`)}>
      <b className={'leader-position' + (index < 3 ? ` rank-${index + 1}` : '')}>{index + 1}</b><CommunityAvatar name={person.username} src={person.avatar_url} /><span className="leaderboard-user-info"><strong>{person.username}</strong><small><RankInsignia rank={person.rank} size={15} />{person.is_developer ? 'Developer · Level 9999' : RANK_META[person.rank].label}</small></span><span className="leaderboard-user-time">{formatWatchDuration(person.app_usage_seconds)}</span>
    </button>)}</section> : null}
  </div>;
}
