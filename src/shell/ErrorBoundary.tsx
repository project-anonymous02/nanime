import { Component, type ReactNode } from 'react';
import { BrandMark } from '../ui/icons';

/** Menangkap galat render tak terduga — pengguna selalu punya jalan kembali. */
interface ErrorBoundaryState {
  err: boolean;
  detail: string;
}

function safeErrorDetail(error: unknown): string {
  const raw = error instanceof Error
    ? `${error.name}: ${error.message}`
    : typeof error === 'string'
      ? error
      : 'Exception tidak menyediakan pesan.';
  return raw.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 400);
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { err: false, detail: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { err: true, detail: safeErrorDetail(error) };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    try {
      console.error('[nanime] render error', error);
    } catch {
      /* noop */
    }
    const componentStack = info.componentStack?.trim();
    if (componentStack) {
      this.setState(state => ({
        ...state,
        detail: `${state.detail}\n${componentStack}`.slice(0, 900)
      }));
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
            Gagal memuat data, silakan periksa koneksi internet dan coba lagi nanti.
          </p>
          <details style={{ maxWidth: 320, width: '100%', color: 'var(--text-muted)', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', textAlign: 'center' }}>Detail error</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflow: 'auto' }}>{this.state.detail}</pre>
          </details>
          <button type="button" className="hn-ghostbtn" onClick={() => location.reload()}>
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }
}
