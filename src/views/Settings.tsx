import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CacheManager } from '../core/services/CacheManager';
import { useApp } from '../state/app';
import { useAuth } from '../state/auth';
import { useSettings } from '../state/settings';
import { toast } from '../state/ui';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { Seg } from '../ui/Tabs';
import { Topbar } from '../shell/Topbar';

/** Pengaturan — pemutar, sumber, penyimpanan, dan info akun. */

export function Settings() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const s = useSettings();
  const mode = useApp(a => a.mode);
  const setMode = useApp(a => a.setMode);
  const [clearing, setClearing] = useState(false);

  const clearCache = async () => {
    setClearing(true);
    try {
      CacheManager.clear();
      toast('Cache dibersihkan', 'ok');
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <Topbar back title="Pengaturan" />

      <h2 className="section-title" style={{ fontSize: 15, margin: '6px 0 10px' }}>
        Pemutar
      </h2>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="setting-row">
          <span className="set-body">
            <span className="set-title">Putar episode berikutnya</span>
            <span className="set-sub">Otomatis lanjut saat episode selesai</span>
          </span>
          <Toggle on={s.autoplayNext} label="Putar episode berikutnya" onChange={v => s.patch({ autoplayNext: v })} />
        </div>
        <div className="setting-row">
          <span className="set-body">
            <span className="set-title">Kontrol pemutar</span>
            <span className="set-sub">Tampilkan kontrol kustom di atas video</span>
          </span>
          <Toggle on={s.playerControls} label="Kontrol pemutar" onChange={v => s.patch({ playerControls: v })} />
        </div>
        <div className="setting-row">
          <span className="set-body">
            <span className="set-title">Lewati intro otomatis</span>
            <span className="set-sub">Tombol lompat intro saat episode dibuka</span>
          </span>
          <Toggle on={s.skipIntro} label="Lewati intro" onChange={v => s.patch({ skipIntro: v })} />
        </div>
        {s.skipIntro ? (
          <div className="setting-row">
            <span className="set-body">
              <span className="set-title">Durasi intro</span>
              <span className="set-sub">Detik yang dilewati dari awal episode</span>
            </span>
            <div className="input-wrap" style={{ width: 96, height: 44 }}>
              <input
                type="number"
                min={5}
                max={300}
                value={s.introDuration}
                aria-label="Durasi intro (detik)"
                onChange={e => s.patch({ introDuration: Math.max(5, Math.min(300, Number(e.target.value) || 85)) })}
              />
            </div>
          </div>
        ) : null}
        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="set-body">
            <span className="set-title">Kualitas default</span>
            <span className="set-sub">Dipakai saat episode dibuka</span>
          </span>
          <Seg
            options={[
              { key: '480p', label: '480p' },
              { key: '720p', label: '720p' },
              { key: '1080p', label: '1080p' }
            ]}
            value={s.defaultQuality}
            onChange={v => s.patch({ defaultQuality: v })}
          />
        </div>
      </div>

      <h2 className="section-title" style={{ fontSize: 15, margin: '24px 0 10px' }}>
        Sumber Tayangan
      </h2>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="set-body">
            <span className="set-title">Mode sumber</span>
            <span className="set-sub">
              {mode === 'multi'
                ? 'Gabungkan semua sumber untuk 4 pilihan kualitas.'
                : 'Pakai satu sumber utama yang paling stabil.'}
            </span>
          </span>
          <Seg
            options={[
              { key: 'single', label: 'SINGLE' },
              { key: 'multi', label: 'MULTI' }
            ]}
            value={mode}
            onChange={v => setMode(v)}
          />
        </div>
      </div>

      <h2 className="section-title" style={{ fontSize: 15, margin: '24px 0 10px' }}>
        Penyimpanan
      </h2>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="setting-row">
          <span className="set-body">
            <span className="set-title">Bersihkan cache</span>
            <span className="set-sub">Hapus salinan data sementara di perangkat</span>
          </span>
          <Button variant="ghost" size="sm" loading={clearing} onClick={() => void clearCache()}>
            Bersihkan
          </Button>
        </div>
      </div>

      <h2 className="section-title" style={{ fontSize: 15, margin: '24px 0 10px' }}>
        Akun
      </h2>
      <div className="card" style={{ padding: '4px 14px' }}>
        <div className="setting-row">
          <span className="set-body">
            <span className="set-title">{user?.name || 'Pengguna Nanime'}</span>
            <span className="set-sub">{user?.email || 'Masuk dengan Google'}</span>
          </span>
          <Button variant="ghost" size="sm" icon={<Icon name="user" size={16} />} onClick={() => navigate('/profile')}>
            Profil
          </Button>
        </div>
        <div className="setting-row">
          <span className="set-body">
            <span className="set-title">Versi Nanime</span>
            <span className="set-sub">nanime v2.0.0 — build stabil</span>
          </span>
          <span className="badge gray">2.0.0</span>
        </div>
      </div>

      <p className="ob-foot" style={{ marginTop: 26 }}>
        Dibuat untuk komunitas anime Indonesia.
      </p>
    </>
  );
}
