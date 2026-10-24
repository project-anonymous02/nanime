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

/** Pengaturan — profil, penyimpanan, aplikasi. */

export function Settings() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);
  const playback = useSettings();
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
      <header className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <h1 className="hn-pagehead-title">Pengaturan</h1>
        <span style={{ width: 40 }} />
      </header>

      <button type="button" className="hn-menuitem" onClick={() => navigate('/profile')}>
        <span className="hn-menuitem-icon">{user?.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: 999, objectFit: 'cover' }} /> : <span style={{ fontWeight: 800 }}>{initial}</span>}</span>
        <span>
          <span style={{ display: 'block', color: 'var(--text-primary)' }}>{user?.name || 'Pengguna Nanime'}</span>
          <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>{user?.email || 'Masuk dengan Google'}</span>
        </span>
        <span className="hn-menuitem-chevron"><Icon name="right" size={16} strokeWidth={2.4} /></span>
      </button>

      <div className="hn-rankcard">
        <div className="hn-rankcard-main">
          <span className="hn-rankcard-tier">
            <span style={{ display: 'block' }}>Ringkasan aktivitas</span>
            <small>
              {favorites.length} favorit • {history.length} riwayat
            </small>
          </span>
          <div className="hn-rankbar">
            <div className="hn-rankbar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="hn-rankbar-label"><span>Episode selesai</span><span>{pct}%</span></span>
        </div>
      </div>

      <div className="hn-section-head"><span className="hn-section-title">Profil</span></div>
      <div className="hn-menulist">
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span className="hn-menuitem-icon"><Icon name="user" size={16} /></span>
          <span>
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Nama profil</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>Mengikuti akun Google</span>
          </span>
          <span className="hn-menuitem-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Terkunci
            <Icon name="lock" size={13} strokeWidth={2.2} />
          </span>
        </div>
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span className="hn-menuitem-icon"><Icon name="eye" size={16} /></span>
          <span>
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Profil pribadi</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>Terkunci untuk role ini.</span>
          </span>
          <Toggle on={false} label="Profil pribadi" onChange={() => undefined} />
        </div>
      </div>

      <div className="hn-section-head"><span className="hn-section-title">Pemutaran</span></div>
      <div className="hn-menulist">
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span>
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Auto play episode berikutnya</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>Lanjutkan setelah video selesai.</span>
          </span>
          <Toggle on={playback.autoplayNext} label="Auto play episode berikutnya" onChange={value => playback.patch({ autoplayNext: value })} />
        </div>
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span>
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Kontrol brightness &amp; volume</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>Preferensi kontrol pemutar.</span>
          </span>
          <Toggle on={playback.playerControls} label="Kontrol brightness dan volume" onChange={value => playback.patch({ playerControls: value })} />
        </div>
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span>
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Skip intro</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>Lewati bagian awal sesuai durasi pilihan.</span>
          </span>
          <Toggle on={playback.skipIntro} label="Skip intro" onChange={value => playback.patch({ skipIntro: value })} />
        </div>
        <label className="hn-field" htmlFor="default-quality">
          <span className="hn-label">Kualitas default — preferensi untuk pemutaran berikutnya.</span>
          <select id="default-quality" className="hn-select" value={playback.defaultQuality} onChange={event => playback.patch({ defaultQuality: event.target.value as '480p' | '720p' | '1080p' })}>
            <option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option>
          </select>
        </label>
        <label className="hn-field" htmlFor="intro-duration">
          <span className="hn-label">Durasi intro default — batas waktu sebelum intro dianggap selesai.</span>
          <select id="intro-duration" className="hn-select" value={playback.introDuration} onChange={event => playback.patch({ introDuration: Number(event.target.value) })}>
            {[60, 75, 85, 90, 100].map(seconds => <option key={seconds} value={seconds}>{seconds} detik</option>)}
          </select>
        </label>
      </div>

      <div className="hn-section-head"><span className="hn-section-title">Penyimpanan</span></div>
      <div className="hn-menulist">
        <button type="button" className="hn-menuitem" onClick={clearCache}>
          <span className="hn-menuitem-icon"><Icon name="trash" size={16} /></span>
          <span>
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Cache gambar &amp; efek</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 500, fontSize: 'var(--fs-small)' }}>Hapus salinan data sementara</span>
          </span>
          <span className="hn-menuitem-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {cacheMb} MB
            <Icon name="right" size={14} strokeWidth={2.4} />
          </span>
        </button>
      </div>

      <div className="hn-section-head"><span className="hn-section-title">Aplikasi</span></div>
      <div className="hn-menulist">
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span className="hn-menuitem-icon"><Icon name="phone" size={16} /></span>
          <span style={{ color: 'var(--text-primary)' }}>Versi aplikasi</span>
          <span className="hn-menuitem-badge">Nanime v2.0.0 (2)</span>
        </div>
        <div className="hn-menuitem" style={{ color: 'var(--text-muted)' }}>
          <span className="hn-menuitem-icon"><Icon name="star" size={16} /></span>
          <span style={{ color: 'var(--text-primary)' }}>Developer</span>
          <span className="hn-menuitem-badge">Nata</span>
        </div>
      </div>

      <div className="hn-formactions" style={{ marginTop: 18 }}>
        <button type="button" className="hn-ghostbtn" style={{ width: '100%', color: 'var(--accent-pink)' }} onClick={() => setConfirmOut(true)}>
          <Icon name="logout" size={18} strokeWidth={2.2} />
          Keluar
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
    </>
  );
}
