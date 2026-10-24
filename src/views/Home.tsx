import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard, HomeFeed } from '../core/types';
import { useAuth } from '../state/auth';
import { useLibrary } from '../state/library';
import { useNotifications } from '../state/notifications';
import { ContinueRailCard, Grid, RankCard, Rail, UpdateCard } from '../ui/Cards';
import { ErrorState, ListSkel, OfflineBar, PosterSkel, RailSkel, SectionHead } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { usePullToRefresh } from '../ui/hooks';
import { PullToRefreshIndicator } from '../ui/PullToRefresh';
import { SmartImage } from '../ui/SmartImage';
import { detailPath, genrePath } from '../lib/nav';
import { filterSubscribedUpdates, subscriptionUpdateId } from '../lib/subscriptions';
import { listPublicChatChannels, listPublicChatMessages } from '../lib/publicChat';

/** Beranda: kartu profil, hero anime, lalu rail/grid konten. */

const GENRES = [
  'Action', 'Adult Cast', 'Adventure', 'Avant Garde', 'Award Winning', 'Comedy', 'Demons', 'Drama', 'Ecchi',
  'Fantasy', 'Game', 'Girls Love', 'Gore', 'Gourmet', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Magic',
  'Martial Arts', 'Mecha', 'Military', 'Music', 'Mystery', 'Mythology', 'Parody', 'Psychological', 'Reincarnation',
  'Romance', 'Samurai', 'School', 'Sci-Fi', 'Seinen', 'Shoujo', 'Shoujo Ai', 'Shounen', 'Slice Of Life', 'Space',
  'Sports', 'Super Power', 'Supernatural', 'Suspense', 'Thriller', 'Time Travel', 'Tokusatsu', 'Vampire', 'Movie'
];

