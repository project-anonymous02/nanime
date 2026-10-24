import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, signOutUser } from '../state/auth';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { Sheet } from '../ui/Sheet';
import { detailPath } from '../lib/nav';
import { ownAppUsageSeconds } from '../lib/community';
import { formatUsage, RANK_META, rankFor, rankProgress } from '../lib/rank';
import { RankInsignia } from '../ui/RankInsignia';
import { isNanimeDeveloper } from '../lib/developer';

/** Profil — identitas, kartu tier rank, menu, tab Favorit/Histori, sheet foto. */

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400000;
  if (diff < 3600000) return 'Baru saja';
  if (diff < day) return `${Math.floor(diff / 3600000)} jam lalu`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} hari lalu`;
  const months = Math.floor(diff / (30 * day));
  return months <= 1 ? '1 bulan lalu' : `${months} bulan lalu`;
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Profile() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const developer = isNanimeDeveloper(user?.email);
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);

  const [tab, setTab] = useState<'fav' | 'hist'>('fav');
  const [photo, setPhoto] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [validatedSeconds, setValidatedSeconds] = useState<number | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const [usageRetry, setUsageRetry] = useState(0);

  useEffect(() => setAvatarBroken(false), [user?.avatar]);

  useEffect(() => {
    let alive = true;
    setValidatedSeconds(null);
    setUsageFailed(false);
    if (user?.id) void ownAppUsageSeconds().then(seconds => {
      if (alive) { setValidatedSeconds(seconds); setUsageFailed(false); }
    }).catch(() => {
      if (alive) setUsageFailed(true);
    });
    return () => { alive = false; };
  }, [user?.id, usageRetry]);

  const seconds = validatedSeconds;
  const rank = rankFor(seconds || 0, developer);
  const rankMeta = RANK_META[rank];
  const rankProg = rankProgress(seconds || 0, developer);
  const months = user?.createdAt ? Math.max(1, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (30 * 86400000))) : null;

  const initial = (user?.name || user?.email || 'N').trim().charAt(0).toUpperCase();
  const tag = user?.id ? '#' + user.id.replace(/-/g, '').slice(0, 6) : '';

  const favList = useMemo(() => favorites.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 30), [favorites]);
  const histList = useMemo(() => history.slice().sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 30), [history]);

  return (
    <>
      <div className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
      </div>

      <div className="hn-profilehero">
        <button type="button" onClick={() => setPhoto(true)} className="hn-profilehero-avatarbtn" aria-label="Foto profil" style={{ position: 'relative' }}>
          {user?.avatar && !avatarBroken ? <img className="hn-profilehero-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} /> : <span className="hn-profilehero-avatar hn-avatar-fallback"><Icon name="user" size={26} strokeWidth={2} /></span>}
          <span className="hn-iconbtn" style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30 }}>
            <Icon name="camera" size={12} strokeWidth={2.4} />
          </span>
        </button>
        <div className="hn-profilehero-name">
          {user?.name || 'Pengguna Nanime'}
          {tag ? <span style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 600 }}>{tag}</span> : null}
        </div>
        <span className="hn-profilehero-sub"><Icon name="user" size={12} strokeWidth={2.2} />Bergabung {months ?? 0} bulan</span>
      </div>

      <div className="hn-rankcard">
        <RankInsignia rank={rank} size={52} />
        <div className="hn-rankcard-main">
          <div className="hn-rankcard-tier">
            {rankMeta.label}
            <small>{seconds == null ? usageFailed ? 'Data aktivitas belum dapat dimuat' : 'Memuat data aktivitas…' : `${formatUsage(seconds)} waktu aktif terdata`}</small>
          </div>
          {rankProg?.next ? <div className="hn-rankbar"><div className="hn-rankbar-fill" style={{ width: `${Math.round(rankProg.used / rankProg.span * 100)}%` }} /></div> : null}
          {rankProg?.next ? (
            <div className="hn-rankbar-label">
              <span>{rankMeta.label}</span>
              <span>{formatUsage(rankProg.next.minutes * 60 - (seconds || 0))} lagi → {rankProg.next.label}</span>
            </div>
          ) : <div className="hn-rankbar-label"><span>{rank === 'developer' ? 'Tier developer' : 'Tier tertinggi tercapai'}</span></div>}
          {usageFailed ? <button type="button" className="hn-textbtn" onClick={() => setUsageRetry(value => value + 1)}>Coba muat ulang</button> : null}
        </div>
      </div>

      <nav className="hn-menulist" aria-label="Menu profil">
        <button type="button" className="hn-menuitem" onClick={() => navigate('/favorites')}>
          <span className="hn-menuitem-icon"><Icon name="starFill" size={16} strokeWidth={0} /></span>
          Favorit
          <span className="hn-menuitem-badge">{favorites.length}</span>
        </button>
        <button type="button" className="hn-menuitem" onClick={() => navigate('/friends')}>
          <span className="hn-menuitem-icon"><Icon name="users" size={16} strokeWidth={2} /></span>
          Teman & Chat
        </button>
        <button type="button" className="hn-menuitem" onClick={() => navigate('/leaderboard')}>
          <span className="hn-menuitem-icon"><Icon name="crown" size={16} strokeWidth={0} /></span>
          Leaderboard
        </button>
        <button type="button" className="hn-menuitem" onClick={() => navigate('/notifications')}>
          <span className="hn-menuitem-icon"><Icon name="bell" size={16} strokeWidth={2} /></span>
          Notifikasi
        </button>
        <button type="button" className="hn-menuitem" onClick={() => navigate('/settings')}>
          <span className="hn-menuitem-icon"><Icon name="settings" size={16} strokeWidth={2.2} /></span>
          Pengaturan
          <span className="hn-menuitem-chevron"><Icon name="right" size={14} strokeWidth={2.4} /></span>
        </button>
        <button type="button" className="hn-menuitem" onClick={() => void signOutUser().then(() => (toast('Berhasil keluar', 'ok'), navigate('/home')))}>
          <span className="hn-menuitem-icon" style={{ color: '#ff8a80' }}><Icon name="logout" size={16} strokeWidth={2.2} /></span>
          Keluar dari akun
        </button>
      </nav>

      <div className="hn-divider" />

      <div className="hn-chiprow" role="tablist" style={{ justifyContent: 'center' }}>
        <button
          type="button"
          className={`hn-chip${tab === 'fav' ? ' hn-active' : ''}`}
          role="tab"
          aria-selected={tab === 'fav'}
          onClick={() => setTab('fav')}
        >Favorit</button>
        <button
          type="button"
          className={`hn-chip${tab === 'hist' ? ' hn-active' : ''}`}
          role="tab"
          aria-selected={tab === 'hist'}
          onClick={() => setTab('hist')}
        >Histori</button>
      </div>

      {tab === 'fav' ? (
        <div className="hn-rowlist" style={{ marginTop: 14 }}>
          {favList.map(f => (
            <button
              type="button"
              className="hn-row"
              key={f.id}
              onClick={() => navigate(detailPath(f.id, f.title))}
              aria-label={f.title}
            >
              <span className="hn-card-poster" style={{ width: 66, borderRadius: 8, flexShrink: 0 }}>
                <SmartImage src={f.poster} alt={f.title} />
              </span>
              <span className="hn-row-main">
                <span className="hn-row-title">{f.title}</span>
                <span className="hn-row-sub">Favorit • {relativeTime(f.addedAt)}</span>
              </span>
              <Icon name="right" size={15} />
            </button>
          ))}
          {!favList.length ? <p className="hn-state">Belum ada favorit.</p> : null}
        </div>
      ) : (
        <div className="hn-rowlist" style={{ marginTop: 14 }}>
          {histList.map(h => (
            <button
              type="button"
              className="hn-row"
              key={h.animeId + '|' + h.episode}
              onClick={() => navigate(detailPath(h.animeId, h.title))}
              aria-label={h.title}
            >
              <span className="hn-card-poster" style={{ width: 66, borderRadius: 8, flexShrink: 0 }}>
                <SmartImage src={h.poster} alt={h.title} />
              </span>
              <span className="hn-row-main">
                <span className="hn-row-title">{h.title}</span>
                <span className="hn-row-sub">Episode {h.episode} • {relativeTime(h.watchedAt)}</span>
                <span className="hn-progressbar" style={{ position: 'static', marginTop: 6 }}>
                  <span className="hn-progressbar-fill" style={{ width: `${Math.min(100, Math.round(h.percent || 0))}%` }} />
                </span>
                <span className="hn-row-sub">{mmss(h.positionSec)} / {mmss(h.durationSec)}</span>
              </span>
            </button>
          ))}
          {!histList.length ? <p className="hn-state">Belum ada riwayat tontonan.</p> : null}
        </div>
      )}

      <Sheet open={photo} onClose={() => setPhoto(false)} title="Foto Profil">
        <div style={{ padding: '6px 16px calc(18px + env(safe-area-inset-bottom))', display: 'grid', gap: 10 }}>
          <p className="hn-row-sub">Foto profil mengikuti akun Google dan tidak dapat diubah langsung di Nanime. Setelah menggantinya, masuk kembali agar perubahan tersinkron.</p>
          <a className="hn-menuitem" href="https://myaccount.google.com/personal-info" target="_blank" rel="noreferrer">Buka setelan akun Google</a>
          <button type="button" className="hn-menuitem" onClick={() => setPhoto(false)}>
            Tutup
          </button>
        </div>
      </Sheet>
    </>
  );
}
