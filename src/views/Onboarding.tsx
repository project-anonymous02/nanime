import { useCallback, useRef, useState } from 'react';
import { signInGoogle } from '../state/auth';
import { useApp } from '../state/app';
import { toast } from '../state/ui';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';

/** Pengenalan awal (3 slide geser ke atas) + gerbang masuk Google. */

const BASE = import.meta.env.BASE_URL;

function GoogleButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="hn-gauth" disabled={busy} onClick={onClick}>
      {busy ? <span className="spinner-sm" style={{ borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#1f1f1f' }} /> : <img src={`${BASE}ref/google-logo.png`} alt="" />}
      Lanjut dengan Google
    </button>
  );
}

function LoginBlock({ busy, signIn }: { busy: boolean; signIn: () => void }) {
  return (
    <div className="hn-auth-login">
      <GoogleButton busy={busy} onClick={signIn} />
      <p className="hn-auth-note">
        Dengan masuk, kamu menyetujui ketentuan layanan Nanime.
        <br />
        Aplikasi ini tidak mengunggah atau mendistribusikan konten media.
      </p>
    </div>
  );
}

export function Onboarding() {
  const onboarded = useApp(s => s.onboarded);
  const markOnboarded = useApp(s => s.markOnboarded);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setIdx(Math.max(0, Math.min(2, Math.round(el.scrollTop / Math.max(1, el.clientHeight)))));
  }, []);

  const signIn = useCallback(async () => {
    if (busy) return;
    if (!onboarded) markOnboarded();
    setBusy(true);
    const r = await signInGoogle();
    if (!r.ok) {
      setBusy(false);
      toast(r.message || 'Gagal masuk dengan Google. Silakan coba lagi nanti.', 'err');
      return;
    }
    if (r.url) {
      try {
        const mod = await import('@capacitor/browser');
        await mod.Browser.open({ url: r.url });
      } catch {
        window.location.assign(r.url);
      }
    }
    setBusy(false);
  }, [busy, markOnboarded, onboarded]);

  /* Setelah pernah mengikuti pengenalan: layar masuk ringkas. */
  if (onboarded) {
    return (
      <div className="hn-auth">
        <img className="hn-auth-logo" src={`${BASE}logo.jpg`} alt="Nanime" />
        <div className="hn-auth-head">
          <h1 className="hn-auth-title">SIAP MULAI <span className="hn-auth-free">GRATIS</span></h1>
          <p className="hn-auth-sub">Masuk untuk sinkronisasi riwayat dan preferensi tontonan kamu. Semua fitur terbuka, gratis dan tanpa batas.</p>
        </div>
        <LoginBlock busy={busy} signIn={() => void signIn()} />
      </div>
    );
  }

  return (
    <div className="hn-auth">
      <div className="hn-auth-slide-dots" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <span key={i} className={`hn-hero-dot${idx === i ? ' hn-active' : ''}`} />
        ))}
      </div>

      <div className="hn-auth-track" ref={trackRef} onScroll={onScroll}>
        <section className="hn-auth-slide">
          <SmartImage className="hn-auth-art" src={`${BASE}ref/cover.jpg`} alt="Ilustrasi" eager />
          <div className="hn-auth-head">
            <h1 className="hn-auth-title">WELCOME</h1>
            <p className="hn-auth-sub">
              Platform anime &amp; movie
              <br />
              untuk komunitas Indonesia.
            </p>
          </div>
          <div className="hn-auth-swipe">
            <Icon name="up" size={22} strokeWidth={2.4} />
            <span>Geser ke atas</span>
          </div>
        </section>

        <section className="hn-auth-slide">
          <div className="hn-auth-head">
            <span className="hn-auth-kicker">Disclaimer</span>
            <h1 className="hn-auth-title">Ketentuan Layanan</h1>
            <ul className="hn-auth-rules">
              <li>
                <b>Aplikasi tidak resmi</b>
                <span>
                  Nanime adalah aplikasi pihak ketiga. Semua merek dagang dan hak cipta menjadi milik
                  pemiliknya masing-masing.
                </span>
              </li>
              <li>
                <b>Tidak mengunggah konten</b>
                <span>
                  Aplikasi ini tidak mengunggah, menyimpan, atau mendistribusikan konten media. Semua
                  konten bersumber dari tautan yang tersedia secara publik di internet.
                </span>
              </li>
              <li>
                <b>Pelanggaran hak cipta</b>
                <span>
                  Jika kamu adalah pemilik hak cipta dan merasa kontenmu digunakan secara tidak tepat,
                  hubungi pengembang aplikasi.
                </span>
              </li>
            </ul>
          </div>
          <div className="hn-auth-swipe">
            <Icon name="up" size={22} strokeWidth={2.4} />
            <span>Geser ke atas</span>
          </div>
        </section>

        <section className="hn-auth-slide">
          <SmartImage className="hn-auth-art" src={`${BASE}ref/anya-login.png`} alt="Ilustrasi" eager style={{ objectFit: 'contain', background: 'transparent', boxShadow: 'none' }} />
          <div className="hn-auth-head">
            <h1 className="hn-auth-title">SIAP MULAI <span className="hn-auth-free">GRATIS</span></h1>
            <p className="hn-auth-sub">Masuk untuk sinkronisasi riwayat dan preferensi tontonan kamu.</p>
          </div>
          <LoginBlock busy={busy} signIn={() => void signIn()} />
        </section>
      </div>
    </div>
  );
}
