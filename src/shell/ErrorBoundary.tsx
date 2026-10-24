import { Component, type ReactNode } from 'react';
import { BrandMark } from '../ui/icons';

/** Menangkap galat render tak terduga — pengguna selalu punya jalan kembali. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false };

  static getDerivedStateFromError() {
    return { err: true };
  }

  componentDidCatch(error: unknown) {
    try {
      console.error('[nanime] render error', error);
    } catch {
      /* noop */
    }
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="boot-screen">
        <div className="boot-inner">
          <BrandMark size={54} />
          <p style={{ fontWeight: 800 }}>Terjadi kendala</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
            Aplikasi mengalami gangguan saat menampilkan halaman. Muat ulang untuk mencoba kembali.
          </p>
          <button type="button" className="hn-ghostbtn" onClick={() => location.reload()}>
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }
}
