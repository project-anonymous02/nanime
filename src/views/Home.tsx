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
import { SmartImage } from '../ui/SmartImage';
import { detailPath, searchPath } from '../lib/nav';
import { getClient } from '../lib/supabase';
import { filterSubscribedUpdates, subscriptionUpdateId } from '../lib/subscriptions';

/** Beranda gaya AnibiPlay: kartu profil, leaderboard carousel, search, lalu rail/grid konten. */

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
  const [crystals, setCrystals] = useState<number | null>(null);

  const carRef = useRef<HTMLDivElement | null>(null);
  const homeRequest = useRef<AbortController | null>(null);

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

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const client = getClient();
    if (!client) return;
    void Promise.resolve(client.from('nanime_game_wallets').select('crystals').eq('user_id', user.id).maybeSingle())
      .then(({ data, error: walletError }) => { if (alive && !walletError) setCrystals(Number(data?.crystals || 0)); }).catch(() => undefined);
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
  const topRating = useMemo(
    () =>
      ranked
        .slice()
        .sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0))
        .slice(0, 4),
    [ranked]
  );
  const topEpisode = ranked.slice(0, 4);
  const pages = ranked.length ? 1 + heroes.length : 0;
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

  return (
    <>
      <div className="ptr" style={{ height: pull.refreshing ? 42 : pull.pull, opacity: pull.pull > 0 || pull.refreshing ? 1 : 0 }}>
        <span className="ptr-ring" />
      </div>

      <header className="home-hero">
        <div className="uh-top">
          <button type="button" className="uh-left" aria-label="Buka profil" onClick={() => navigate('/profile')}>
            {user?.avatar ? (
              <img className="uh-avatar" src={user.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="uh-avatar ph">
                <Icon name="user" size={18} strokeWidth={2} />
              </span>
            )}
            <div className="uh-id">
              <span className="uh-name ellipsis">{user?.name || firstName}</span>
              <span className="uh-chip">
                <Icon name="starFill" size={10} strokeWidth={0} />
                {history.length} ditonton
              </span>
            </div>
          </button>
          <div className="uh-actions">
            <div className="bell-wrap">
              <button type="button" className="ibtn glow ripple-host" aria-label="Notifikasi" onClick={() => navigate('/notifications')}>
                <Icon name="bell" />
              </button>
              {unreadNotifs ? <span className="bell-dot">{Math.min(unreadNotifs, 9)}</span> : null}
            </div>
            <button type="button" className="ibtn glow ripple-host" aria-label="Cari" onClick={() => navigate('/search')}>
              <Icon name="search" />
            </button>
          </div>
        </div>
        <div className="uh-stats">
          <button type="button" className="uh-crystal" onClick={() => navigate('/games')}><Icon name="sparkles" size={12} /> {crystals == null ? 'Crystal' : crystals.toLocaleString('id-ID') + ' Crystal'}</button>
          <button type="button" className="uh-games" onClick={() => navigate('/games')}><Icon name="sparkles" size={12} /> Nanime Games</button>
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

          <button
            type="button"
            className="home-next-banner anim-up"
            onClick={() => (next ? navigate(detailPath(next.animeId, next.title)) : navigate('/games'))}
          >
            <span className="pb-left">
              <span className="pb-title">SEMUA FITUR GRATIS</span>
              <span className="pb-sub ellipsis">{next ? `Lanjutkan ${next.title}` : 'Anime, player, dan fitur komunitas terbuka untuk semua'}</span>
            </span>
            <span className="pb-play">
              <Icon name="right" size={18} strokeWidth={2.4} />
            </span>
          </button>

          {pages ? (
            <div className="anim-up">
              <div className="car-track no-scrollbar" ref={carRef} onScroll={onCarScroll}>
                <div className="car-page">
                  <div className="board-card">
                    <div className="board-head">
                      <Icon name="starFill" size={13} strokeWidth={0} />
                      PERINGKAT MINGGUAN
                    </div>
                    <div className="board-cols">
                      <div className="board-col">
                        <span className="board-label">
                          <Icon name="chart" size={12} strokeWidth={2.2} />
                          Top Rating
                        </span>
                        {topRating.map((c, i) => (
                          <span className="board-row" key={c.canonicalId}>
                            <span className={'board-rank r' + (i + 1)}>{i + 1}</span>
                            <span className="board-name ellipsis">{c.title}</span>
                            <span className="board-val">{c.score && c.score !== '-' ? c.score : ''}</span>
                          </span>
                        ))}
                      </div>
                      <div className="board-col">
                        <span className="board-label">
                          <Icon name="film" size={12} strokeWidth={2.2} />
                          Top Episode
                        </span>
                        {topEpisode.map((c, i) => (
                          <span className="board-row" key={c.canonicalId}>
                            <span className={'board-rank r' + (i + 1)}>{i + 1}</span>
                            <span className="board-name ellipsis">{c.title}</span>
                            <span className="board-val">{/\d/.test(c.epLabel) ? c.epLabel : c.score && c.score !== '-' ? '★ ' + c.score : ''}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {heroes.map(c => (
                  <div className="car-page" key={c.canonicalId}>
                    <button type="button" className="hero-card" onClick={() => openCard(c)} aria-label={c.title}>
                      <SmartImage src={c.poster} animeId={c.canonicalId} alt={c.title} />
                      <span className="hero-shade" />
                      {c.views ? (
                        <span className="hero-views">
                          <Icon name="play" size={10} strokeWidth={0} />
                          {c.views}
                        </span>
                      ) : null}
                      {c.rank ? <span className="hero-rank">#{c.rank}</span> : null}
                      <span className="hero-title clamp-2">{c.title}</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="car-dots">
                {Array.from({ length: pages }).map((_, i) => (
                  <span key={i} className={'car-dot' + (slide === i ? ' on' : '')} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="home-search-sticky">
            <button type="button" className="search-pill" onClick={() => navigate('/search')}>
              <Icon name="search" size={16} strokeWidth={2.2} />
              <span className="sp-label ellipsis">Cari anime, donghua, movie…</span>
              <span className="sp-go">
                <Icon name="right" size={13} strokeWidth={2.6} />
              </span>
            </button>
          </div>

          <button type="button" className="info-row anim-up" onClick={() => navigate('/settings')}>
            <span className="ir-title">
              <Icon name="info" size={14} strokeWidth={2.2} />
              Nanime
            </span>
            <span className="ir-sep" />
            <span className="ir-text ellipsis">Konten dihimpun dari tautan publik di internet.</span>
            <Icon name="right" size={14} strokeWidth={2.4} />
          </button>

          {continueList.length ? (
            <section className="section">
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
            <section className="section">
              <SectionHead title="New Anime Update" link="Semua" onLink={() => navigate('/search')} />
              <Grid>
                {fresh.slice(0, 12).map((c, i) => (
                  <UpdateCard key={c.canonicalId} card={c} index={i} badge="New" onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          <section className="section">
            <SectionHead title="Genre Series" />
            <div className="genre-chips">
              {GENRES.map(g => (
                <button key={g} type="button" className="chip" onClick={() => navigate(searchPath(g))}>
                  {g}
                </button>
              ))}
            </div>
          </section>

          {ranked.length ? (
            <section className="section">
              <SectionHead title="Weekly Anime" link="Semua" onLink={() => navigate('/search')} />
              <div className="rank-grid">
                {ranked.slice(0, 8).map((c, i) => (
                  <RankCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
                ))}
              </div>
            </section>
          ) : null}

          {feed.completed.length ? (
            <section className="section">
              <SectionHead title="Completed Anime" link="Semua" onLink={() => navigate('/search')} />
              <Grid>
                {feed.completed.slice(0, 9).map((c, i) => (
                  <UpdateCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          {feed.donghua.length ? (
            <section className="section">
              <SectionHead title="Donghua Update" link="Semua" onLink={() => navigate('/search')} />
              <div className="rank-grid">
                {feed.donghua.slice(0, 6).map((c, i) => (
                  <RankCard key={c.canonicalId} card={{ ...c, rank: undefined }} index={i} onOpen={openCard} />
                ))}
              </div>
            </section>
          ) : null}

          {feed.movie.length ? (
            <section className="section">
              <SectionHead title="Movie Update" link="Semua" onLink={() => navigate('/search')} />
              <Grid>
                {feed.movie.slice(0, 9).map((c, i) => (
                  <UpdateCard key={c.canonicalId} card={c} index={i} badge="Movie" onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          {!continueList.length && !fresh.length && !feed.completed.length ? (
            <div className="poster-grid">
              <PosterSkel />
              <PosterSkel />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
