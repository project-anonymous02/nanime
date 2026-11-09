import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CacheManager } from '../core/services/CacheManager';
import { useAuth, signOutUser } from '../state/auth';
import { useLibrary } from '../state/library';
import { useTheme } from '../state/theme';
import { toast } from '../state/ui';
import { ConfirmModal } from '../ui/Sheet';
import { Icon } from '../ui/icons';

/** Pengaturan — profil, penyimpanan, tampilan, aplikasi. */

export function Settings() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const favorites = useLibrary(s => s.favorites);
  const history = useLibrary(s => s.history);
  const theme = useTheme(s => s.theme);
  const setTheme = useTheme(s => s.setTheme);
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

      <div className="hn-section-head"><span className="hn-section-title">Tampilan</span></div>
      <div className="hn-menulist">
        <div className="hn-menuitem" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="hn-menuitem-icon"><Icon name="palette" size={16} /></span>
            <span style={{ color: 'var(--text-primary)' }}>Tema</span>
          </span>
          <div className="hn-theme-picker" role="radiogroup" aria-label="Tema">
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'light'}
              aria-label="Tema terang"
              className={`hn-chip${theme === 'light' ? ' hn-active' : ''}`}
              onClick={() => setTheme('light')}
              style={{ minHeight: 44 }}
            >
              Terang
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'dark'}
              aria-label="Tema gelap"
              className={`hn-chip${theme === 'dark' ? ' hn-active' : ''}`}
              onClick={() => setTheme('dark')}
              style={{ minHeight: 44 }}
            >
              Gelap
            </button>
          </div>
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
