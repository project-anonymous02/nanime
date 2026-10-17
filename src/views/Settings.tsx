import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CacheManager } from '../core/services/CacheManager';
import { useAuth, signOutUser } from '../state/auth';
import { useLibrary } from '../state/library';
import { useSettings } from '../state/settings';
import { toast } from '../state/ui';
import { ConfirmModal } from '../ui/Sheet';
import { Toggle } from '../ui/Feedback';
import { Icon } from '../ui/icons';

/** Pengaturan — profil, pemutaran, penyimpanan, aplikasi (gaya referensi). */

export function Settings() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);
  const s = useSettings();
  const [openQuality, setOpenQuality] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [cacheMb, setCacheMb] = useState('0.0');

  useEffect(() => {
    try {
      const st = CacheManager.stats();
      setCacheMb((st.bytes / 1048576).toFixed(1));
    } catch {
      setCacheMb('0.0');
    }
  }, []);

  const pct = useMemo(() => {
    if (!history.length) return 0;
    const done = history.filter(h => h.completed).length;
    return Math.round((done / history.length) * 100);
  }, [history]);

  const initial = (user?.name || user?.email || 'N').trim().charAt(0).toUpperCase();

  const clearCache = () => {
    CacheManager.clear();
    setCacheMb('0.0');
    toast('Cache dibersihkan', 'ok');
  };

  return (
    <>
      <h1 className="set-h1">Pengaturan</h1>

      <button type="button" className="set-card set-prof" onClick={() => navigate('/profile')}>
        <span className="set-avatar">
          {user?.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </span>
        <span className="set-id">
          <span className="sr-title">{user?.name || 'Pengguna Nanime'}</span>
          <span className="sr-sub">{user?.email || 'Masuk dengan Google'}</span>
        </span>
        <Icon name="right" size={16} strokeWidth={2.4} />
      </button>

      <div className="set-card">
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Ringkasan aktivitas</span>
            <span className="sr-sub">
              {favorites.length} favorit • {history.length} riwayat
            </span>
          </span>
          <span className="set-val cyan">{pct}%</span>
        </div>
        <span className="set-bar">
          <span className="set-fill" style={{ '--pct': pct / 100 } as React.CSSProperties} />
        </span>
        <span className="set-note">Episode selesai dari total riwayat tontonan</span>
      </div>

      <p className="set-sec">Profil</p>
      <div className="set-card">
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Nama profil</span>
            <span className="sr-sub">Mengikuti akun Google</span>
          </span>
          <span className="set-val">
            Terkunci
            <Icon name="lock" size={13} strokeWidth={2.2} />
          </span>
        </div>
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Profil pribadi</span>
            <span className="sr-sub">Terkunci untuk role ini.</span>
          </span>
          <Toggle on={false} label="Profil pribadi" onChange={() => undefined} />
        </div>
      </div>

      <p className="set-sec">Pemutaran</p>
      <div className="set-card">
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Auto play episode berikutnya</span>
            <span className="sr-sub">Otomatis lanjut saat episode selesai</span>
          </span>
          <Toggle on={s.autoplayNext} label="Auto play episode berikutnya" onChange={v => s.patch({ autoplayNext: v })} />
        </div>
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Kontrol brightness &amp; volume</span>
            <span className="sr-sub">Gestur di sisi layar pemutar</span>
          </span>
          <Toggle on={s.playerControls} label="Kontrol brightness dan volume" onChange={v => s.patch({ playerControls: v })} />
        </div>
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Skip intro</span>
            <span className="sr-sub">Tombol lompat intro saat episode dibuka</span>
          </span>
          <Toggle on={s.skipIntro} label="Skip intro" onChange={v => s.patch({ skipIntro: v })} />
        </div>
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Durasi intro default</span>
            <span className="sr-sub">Dipakai saat skip intro aktif</span>
          </span>
          <span className="set-val">
            {s.introDuration} detik
            <Icon name="lock" size={13} strokeWidth={2.2} />
          </span>
        </div>
        <button type="button" className="set-row" onClick={() => setOpenQuality(o => !o)} aria-expanded={openQuality}>
          <span className="sr-body">
            <span className="sr-title">Kualitas default</span>
            <span className="sr-sub">Dipakai saat episode dibuka</span>
          </span>
          <span className="set-val">
            {s.defaultQuality}
            <Icon name={openQuality ? 'up' : 'down'} size={13} strokeWidth={2.4} />
          </span>
        </button>
        {openQuality ? (
          <div className="set-quality">
            {(['480p', '720p', '1080p'] as const).map(q => (
              <button
                key={q}
                type="button"
                className={'set-q-chip' + (s.defaultQuality === q ? ' on' : '')}
                onClick={() => {
                  s.patch({ defaultQuality: q });
                  setOpenQuality(false);
                }}
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="set-sec">Penyimpanan</p>
      <div className="set-card">
        <button type="button" className="set-row" onClick={clearCache}>
          <span className="sr-body">
            <span className="sr-title">Cache gambar &amp; efek</span>
            <span className="sr-sub">Hapus salinan data sementara</span>
          </span>
          <span className="set-val">
            {cacheMb} MB
            <Icon name="right" size={14} strokeWidth={2.4} />
          </span>
        </button>
      </div>

      <p className="set-sec">Aplikasi</p>
      <div className="set-card">
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Versi aplikasi</span>
          </span>
          <span className="set-val">Nanime v2.0.0 (2)</span>
        </div>
        <div className="set-row">
          <span className="sr-body">
            <span className="sr-title">Developer</span>
          </span>
          <span className="set-val">Nata</span>
        </div>
      </div>

      <button type="button" className="set-logout" onClick={() => setConfirmOut(true)}>
        <Icon name="logout" size={18} strokeWidth={2.2} />
        Keluar
      </button>

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
    </>
  );
}
