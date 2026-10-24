import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { completeAuthCallback, extractAuthCode, initAuth, useAuth } from './state/auth';
import { useApp } from './state/app';
import { bindNativeDeepLink } from './lib/deeplink';
import { bindNativeBackButton } from './lib/backButton';
import { Shell } from './shell/Shell';
import { ErrorBoundary } from './shell/ErrorBoundary';
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
import { Genre } from './views/Genre';
import { Settings } from './views/Settings';
import { Friends } from './views/Friends';
import { PublicProfile } from './views/PublicProfile';
import { PublicChat } from './views/PublicChat';
import { AnimeRanking } from './views/AnimeRanking';
import { Leaderboard } from './views/Leaderboard';

/** Akar aplikasi: inisialisasi sesi, deep-link, lalu gerbang masuk. */

/** Lambar brand di layar boot memakai logo.jpg publik. */
function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-inner">
        <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="Nanime" width={72} height={72} />
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
        <Route path="/genre/:genreUrl/:genreTitle" element={<Genre />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/subscribed" element={<Navigate to="/favorites" replace />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<PublicProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/public-chat" element={<PublicChat />} />
        <Route path="/ranking/anime" element={<AnimeRanking />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/friends/search" element={<Friends />} />
        <Route path="/friends/:friendId" element={<Friends />} />
        <Route path="/chat/:friendId" element={<Friends />} />
        <Route path="/detail/:id" element={<Detail />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Shell>
  );
}

export function App() {
  useEffect(() => {
    void initAuth();
    const unbind = bindNativeDeepLink(url => {
      if (extractAuthCode(url)) void completeAuthCallback(url);
    });
    return unbind;
  }, []);

  useEffect(() => bindNativeBackButton(), []);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<Gate />} />
      </Routes>
      <Toasts />
    </ErrorBoundary>
  );
}
