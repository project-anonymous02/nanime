import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { completeAuthCallback, extractAuthCode, initAuth, useAuth } from './state/auth';
import { useApp } from './state/app';
import { bindNativeDeepLink } from './lib/deeplink';
import { bindNativeBackButton } from './lib/backButton';
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
import { Community } from './views/Community';
import { Friends } from './views/Friends';
import { WatchPartyView } from './views/WatchParty';
import { Games } from './views/Games';
import { PublicProfile } from './views/PublicProfile';
import { Affinity } from './views/Affinity';
import { PublicChat } from './views/PublicChat';
import { AnimeRanking } from './views/AnimeRanking';
import { Leaderboard } from './views/Leaderboard';

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
        <Route path="/genre/:genreUrl/:genreTitle" element={<Search />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/subscribed" element={<Navigate to="/favorites" replace />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<PublicProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/community" element={<Community />} />
        <Route path="/socialline" element={<Navigate to="/community" replace />} />
        <Route path="/public-chat" element={<PublicChat />} />
        <Route path="/ranking/anime" element={<AnimeRanking />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/friends/search" element={<Friends />} />
        <Route path="/friends/:friendId" element={<Friends />} />
        <Route path="/chat/:friendId" element={<Friends />} />
        <Route path="/affinity" element={<Affinity />} />
        <Route path="/profile/affinity" element={<Navigate to="/affinity" replace />} />
        <Route path="/watch-party" element={<WatchPartyView />} />
        <Route path="/watch-party/:id" element={<WatchPartyView />} />
        <Route path="/games" element={<Games />} />
        <Route path="/anibi-games" element={<Navigate to="/games" replace />} />
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
