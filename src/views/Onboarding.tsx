import { useCallback, useRef, useState } from 'react';
import { signInGoogle, useAuth } from '../state/auth';
import { useApp } from '../state/app';
import { toast } from '../state/ui';
import { GoogleLogo, Icon } from '../ui/icons';

/** Pengenalan awal (3 slide geser ke atas) + gerbang masuk Google — sesuai map-anibiplay.md. */

function GoogleButton({ busy, onClick, shake }: { busy: boolean; onClick: () => void; shake: boolean }) {
  return (
    <button
      type="button"
      className={'google-btn' + (shake ? ' anim-shake' : '')}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? (
        <span className="btn-spin" style={{ borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#1f1f1f' }} />
      ) : (
        <GoogleLogo size={22} />
      )}
      Lanjut dengan Google
    </button>
  );
}

function LoginBlock({
  busy,
  shake,
  signIn,
  tester
}: {
  busy: boolean;
  shake: boolean;
  signIn: () => void;
  tester: () => void;
}) {
  return (
    <div className="ob-login">
      <GoogleButton busy={busy} shake={shake} onClick={signIn} />
      <div className="ob-or">atau</div>
      <button type="button" className="ob-tester" onClick={tester}>
        <Icon name="logout" size={18} />
        Masuk sebagai Tester
      </button>
      <p className="ob-foot">
        Dengan masuk, kamu menyetujui ketentuan layanan Nanime.
        <br />
        Aplikasi ini tidak mengunggah atau mendistribusikan konten media.
      </p>
      <p className="ob-dev">Developer: Nata</p>
    </div>
  );
}

export function Onboarding() {
  const onboarded = useApp(s => s.onboarded);
  const markOnboarded = useApp(s => s.markOnboarded);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
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
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
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

  const tester = useCallback(() => {
    if (!onboarded) markOnboarded();
    useAuth.setState({
      ready: true,
      signedIn: true,
      user: { id: 'tester', email: 'tester@nanime.test', name: 'Tester', avatar: null }
    });
  }, [markOnboarded, onboarded]);

  /* Setelah pernah mengikuti pengenalan: layar masuk ringkas (gaya sama). */
  if (onboarded) {
    return (
      <div className="onboard">
        <div className="ob-version">Nanime v2.0.0</div>
        <div className="ob-slide" style={{ justifyContent: 'center' }}>
          <div className="ob-center">
            <h1 className="ob-display gold">
              SIAP MULAI<span className="ob-free">FREE</span>
            </h1>
            <p className="ob-sub">Masuk untuk sinkronisasi riwayat dan preferensi tontonan kamu.</p>
          </div>
          <div style={{ height: '32dvh' }} />
          <LoginBlock busy={busy} shake={shake} signIn={() => void signIn()} tester={tester} />
        </div>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="ob-version">Nanime v2.0.0</div>

      <div className="ob-rail" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <span key={i} className={'ob-dot' + (i === idx ? ' active' : '')} />
        ))}
      </div>

      <div className="ob-track" ref={trackRef} onScroll={onScroll}>
        <section className="ob-slide">
          <div className="ob-center">
            <h1 className="ob-display anim-up">WELCOME</h1>
            <p className="ob-sub anim-up">
              Platform anime, donghua &amp; movie
              <br />
              untuk komunitas Indonesia.
            </p>
          </div>
          <div className="ob-hint anim-fade">
            <Icon name="up" size={22} strokeWidth={2.4} />
            <span>Geser ke atas</span>
          </div>
        </section>

        <section className="ob-slide">
          <div className="ob-center">
            <span className="ob-chip anim-up">Disclaimer</span>
            <h1 className="ob-display anim-up">Ketentuan Layanan</h1>
            <ul className="ob-points">
              <li className="ob-point">
                <b>Aplikasi tidak resmi</b>
                <span>
                  Nanime adalah aplikasi pihak ketiga. Semua merek dagang dan hak cipta menjadi milik
                  pemiliknya masing-masing.
                </span>
              </li>
              <li className="ob-point">
                <b>Tidak mengunggah konten</b>
                <span>
                  Aplikasi ini tidak mengunggah, menyimpan, atau mendistribusikan konten media. Semua
                  konten bersumber dari tautan yang tersedia secara publik di internet.
                </span>
              </li>
              <li className="ob-point">
                <b>Pelanggaran hak cipta</b>
                <span>
                  Jika kamu adalah pemilik hak cipta dan merasa kontenmu digunakan secara tidak tepat,
                  hubungi pengembang aplikasi.
                </span>
              </li>
            </ul>
          </div>
          <div className="ob-hint anim-fade">
            <Icon name="up" size={22} strokeWidth={2.4} />
            <span>Geser ke atas</span>
          </div>
        </section>

        <section className="ob-slide">
          <div className="ob-center">
            <h1 className="ob-display gold anim-up">
              SIAP MULAI<span className="ob-free">FREE</span>
            </h1>
            <p className="ob-sub anim-up">
              Masuk untuk sinkronisasi riwayat
              <br />
              dan preferensi tontonan kamu.
            </p>
          </div>
          <div className="ob-spacer" />
          <LoginBlock busy={busy} shake={shake} signIn={() => void signIn()} tester={tester} />
        </section>
      </div>
    </div>
  );
}
