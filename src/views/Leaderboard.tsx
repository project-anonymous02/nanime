import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leaderboard, type CommunityProfile } from '../lib/community';
import { formatUsage, RANK_META } from '../lib/rank';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { RankInsignia } from '../ui/RankInsignia';
import { Icon } from '../ui/icons';
import { EmptyState } from '../ui/Feedback';

/** Leaderboard nyata (migration 004): urut total detik stabil. */
export function Leaderboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CommunityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await leaderboard(50)); }
    catch (cause) { setError((cause as Error)?.message || 'Leaderboard belum dapat dimuat.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div>
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <div style={{ flex: 1 }}>
        <h1 className="hn-pagehead-title">Top Pengguna</h1>
        <p className="hn-profilehero-sub">Peringkat berdasarkan waktu aktif di Nanime.</p>
      </div>
    </header>
    {loading ? <div className="hn-spin" role="status" /> : null}
    {error ? <div className="hn-inline-warn" role="alert"><span>{error}</span><button type="button" className="hn-textbtn" onClick={() => void load()}>Coba lagi</button></div> : null}
    {!loading && !error && !rows.length ? <EmptyState icon="chart" title="Belum ada data peringkat" sub="Aktivitas penggunaan akan muncul di sini." /> : null}
    {!loading && !error ? <section className="hn-rowlist" aria-label="Peringkat pengguna">{rows.map((person, index) => <button type="button" className="hn-row" key={person.id} onClick={() => navigate(`/profile/${person.id}`)}>
      <b className={`hn-ranknum${index === 0 ? ' hn-top' : index === 1 ? ' hn-second' : index === 2 ? ' hn-third' : ''}`}>{index + 1}</b>
      <CommunityAvatar name={person.username} src={person.avatar_url} />
      <span className="hn-row-main">
        <span className="hn-row-title">{person.username}</span>
        <span className="hn-row-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <RankInsignia rank={person.rank} size={15} />
          {RANK_META[person.rank].label}
        </span>
      </span>
      <span className="hn-row-sub" style={{ whiteSpace: 'nowrap' }}>{formatUsage(person.app_usage_seconds)}</span>
    </button>)}</section> : null}
  </div>;
}
