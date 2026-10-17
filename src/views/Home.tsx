import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard, HomeFeed } from '../core/types';
import { useAuth } from '../state/auth';
import { useLibrary } from '../state/library';
import { AnimeCard, ContinueCard, Grid, Rail, WeeklyCard } from '../ui/Cards';
import { ErrorState, ListSkel, OfflineBar, PosterSkel, RailSkel, SectionHead } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { usePullToRefresh } from '../ui/hooks';
import { Sheet, SheetItem } from '../ui/Sheet';
import { detailPath, watchPath } from '../lib/nav';

/** Beranda — sapaan, lanjut menonton, peringkat mingguan, dan rail konten. */

export function Home() {
  const navigate = useNavigate();
  const user = useAuth(s => s.user);
  const history = useLibrary(s => s.history);
  const removeHistory = useLibrary(s => s.removeHistory);

  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [error, setError] = useState(false);
  const [bell, setBell] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setFeed(await Catalog.home());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pull = usePullToRefresh(load);

  const continueList = useMemo(
    () =>
      history
        .slice()
        .sort((a, b) => b.watchedAt - a.watchedAt)
        .filter(h => !h.completed)
        .slice(0, 8),
    [history]
  );

  const openCard = (c: AggregatedCard) => navigate(detailPath(c.canonicalId, c.title));
  const firstName = (user?.name || 'Sobat Anime').split(' ')[0];
  const fresh = feed?.newUpdate || [];

  return (
    <>
      <div className="ptr" style={{ height: pull.refreshing ? 42 : pull.pull, opacity: pull.pull > 0 || pull.refreshing ? 1 : 0 }}>
        <span className="ptr-ring" />
      </div>

      <header className="home-head">
        <div className="hh-name">
          <div className="hh-hi">Halo, {firstName}</div>
          <div className="hh-title">Mau nonton apa hari ini?</div>
        </div>
        <div className="bell-wrap">
          <button type="button" className="ibtn ripple-host" aria-label="Notifikasi" onClick={() => setBell(true)}>
            <Icon name="bell" />
          </button>
          {fresh.length ? <span className="bell-dot">{Math.min(fresh.length, 9)}</span> : null}
        </div>
      </header>

      <Sheet open={bell} onClose={() => setBell(false)} title="Notifikasi">
        {fresh.length ? (
          fresh.slice(0, 5).map(c => (
            <SheetItem
              key={c.canonicalId}
              icon={<Icon name="film" />}
              onClick={() => {
                setBell(false);
                openCard(c);
              }}
            >
              Update baru: {c.title}
            </SheetItem>
          ))
        ) : (
          <p style={{ color: 'var(--text-secondary)', padding: '10px 4px' }}>Belum ada notifikasi baru.</p>
        )}
      </Sheet>

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

          {continueList.length ? (
            <section className="section">
              <SectionHead title="Lanjutkan Menonton" />
              <div style={{ display: 'grid', gap: 10 }}>
                {continueList.map(h => (
                  <ContinueCard
                    key={h.animeId + '|' + h.episode}
                    item={h}
                    onOpen={it => navigate(watchPath(it.animeId, it.episode, it.title))}
                    onRemove={it => removeHistory([{ animeId: it.animeId, episode: it.episode }])}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {feed.weekly.length ? (
            <section className="section">
              <SectionHead title="Peringkat Mingguan" />
              <Rail>
                {feed.weekly.map(c => (
                  <WeeklyCard key={c.canonicalId} card={c} onOpen={openCard} />
                ))}
              </Rail>
            </section>
          ) : null}

          {fresh.length ? (
            <section className="section">
              <SectionHead title="Update Terbaru" />
              <Grid>
                {fresh.slice(0, 12).map((c, i) => (
                  <AnimeCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
                ))}
              </Grid>
            </section>
          ) : null}

          {feed.donghua.length ? (
            <section className="section">
              <SectionHead title="Donghua" />
              <Rail>
                {feed.donghua.slice(0, 15).map((c, i) => (
                  <AnimeCard key={c.canonicalId} card={c} index={i} onOpen={openCard} width={132} />
                ))}
              </Rail>
            </section>
          ) : null}

          {feed.movie.length ? (
            <section className="section">
              <SectionHead title="Movie" />
              <Rail>
                {feed.movie.slice(0, 15).map((c, i) => (
                  <AnimeCard key={c.canonicalId} card={c} index={i} onOpen={openCard} width={132} />
                ))}
              </Rail>
            </section>
          ) : null}

          {feed.completed.length ? (
            <section className="section">
              <SectionHead title="Selesai Tayang" />
              <Grid>
                {feed.completed.slice(0, 12).map((c, i) => (
                  <AnimeCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
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
