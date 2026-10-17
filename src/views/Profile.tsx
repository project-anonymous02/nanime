import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, signOutUser } from '../state/auth';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { Sheet } from '../ui/Sheet';
import { detailPath, watchPath } from '../lib/nav';

/** Profil — banner, statistik, tab Favorit/Histori, dan sheet foto profil ala referensi. */

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
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);

  const [tab, setTab] = useState<'fav' | 'hist'>('hist');
  const [photo, setPhoto] = useState(false);

  const stats = useMemo(() => {
    const done = history.filter(h => h.completed).length;
    const secs = history.reduce((acc, h) => acc + Math.min(h.positionSec || 0, h.durationSec || h.positionSec || 0), 0);
    return { favs: favorites.length, hist: history.length, done, minutes: Math.round(secs / 60) };
  }, [favorites.length, history]);

  const initial = (user?.name || user?.email || 'N').trim().charAt(0).toUpperCase();
  const tag = user?.id ? '#' + user.id.replace(/-/g, '').slice(0, 6) : '';

  const favList = useMemo(() => favorites.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 30), [favorites]);
  const histList = useMemo(() => history.slice().sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 30), [history]);

  return (
    <>
      <div className="prof-banner">
        <button type="button" className="ibtn prof-back ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
      </div>

      <div className="prof-avatar-wrap">
        <button type="button" className="prof-avatar" onClick={() => setPhoto(true)} aria-label="Foto profil">
          {user?.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="prof-initial">{initial}</span>}
          <span className="prof-cam">
            <Icon name="camera" size={12} strokeWidth={2.4} />
          </span>
        </button>
      </div>

      <div className="prof-name">
        {user?.name || 'Pengguna Nanime'}
        {tag ? <span className="prof-tag">{tag}</span> : null}
      </div>

      <div className="prof-chips">
        <span className="prof-chip">
          <Icon name="shield" size={12} strokeWidth={2.2} />
          Akun Google
        </span>
        <span className="prof-chip dark">
          <Icon name="check" size={12} strokeWidth={2.6} />
          Tersinkron
        </span>
      </div>

      <div className="prof-stats">
        <div className="prof-stat">
          <span className="ps-val">{stats.favs}</span>
          <span className="ps-lab">favorit</span>
        </div>
        <div className="prof-stat">
          <span className="ps-val">{stats.done}</span>
          <span className="ps-lab">selesai</span>
        </div>
        <div className="prof-stat">
          <span className="ps-val">{stats.hist}</span>
          <span className="ps-lab">riwayat</span>
        </div>
        <div className="prof-stat">
          <span className="ps-val">{stats.minutes}</span>
          <span className="ps-lab">menit</span>
        </div>
      </div>

      <div className="prof-actions">
        <button type="button" className="prof-action" onClick={() => navigate('/favorites')}>
          <Icon name="starFill" size={16} strokeWidth={0} />
          Favorit
        </button>
        <button type="button" className="prof-action" onClick={() => navigate('/settings')}>
          <Icon name="settings" size={16} strokeWidth={2.2} />
          Pengaturan
        </button>
      </div>

      <div className="prof-tabs" role="tablist">
        <button
          type="button"
          className={'prof-tab' + (tab === 'fav' ? ' on' : '')}
          role="tab"
          aria-selected={tab === 'fav'}
          onClick={() => setTab('fav')}
        >
          Favorit
        </button>
        <button
          type="button"
          className={'prof-tab' + (tab === 'hist' ? ' on' : '')}
          role="tab"
          aria-selected={tab === 'hist'}
          onClick={() => setTab('hist')}
        >
          Histori
        </button>
      </div>

      {tab === 'fav'
        ? favList.map(f => (
            <button
              type="button"
              className="prof-row"
              key={f.id}
              onClick={() => navigate(detailPath(f.id, f.title))}
              aria-label={f.title}
            >
              <span className="pr-thumb">
                <SmartImage src={f.poster} alt={f.title} />
              </span>
              <span className="pr-body">
                <span className="pr-title clamp-2">{f.title}</span>
                <span className="pr-sub">
                  Favorit • {relativeTime(f.addedAt)}
                </span>
              </span>
            </button>
          ))
        : histList.map(h => (
            <div className="prof-row" key={h.animeId + '|' + h.episode}>
              <button
                type="button"
                className="pr-main"
                onClick={() => navigate(watchPath(h.animeId, h.episode, h.title))}
                aria-label={h.title}
              >
                <span className="pr-thumb">
                  <SmartImage src={h.poster} alt={h.title} />
                </span>
                <span className="pr-body">
                  <span className="pr-title clamp-2">{h.title}</span>
                  <span className="pr-sub">
                    Episode {h.episode} • {relativeTime(h.watchedAt)}
                  </span>
                  <span className="hp-bar pr-bar">
                    <span className="hp-fill" style={{ '--pct': Math.min(1, Math.max(0, h.percent || 0)) } as React.CSSProperties} />
                  </span>
                  <span className="pr-time">
                    {mmss(h.positionSec)} / {mmss(h.durationSec)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="pr-play"
                aria-label={'Lanjutkan ' + h.title}
                onClick={() => navigate(watchPath(h.animeId, h.episode, h.title))}
              >
                <Icon name="play" size={15} strokeWidth={0} />
              </button>
            </div>
          ))}

      {tab === 'fav' && !favList.length ? <p className="prof-empty">Belum ada favorit.</p> : null}
      {tab === 'hist' && !histList.length ? <p className="prof-empty">Belum ada riwayat tontonan.</p> : null}

      <Sheet open={photo} onClose={() => setPhoto(false)}>
        <div className="photo-sheet">
          <span className="phc-icon">
            <Icon name="camera" size={22} strokeWidth={2.2} />
          </span>
          <h3 className="phc-title">Foto Profil</h3>
          {user?.avatar ? (
            <button
              type="button"
              className="phc-btn ghost"
              onClick={() => {
                window.open(user.avatar as string, '_blank', 'noopener');
              }}
            >
              Ubah di Google
            </button>
          ) : null}
          <button
            type="button"
            className="phc-btn primary"
            onClick={() => {
              setPhoto(false);
              toast('Foto profil tersinkron dari akun Google', 'ok');
            }}
          >
            Sinkronisasi Foto
          </button>
          <button type="button" className="phc-close" onClick={() => setPhoto(false)}>
            Tutup
          </button>
          <button
            type="button"
            className="phc-out"
            onClick={() => {
              setPhoto(false);
              void signOutUser().then(() => toast('Berhasil keluar', 'ok'));
            }}
          >
            Keluar dari akun
          </button>
        </div>
      </Sheet>
    </>
  );
}
