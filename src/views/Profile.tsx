import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, signOutUser } from '../state/auth';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { Stat } from '../ui/Feedback';
import { ConfirmModal, PhotoModal } from '../ui/Sheet';
import { Topbar } from '../shell/Topbar';

/** Profil — identitas, ringkasan statistik, dan pintasan akun. */

export function Profile() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);
  const [confirmOut, setConfirmOut] = useState(false);
  const [photo, setPhoto] = useState(false);

  const stats = useMemo(() => {
    const done = history.filter(h => h.completed).length;
    const secs = history.reduce((acc, h) => acc + Math.min(h.positionSec || 0, h.durationSec || h.positionSec || 0), 0);
    return {
      favs: favorites.length,
      hist: history.length,
      done,
      minutes: Math.round(secs / 60)
    };
  }, [favorites.length, history]);

  const initial = (user?.name || user?.email || 'N').trim().charAt(0).toUpperCase();

  return (
    <>
      <Topbar
        title="Profil"
        right={
          <button type="button" className="ibtn ripple-host" aria-label="Pengaturan" onClick={() => navigate('/settings')}>
            <Icon name="settings" />
          </button>
        }
      />

      <div className="profile-hero">
        <button type="button" className="avatar" onClick={() => user?.avatar && setPhoto(true)} aria-label="Foto profil">
          {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="avatar-initial">{initial}</span>}
        </button>
        <div className="ph-name">{user?.name || 'Pengguna Nanime'}</div>
        <div className="ph-email">{user?.email || ''}</div>
      </div>

      <div className="stat-grid">
        <Stat value={stats.favs} label="Favorit" />
        <Stat value={stats.hist} label="Riwayat" />
        <Stat value={stats.done} label="Selesai" />
        <Stat value={stats.minutes} label="Menit Nonton" />
      </div>

      <div className="card" style={{ marginTop: 22, padding: '4px 14px' }}>
        <button type="button" className="setting-row" style={{ width: '100%' }} onClick={() => navigate('/history')}>
          <Icon name="clock" size={20} />
          <span className="set-body">
            <span className="set-title" style={{ display: 'block' }}>
              Riwayat Tontonan
            </span>
            <span className="set-sub">{stats.hist} episode tersimpan</span>
          </span>
          <Icon name="right" size={16} />
        </button>
        <button type="button" className="setting-row" style={{ width: '100%' }} onClick={() => navigate('/favorites')}>
          <Icon name="heart" size={20} />
          <span className="set-body">
            <span className="set-title" style={{ display: 'block' }}>
              Favorit Saya
            </span>
            <span className="set-sub">{stats.favs} tayangan disimpan</span>
          </span>
          <Icon name="right" size={16} />
        </button>
        <button type="button" className="setting-row" style={{ width: '100%' }} onClick={() => navigate('/settings')}>
          <Icon name="settings" size={20} />
          <span className="set-body">
            <span className="set-title" style={{ display: 'block' }}>
              Pengaturan
            </span>
            <span className="set-sub">Pemutar, kualitas, dan aplikasi</span>
          </span>
          <Icon name="right" size={16} />
        </button>
        <button
          type="button"
          className="setting-row"
          style={{ width: '100%', color: 'var(--accent-red)' }}
          onClick={() => setConfirmOut(true)}
        >
          <Icon name="logout" size={20} />
          <span className="set-body">
            <span className="set-title" style={{ display: 'block' }}>
              Keluar
            </span>
            <span className="set-sub">Akhiri sesi di perangkat ini</span>
          </span>
        </button>
      </div>

      <ConfirmModal
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={() => {
          void signOutUser().then(() => toast('Berhasil keluar', 'ok'));
        }}
        title="Keluar dari Nanime?"
        message="Favorit dan riwayat tetap aman di akunmu dan akan kembali saat masuk lagi."
        confirmText="Keluar"
      />

      <PhotoModal open={photo} onClose={() => setPhoto(false)} url={user?.avatar || null} />
    </>
  );
}
