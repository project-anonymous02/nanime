import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { signInGoogle } from '../state/auth';
import { useApp } from '../state/app';
import { toast } from '../state/ui';
import { BrandMark, GoogleLogo, Icon } from '../ui/icons';

/** Pengenalan awal (3 slide) + gerbang masuk Google — wajib sebelum konten. */

interface Slide {
  lines: string[];
  gold?: boolean;
  sub: string;
  points: string[];
}

const SLIDES: Slide[] = [
  {
    lines: ['Nonton', 'Anime Tanpa', 'Ribet'],
    sub: 'Streaming ringan dan cepat, dirancang untuk koneksi Indonesia.',
    points: ['4 pilihan kualitas di setiap episode', 'Lanjut menonton tersimpan otomatis']
  },
  {
    lines: ['Semua', 'Tayangan.', 'Satu Tempat.'],
    gold: true,
    sub: 'Anime, donghua, hingga movie — semuanya dalam satu aplikasi.',
    points: ['Pencarian instan lintas katalog', 'Jadwal rilis harian selalu segar']
  },
  {
    lines: ['Masuk untuk', 'Mulai'],
    sub: 'Simpan favorit dan riwayat menontonmu agar tidak pernah hilang.',
    points: []
  }
];

function HeroChars({ text, offset = 0 }: { text: string; offset?: number }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} className="ob-char" style={{ '--ci': i + offset } as CSSProperties}>
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </>
  );
}

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
      Masuk dengan Google
    </button>
  );
}

export function Onboarding() {
  const onboarded = useApp(s => s.onboarded);
  const markOnboarded = useApp(s => s.markOnboarded);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const n = Math.max(0, Math.min(SLIDES.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    setIdx(n);
  }, []);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setIdx(Math.max(0, Math.min(SLIDES.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))));
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

  /* Setelah pernah mengikuti pengenalan: layar masuk ringkas. */
  if (onboarded) {
    return (
      <div className="onboard">
        <div className="ob-version">NANIME · V2</div>
        <div className="ob-dev">Developer: Nata</div>
        <div className="ob-slide" style={{ flex: 1, justifyContent: 'center' }}>
          <BrandMark size={72} />
          <h1 className="ob-hero anim-up" style={{ marginTop: 18 }}>
            Masuk untuk Melanjutkan
          </h1>
          <p className="ob-sub anim-up">Konten Nanime hanya tersedia setelah masuk dengan akun Google.</p>
          <div className="anim-up" style={{ marginTop: 8 }}>
            <GoogleButton busy={busy} shake={shake} onClick={() => void signIn()} />
          </div>
          <p className="ob-foot">Dengan masuk, kamu menyetujui ketentuan layanan Nanime.</p>
        </div>
      </div>
    );
  }

  const last = SLIDES.length - 1;
  let charOffset = 0;

  return (
    <div className="onboard">
      <div className="ob-version">NANIME · V2</div>
      <div className="ob-dev">Developer: Nata</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10 }}>
        {idx < last ? (
          <button type="button" className="section-link" onClick={() => goTo(last)}>
            Lewati
            <Icon name="right" size={14} strokeWidth={2.4} />
          </button>
        ) : (
          <span style={{ height: 30 }} />
        )}
      </div>

      <div className="ob-slides no-scrollbar" ref={trackRef} onScroll={onScroll}>
        {SLIDES.map((s, si) => {
          const base = charOffset;
          charOffset += s.lines.join('').length + 4;
          return (
            <section key={si} className="ob-slide">
              {si === 0 ? <BrandMark size={58} /> : null}
              <h1 className={'ob-hero' + (s.gold ? ' gold' : '')}>
                {s.lines.map((line, li) => (
                  <span key={li} style={{ display: 'block' }}>
                    <HeroChars text={line} offset={base + li * 2} />
                  </span>
                ))}
              </h1>
              <p className="ob-sub">{s.sub}</p>
              {s.points.length ? (
                <div className="ob-points">
                  {s.points.map((p, pi) => (
                    <span key={pi} className="ob-point">
                      {p}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="ob-dots" aria-hidden="true">
        {SLIDES.map((_, i) => (
          <span key={i} className={'ob-dot' + (i === idx ? ' active' : '')} />
        ))}
      </div>

      {idx === last ? (
        <div className="anim-up" style={{ display: 'grid', gap: 10 }}>
          <GoogleButton busy={busy} shake={shake} onClick={() => void signIn()} />
          <p className="ob-foot">Dengan masuk, kamu menyetujui ketentuan layanan Nanime.</p>
        </div>
      ) : (
        <>
          <button type="button" className="btn primary block lg" onClick={() => goTo(idx + 1)}>
            Lanjut
          </button>
          <p className="ob-hint">GESER UNTUK MELIHAT SELENGKAPNYA</p>
        </>
      )}
    </div>
  );
}
