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
import { leaderboard, listRepliesToOwnComments, type CommunityProfile } from '../lib/community';
import { loadAffinityLeaderboard, type AffinityLeaderboardRow } from '../lib/affinity';
import { listPublicChatChannels, listPublicChatMessages } from '../lib/publicChat';
import { CommunityAvatar } from '../ui/CommunityAvatar';
import { isNanimeDeveloper, DEVELOPER_LEVEL } from '../lib/developer';
import { RankInsignia } from '../ui/RankInsignia';
import { AffinityMark } from '../ui/AffinityMark';

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
  const [commentReplyIds, setCommentReplyIds] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [slide, setSlide] = useState(0);
  const [crystals, setCrystals] = useState<number | null>(null);
  const [communityLeaders, setCommunityLeaders] = useState<CommunityProfile[]>([]);
  const [affinityLeaders, setAffinityLeaders] = useState<AffinityLeaderboardRow[]>([]);
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

  // AniBiPlay shows the search field as a pinned overlay after the home header
  // has scrolled away; it does not occupy space in the initial home layout.
  useEffect(() => {
    const update = () => setSearchPinned(window.scrollY > 220);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const client = getClient();
    if (!client) return;
    void Promise.resolve(client.from('nanime_game_wallets').select('crystals').eq('user_id', user.id).maybeSingle())
      .then(({ data, error: walletError }) => { if (alive && !walletError) setCrystals(Number(data?.crystals || 0)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    let alive = true;
    const latestMessage = async () => {
      const channels = await listPublicChatChannels();
      const rows = channels[0] ? await listPublicChatMessages(channels[0].id, 1) : [];
      const message = rows[0];
      return message ? { content: message.content, username: message.profile?.username || 'Pengguna Nanime' } : null;
    };
    void Promise.allSettled([leaderboard(), loadAffinityLeaderboard(), latestMessage()]).then(results => {
      if (!alive) return;
      if (results[0].status === 'fulfilled') setCommunityLeaders(results[0].value);
      if (results[1].status === 'fulfilled') setAffinityLeaders(results[1].value);
      if (results[2].status === 'fulfilled') setLatestPublicMessage(results[2].value);
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
  const pages = (communityLeaders.length || affinityLeaders.length ? 1 : 0) + heroes.length;
  const next = continueList[0];

  const openCard = (c: AggregatedCard) => navigate(detailPath(c.canonicalId, c.title));
  const firstName = (user?.name || 'Sobat Anime').split(' ')[0];
  const developer = isNanimeDeveloper(user?.email);
  const fresh = useMemo(() => filterSubscribedUpdates(feed?.newUpdate || [], favorites), [feed?.newUpdate, favorites]);
  const notifRead = useNotifications(s => s.read);
  const notifRemoved = useNotifications(s => s.removed);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void listRepliesToOwnComments().then(rows => { if (alive) setCommentReplyIds(rows.map(row => `reply:${row.id}`)); }).catch(() => { if (alive) setCommentReplyIds([]); }); };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [user?.id]);
  const unreadNotifs = useMemo(
    () => fresh.filter(c => { const id = subscriptionUpdateId(c); return !notifRead.includes(id) && !notifRemoved.includes(id); }).length
      + commentReplyIds.filter(id => !notifRead.includes(id) && !notifRemoved.includes(id)).length,
    [fresh, commentReplyIds, notifRead, notifRemoved]
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
              <span className="uh-name-row">
                <span className="uh-name ellipsis">{user?.name || firstName}</span>
                {developer ? <span className="uh-user-number">#1</span> : null}
              </span>
              <span className="uh-chip">{developer ? <><RankInsignia rank="developer" size={16} />Lvl. {DEVELOPER_LEVEL}</> : <><Icon name="starFill" size={10} strokeWidth={0} />{history.length} ditonton</>}</span>
            </div>
          </button>
          <div className="uh-actions">
            <div className="bell-wrap">
              <button type="button" className="ibtn glow ripple-host" aria-label="Notifikasi" onClick={() => navigate('/notifications')}>
                <Icon name="bellFill" strokeWidth={0} />
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
            <span className="pb-free-icon"><Icon name="bell" size={18} strokeWidth={2.2} /></span>
            <span className="pb-left">
              <span className="pb-title">SEMUA FITUR GRATIS</span>
              <span className="pb-sub ellipsis">{next ? `Lanjutkan ${next.title}` : 'Anime, player, dan fitur komunitas terbuka untuk semua'}</span>
            </span>
          </button>

          {pages ? (
            <div className="anim-up">
              <div className="car-track no-scrollbar" ref={carRef} onScroll={onCarScroll}>
                {(communityLeaders.length || affinityLeaders.length) ? <div className="car-page">
                  <div className="board-card">
                    <button type="button" className="board-head" onClick={() => navigate('/leaderboard')}>
                      <Icon name="crown" size={14} strokeWidth={0} />
                      TOP LEADERBOARD
                    </button>
                    <div className="board-cols">
                      <div className="board-col">
                        <button type="button" className="board-label" onClick={() => navigate('/leaderboard')}>
                          <Icon name="chart" size={12} strokeWidth={2.2} />
                          Waktu aktif
                        </button>
                        {communityLeaders.slice(0, 4).map((person, i) => <button type="button" className="board-row" key={person.id} onClick={() => navigate(`/profile/${person.id}`)}>
                          <span className={'board-rank r' + (i + 1)}>{i + 1}</span><CommunityAvatar name={person.username} src={person.avatar_url} /><span className="board-name ellipsis">{person.username}</span><span className="board-val">{Math.floor(person.app_usage_seconds / 3600)}j</span>
                        </button>)}
                        {!communityLeaders.length ? <span className="board-empty">Belum ada data</span> : null}
                      </div>
                      <div className="board-col">
                        <button type="button" className="board-label" onClick={() => navigate('/affinity')}>
                          <Icon name="starFill" size={12} strokeWidth={0} />
                          Top Afinitas
                        </button>
                        {affinityLeaders.slice(0, 4).map((bond, i) => <button type="button" className="board-row affinity-board-row" key={bond.bond_id} onClick={() => navigate('/affinity')}>
                          <span className={'board-rank r' + (i + 1)}>{i + 1}</span><AffinityMark tier={bond.tier} size={16} active /><span className="board-name ellipsis">{bond.user_a.username} &amp; {bond.user_b.username}</span><span className="board-val">{bond.xp} XP</span>
                        </button>)}
                        {!affinityLeaders.length ? <span className="board-empty">Belum ada pasangan</span> : null}
                      </div>
                    </div>
                  </div>
                </div> : null}
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

          <div className={'home-search-sticky' + (searchPinned ? ' is-pinned' : '')} aria-hidden={!searchPinned}>
            <button type="button" className="search-pill" onClick={() => navigate('/search')}>
              <Icon name="search" size={16} strokeWidth={2.2} />
              <span className="sp-label ellipsis">Mencari anime</span>
              <span className="sp-go">
                <Icon name="right" size={13} strokeWidth={2.6} />
              </span>
            </button>
          </div>

          <button type="button" className="public-discussion-teaser anim-up" onClick={() => navigate('/public-chat')}>
            <span className="ir-title">
              <Icon name="chat" size={18} strokeWidth={2.2} />
              Public Diskusi
            </span>
            <span className="ir-sep" />
            <span className="ir-text ellipsis">{latestPublicMessage ? `${latestPublicMessage.username}: ${latestPublicMessage.content}` : 'Gabung percakapan komunitas anime'}</span>
            <Icon name="right" size={18} strokeWidth={2.4} />
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
              <SectionHead title="Weekly Anime" link="Semua" onLink={() => navigate('/ranking/anime')} />
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