export function Home() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const history = useLibrary(s => s.history);
  const favorites = useLibrary(s => s.favorites);

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [error, setError] = useState(false);
  const [slide, setSlide] = useState(0);
  const [latestPublicMessage, setLatestPublicMessage] = useState<{ content: string; username: string } | null>(null);
  const [searchPinned, setSearchPinned] = useState(false);

  const carRef = useRef<HTMLDivElement | null>(null);
  const homeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.dataset.page = 'home';
    return () => { delete document.documentElement.dataset.page; };
  }, []);

  const load = useCallback(async (fresh = false) => {
    homeRequest.current?.abort();
    const controller = new AbortController();
    homeRequest.current = controller;
    setError(false);
    try {
      // Tampil seketika dari cache lama (stale); hasil segar menyusul diam-diam.
      const result = await Catalog.home({ fresh, signal: controller.signal, onFresh: f => {
        if (!controller.signal.aborted) setFeed(f);
      } });
      if (!controller.signal.aborted) setFeed(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => homeRequest.current?.abort();
  }, [load]);

  // Search field pinned setelah header bergulir menjauh.
  useEffect(() => {
    const update = () => setSearchPinned(window.scrollY > 220);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    let alive = true;
    const latestMessage = async () => {
      const channels = await listPublicChatChannels();
      const rows = channels[0] ? await listPublicChatMessages(channels[0].id, 1) : [];
      const message = rows[0];
      return message ? { content: message.content, username: message.profile?.username || 'Pengguna Nanime' } : null;
    };
    void latestMessage().then(message => {
      if (!alive) return;
      setLatestPublicMessage(message);
    }).catch(() => {
      if (alive) setLatestPublicMessage(null);
    });
    return () => { alive = false; };
  }, [user?.id]);

  const pull = usePullToRefresh(() => load(true));

  const continueList = useMemo(
    () =>
      history
        .slice()
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .filter(h => !h.completed)
        .slice(0, 8),
    [history]
  );

  const ranked = feed?.weekly ?? [];
  const heroes = useMemo(() => ranked.slice(0, 2), [ranked]);
  const pages = heroes.length;
  const next = continueList[0];

  const openCard = (c: AggregatedCard) => navigate(detailPath(c.canonicalId, c.title));
  const firstName = (user?.name || 'Sobat Anime').split(' ')[0];
  const fresh = useMemo(() => filterSubscribedUpdates(feed?.newUpdate || [], favorites), [feed?.newUpdate, favorites]);
  const notifRead = useNotifications(s => s.read);
  const notifRemoved = useNotifications(s => s.removed);
  const unreadNotifs = useMemo(
    () => fresh.filter(c => { const id = subscriptionUpdateId(c); return !notifRead.includes(id) && !notifRemoved.includes(id); }).length,
    [fresh, notifRead, notifRemoved]
  );

  const onCarScroll = () => {
    const el = carRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / w);
    setSlide(prev => (prev === idx ? prev : idx));
  };

  // Feed stale/fresh may replace hero cards while the user is on a later slide.
  // Reset to the first actual anime so the dots and visible card stay aligned.
  const heroIds = heroes.map(hero => hero.canonicalId).join('|');
  useEffect(() => {
    setSlide(0);
    if (carRef.current) carRef.current.scrollLeft = 0;
  }, [heroIds]);

  return (
    <>
      <PullToRefreshIndicator state={pull} />

      <header className="hn-homehead">
        <div className="hn-homehead-user">
          <button type="button" className="hn-avatarrow" aria-label="Buka profil" onClick={() => navigate('/profile')}>
            {user?.avatar ? (
              <img className="hn-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="hn-avatar hn-avatar-fallback">
                <Icon name="user" size={18} strokeWidth={2} />
              </span>
            )}
            <div className="hn-homehead-stats">
              <span className="hn-homehead-name">{user?.name || firstName}</span>
              <span className="hn-homehead-sub"><Icon name="starFill" size={10} strokeWidth={0} />{history.length} ditonton</span>
            </div>
          </button>
        </div>
        <div className="hn-homehead-actions">
          <div className="hn-notifwrap">
            <button type="button" className="hn-iconbtn" aria-label="Notifikasi" onClick={() => navigate('/notifications')}>
              <Icon name="bellFill" strokeWidth={0} />
            </button>
            {unreadNotifs ? <span className="hn-dot" style={{ position: 'absolute', top: 6, right: 6 }}>{null}</span> : null}
          </div>
          <button type="button" className="hn-iconbtn" aria-label="Cari" onClick={() => navigate('/search')}>
            <Icon name="search" />
          </button>
        </div>
      </header>

      {error && !feed ? <ErrorState onRetry={() => void load()} /> : null}
      {!error && !feed ? (
        <>
          <div style={{ marginBottom: 34 }}>
            <RailSkel count={3} />
          </div>
          <ListSkel count={3} />
        </>
      ) : null}

      {feed ? (
        <>
          <OfflineBar show={feed.stale} />

          {pages ? (
            <div>
              <div className="hn-hero-track no-scrollbar" ref={carRef} onScroll={onCarScroll}>
                {heroes.map(c => (
                  <div className="hn-hero" key={c.canonicalId} style={{ width: '100%', scrollSnapAlign: 'center' }}>
                    <button type="button" onClick={() => openCard(c)} aria-label={c.title} style={{ width: '100%', display: 'block' }}>
                      <SmartImage className="hn-hero-img" src={c.poster} animeId={c.canonicalId} alt={c.title} />
                      <span className="hn-hero-scrim" />
                      {c.views ? (
                        <span className="hn-hero-views">
                          <Icon name="play" size={10} strokeWidth={0} />
                          {c.views}
                        </span>
                      ) : null}
                      {c.rank ? <span className="hn-hero-rank">#{c.rank}</span> : null}
                      <span className="hn-hero-title">{c.title}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="hn-hero-dots">
                {Array.from({ length: pages }).map((_, i) => (
                  <span key={i} className={`hn-hero-dot${slide === i ? ' hn-active' : ''}`} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="hn-searchpin" data-open={searchPinned} aria-hidden={!searchPinned}>
            <button type="button" onClick={() => navigate('/search')}>
              <Icon name="search" size={16} strokeWidth={2.2} />
              <span className="hn-ellipsis" style={{ flex: 1 }}>Mencari anime</span>
              <Icon name="right" size={13} strokeWidth={2.6} />
            </button>
          </div>

          <button type="button" className="hn-row" style={{ margin: '14px var(--pad-x) 0', width: 'calc(100% - 32px)' }} onClick={() => navigate('/public-chat')}>
            <span className="hn-menuitem-icon"><Icon name="chat" size={18} strokeWidth={2.2} /></span>
            <span className="hn-row-main">
              <span className="hn-row-title">Public Chat</span>
              <span className="hn-row-sub">{latestPublicMessage ? `${latestPublicMessage.username}: ${latestPublicMessage.content}` : 'Gabung percakapan komunitas anime'}</span>
            </span>
            <Icon name="right" size={18} strokeWidth={2.4} />
          </button>

          {continueList.length ? (
            <section className="hn-section">
              <SectionHead title="Terakhir Ditonton" link="Riwayat" onLink={() => navigate('/history')} />
              <Rail>
                {continueList.map(h => (
                  <ContinueRailCard
                    key={h.animeId + '|' + h.episode}
                    item={h}
                    onOpen={it => navigate(detailPath(it.animeId, it.title))}
                  />
                ))}
              </Rail>
            </section>
          ) : null}

          {fresh.length ? (
            <section className="hn-section">
              <SectionHead title="New Anime Update" link="Semua" onLink={() => navigate('/search')} />
              <Grid>
                {fresh.slice(0, 12).map((c, i) => (
                  <UpdateCard key={c.canonicalId} card={c} index={i} badge="New" onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          <section className="hn-section">
            <SectionHead title="Genre Series" />
            <div className="hn-chiprow" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
              {GENRES.map(g => (
                <button key={g} type="button" className="hn-chip" onClick={() => navigate(genrePath(g))}>
                  {g}
                </button>
              ))}
            </div>
          </section>

          {ranked.length ? (
            <section className="hn-section">
              <SectionHead title="Weekly Anime" link="Semua" onLink={() => navigate('/ranking/anime')} />
              <div className="hn-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {ranked.slice(0, 8).map((c, i) => (
                  <RankCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
                ))}
              </div>
            </section>
          ) : null}

          {feed.completed.length ? (
            <section className="hn-section">
              <SectionHead title="Completed Anime" link="Semua" onLink={() => navigate('/search')} />
              <Grid>
                {feed.completed.slice(0, 9).map((c, i) => (
                  <UpdateCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          {feed.movie.length ? (
            <section className="hn-section">
              <SectionHead title="Movie Update" link="Semua" onLink={() => navigate('/search')} />
              <Grid>
                {feed.movie.slice(0, 9).map((c, i) => (
                  <UpdateCard key={c.canonicalId} card={c} index={i} badge="Movie" onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          {!continueList.length && !fresh.length && !feed.completed.length ? (
            <div className="hn-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: '0 var(--pad-x)' }}>
              <PosterSkel />
              <PosterSkel />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
