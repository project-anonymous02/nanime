import { useCallback, useEffect } from 'react';
import { useNavigate, Navigate, Route, Routes } from 'react-router-dom';
import { completeAuthCallback, extractAuthCode, initAuth, useAuth } from './state/auth';
import { useApp } from './state/app';
import { usePlayer } from './state/player';
import { bindNativeDeepLink } from './lib/deeplink';
import { bindNativeBackButton } from './lib/backButton';
import { detailPath } from './lib/nav';
import { GlobalPlayer } from './player/GlobalPlayer';
import { Shell } from './shell/Shell';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { BrandMark } from './ui/icons';
import { Toasts } from './ui/Toasts';
import { AuthCallback } from './views/AuthCallback';
import { Detail } from './views/Detail';
import { Favorites } from './views/Favorites';
import { History } from './views/History';
import { Notifications } from './views/Notifications';
import { Home } from './views/Home';
import { Onboarding } from './views/Onboarding';
import { Profile } from './views/Profile';
import { Schedule } from './views/Schedule';
import { Search } from './views/Search';
import { Settings } from './views/Settings';
import { Watch } from './views/Watch';
import { Community } from './views/Community';

/** Akar aplikasi: inisialisasi sesi, deep-link, lalu gerbang masuk. */

function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-inner">
        <BrandMark size={54} />
        <span className="spinner-sm" role="status" aria-label="Menyiapkan Nanime" />
      </div>
    </div>
  );
}

function Gate() {
  const ready = useAuth(s => s.ready);
  const signedIn = useAuth(s => s.signedIn);

  if (!ready) return <BootScreen />;
  if (!signedIn) return <Onboarding />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/community" element={<Community />} />
        <Route path="/detail/:id" element={<Detail />} />
        <Route path="/watch/:id/:episode" element={<Watch />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  const navigate = useNavigate();

  useEffect(() => {
    void initAuth();
    const unbind = bindNativeDeepLink(url => {
      if (extractAuthCode(url)) void completeAuthCallback(url);
    });
    return unbind;
  }, []);

  // Tombol back Android: dari /watch kembali ke halaman deskripsi animenya.
  const onWatchBack = useCallback(
    (animeId: string) => {
      const title = usePlayer.getState().session?.title || '';
      navigate(detailPath(animeId, title));
    },
    [navigate]
  );

  useEffect(() => bindNativeBackButton(onWatchBack), [onWatchBack]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Gate />} />
      </Routes>
      <GlobalPlayer />
      <Toasts />
    </ErrorBoundary>
  );
}
