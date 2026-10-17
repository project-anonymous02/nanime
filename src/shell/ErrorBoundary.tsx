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
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', maxWidth: 300 }}>
            Gagal memuat data, silakan periksa koneksi internet dan coba lagi nanti.
          </p>
          <button type="button" className="btn ghost" onClick={() => location.reload()}>
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }
}
