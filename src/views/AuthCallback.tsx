import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeAuthCallback, extractAuthCode, useAuth } from '../state/auth';
import { toast } from '../state/ui';
import { Button } from '../ui/Button';
import { BrandMark, Icon } from '../ui/icons';

/** Penukar kode OAuth (web `#/auth/callback?code=…`). */
export function AuthCallback() {
  const navigate = useNavigate();
  const signedIn = useAuth(s => s.signedIn);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (signedIn) {
        navigate('/home', { replace: true });
        return;
      }
      const url = location.href;
      if (!extractAuthCode(url)) {
        setFailed(true);
        return;
      }
      const ok = await completeAuthCallback(url);
      if (!alive) return;
      if (ok) {
        toast('Berhasil masuk. Selamat menonton!', 'ok');
        navigate('/home', { replace: true });
      } else {
        setFailed(true);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [navigate, signedIn]);

  return (
    <div className="boot-screen">
      <div className="boot-inner">
        <BrandMark size={54} />
        {failed ? (
          <>
            <p style={{ fontWeight: 800 }}>Tidak bisa masuk</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
              Gagal masuk dengan Google. Silakan coba lagi nanti.
            </p>
            <Button variant="ghost" icon={<Icon name="back" size={16} />} onClick={() => navigate('/home', { replace: true })}>
              Kembali
            </Button>
          </>
        ) : (
          <span className="spinner-sm" role="status" aria-label="Memproses masuk" />
        )}
      </div>
    </div>
  );
}
