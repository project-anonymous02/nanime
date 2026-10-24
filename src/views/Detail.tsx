import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import { recordClientMetric } from '../core/services/Telemetry';
import type { AggregatedCard, DetailBundle } from '../core/types';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Grid, UpdateCard } from '../ui/Cards';
import { ErrorState, Skel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { detailPath, shareOrCopy } from '../lib/nav';
import { usePlayer } from '../state/player';
import { useSettings } from '../state/settings';

/** Detail anime — hero, chip, synopsis, related, daftar episode list/grid. */

function typeIcon(kind?: string): string | null {
  const v = (kind || '').toLowerCase();
  if (v.includes('movie') || v.includes('film')) return `${import.meta.env.BASE_URL}ref/icons/movie.png`;
  if (v.includes('ova')) return `${import.meta.env.BASE_URL}ref/icons/ova.png`;
  if (v.includes('live action') || v.includes('live-action')) return `${import.meta.env.BASE_URL}ref/icons/live-action.png`;
  if (v) return `${import.meta.env.BASE_URL}ref/icons/series.png`;
  return null;
}

export function Detail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const titleHint = params.get('title') || '';
  const navigate = useNavigate();

  const [bundleState, setBundle] = useState<DetailBundle | null>(null);
  const bundle = bundleState?.id === id ? bundleState : null;
  const [error, setError] = useState(false);
  const [expand, setExpand] = useState(false);
  const [epMode, setEpMode] = useState<'list' | 'grid'>('list');
  const [epQuery, setEpQuery] = useState('');
  const [stuck, setStuck] = useState(false);
  const requestId = useRef(0);
  const lastProgressWrite = useRef(0);

  const playerSession = usePlayer(s => s.session?.animeId === id ? s.session : null);
  const startPlayer = usePlayer(s => s.start);
  const updatePlayer = usePlayer(s => s.update);
  const playingEpisode = playerSession?.episode || null;
  const streamLoading = playerSession?.loading || false;

  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const history = useLibrary(s => s.history);
  const addHistory = useLibrary(s => s.addHistory);
  const preferences = useSettings();

  const load = useCallback(async () => {
    const request = ++requestId.current;
    const startedAt = performance.now();
    setError(false);
    setBundle(null);
    try {
      const result = await Catalog.detail(id, { title: titleHint });
      if (request === requestId.current) {
        recordClientMetric({ name: 'detail-load', durationMs: performance.now() - startedAt, ok: true });
        setBundle(result);
      }
    } catch {
      if (request === requestId.current) {
        recordClientMetric({ name: 'detail-load', durationMs: performance.now() - startedAt, ok: false });
        setError(true);
      }
    }
  }, [id, titleHint]);

  useEffect(() => {
    window.scrollTo(0, 0);
    void load();
    return () => { requestId.current++; };
  }, [load]);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > window.innerHeight * 0.4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isFav = favorites.some(f => f.id === id);
  const episodes = bundle?.episodeList || [];

  const progressMap = useMemo(() => {
    const m = new Map<string, { percent: number; completed: boolean; watchedAt: number }>();
    history
      .filter(h => h.animeId === id)
      .forEach(h => {
        const prev = m.get(h.episode);
        if (!prev || h.watchedAt > prev.watchedAt) m.set(h.episode, { percent: h.percent, completed: h.completed, watchedAt: h.watchedAt });
      });
    return m;
  }, [history, id]);

  const resumeEp = useMemo(() => {
    const entries = history
      .filter(h => h.animeId === id && !h.completed)
      .sort((a, b) => b.watchedAt - a.watchedAt)[0];
    if (entries) return entries.episode;
    return episodes[0]?.num || '';
  }, [history, id, episodes]);

  const filteredEps = useMemo(() => {
    const q = epQuery.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter(ep => (ep.num + ' ' + (ep.title || '')).toLowerCase().includes(q));
  }, [episodes, epQuery]);

  const onShare = async () => {
    const url = location.origin + location.pathname + '#' + detailPath(id, bundle?.title || titleHint);
    const ok = await shareOrCopy(bundle?.title || titleHint, url);
    if (ok) toast('Tautan disalin', 'ok');
  };

  const onFav = () => {
    if (!bundle) return;
    toggleFavorite({
      id,
      title: bundle.title,
      poster: bundle.poster,
      score: bundle.score,
      type: bundle.type,
      status: bundle.status
    });
    toast(isFav ? 'Dihapus dari favorit' : 'Ditambahkan ke favorit', 'ok');
  };

  const openCard = (c: AggregatedCard) => navigate(detailPath(c.canonicalId, c.title));

  const playEpisode = async (ep: (typeof episodes)[number]) => {
    const startedAt = performance.now();
    lastProgressWrite.current = 0;
    const episodeIndex = episodes.findIndex(item => item.num === ep.num);
    const previousEpisode = episodeIndex > 0 ? episodes[episodeIndex - 1] : undefined;
    const nextEpisode = episodeIndex >= 0 ? episodes[episodeIndex + 1] : undefined;
    const request = startPlayer({
      animeId: id,
      title: bundle?.title || titleHint,
      poster: bundle?.poster || '',
      synopsis: bundle?.synopsis || '',
      episode: ep.num,
      onPrevious: previousEpisode ? () => { void playEpisode(previousEpisode); } : undefined,
      onNext: nextEpisode ? () => { void playEpisode(nextEpisode); } : undefined,
      retry: () => { void playEpisode(ep); },
      onProgress: savePlaybackProgress(ep.num)
    });
    let timeoutId = 0;
    try {
      const preferred = ep.sources[0];
      const resolution = Catalog.stream(id, ep.num, {
        title: bundle?.title || titleHint,
        episodeProvider: preferred?.provider,
        episodeId: preferred?.id || ep.id,
        episodeSlug: preferred?.slug || ep.slug
      });
      const result = await Promise.race([
        resolution,
        new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error('Resolusi sumber memerlukan waktu terlalu lama. Periksa koneksi lalu coba lagi.')), 30_000); })
      ]);
      if (usePlayer.getState().session?.request !== request) return;
      if (result.availability === 'unavailable' || (!result.servers.length && !result.qualities.length)) {
        throw new Error(result.unavailableReason || 'Sumber video episode ini tidak tersedia. Coba lagi atau pilih episode lain.');
      }
      recordClientMetric({ name: 'playback-resolution', durationMs: performance.now() - startedAt, ok: true, count: result.servers.length + result.qualities.length });
      const qualityIndex = result.qualities.filter(quality => quality.source).findIndex(quality => quality.label === preferences.defaultQuality);
      updatePlayer(request, { stream: result, sourceIndex: qualityIndex >= 0 ? qualityIndex : 0 });
    } catch (cause) {
      if (usePlayer.getState().session?.request === request) {
        recordClientMetric({ name: 'playback-resolution', durationMs: performance.now() - startedAt, ok: false });
        updatePlayer(request, { error: (cause as Error)?.message || 'Gagal menyiapkan episode. Periksa koneksi lalu coba lagi.' });
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (usePlayer.getState().session?.request === request) updatePlayer(request, { loading: false });
    }
  };

  // Deep-link episode berisikan ?episode=N langsung memutar episode itu.
  useEffect(() => {
    const episodeNumber = params.get('episode');
    if (!bundle || !episodeNumber || playerSession?.episode === episodeNumber) return;
    const episode = episodes.find(item => item.num === episodeNumber || item.id === episodeNumber);
    if (episode) void playEpisode(episode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.id, episodes.length, params, playerSession?.episode]);

  const savePlaybackProgress = (episode: string) => (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!bundle) return;
    const video = event.currentTarget;
    const preferences = useSettings.getState();
    if (event.type === 'timeupdate' && preferences.skipIntro && video.currentTime > 0 && video.currentTime < preferences.introDuration - 2) {
      video.currentTime = preferences.introDuration;
      return;
    }
    const now = Date.now();
    if (event.type === 'timeupdate' && now - lastProgressWrite.current < 15_000) return;
    lastProgressWrite.current = now;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const percent = duration > 0 ? Math.min(100, Math.round(video.currentTime / duration * 100)) : 0;
    addHistory({ animeId: id, episode, title: bundle.title, poster: bundle.poster, positionSec: Math.floor(video.currentTime), durationSec: Math.floor(duration), percent, completed: event.type === 'ended' || percent >= 92, watchedAt: now });
    if (event.type === 'ended' && preferences.autoplayNext) {
      const currentIndex = episodes.findIndex(item => item.num === episode);
      const nextEpisode = currentIndex >= 0 ? episodes[currentIndex + 1] : undefined;
      if (nextEpisode) void playEpisode(nextEpisode);
    }
  };

  if (error && !bundle) {
    return (
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <ErrorState onRetry={() => void load()} />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="hn-detail-loading">
        <div style={{ aspectRatio: '16 / 7' }}>
          <Skel className="hn-skel" style={{ height: '100%', borderRadius: 0 }} />
        </div>
        <div style={{ padding: 18 }}>
          <Skel style={{ height: 20, width: '60%' }} />
          <div style={{ marginTop: 12 }}>
            <Skel style={{ height: 12, width: '40%' }} />
          </div>
        </div>
      </div>
    );
  }

  const heroIcon = typeIcon(bundle.type);

  return (
    <>
      <div className="hn-detail-bar" data-stuck={stuck}>
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <span className="hn-ellipsis" style={{ flex: 1, fontWeight: 700, visibility: stuck ? 'visible' : 'hidden' }}>{bundle.title}</span>
        <button type="button" className="hn-iconbtn" aria-label="Bagikan" onClick={() => void onShare()}>
          <Icon name="share" />
        </button>
      </div>

      <div className="hn-detail-hero">
        <div style={{ position: 'relative', aspectRatio: '16 / 8', overflow: 'hidden' }}>
          <SmartImage key={bundle.id} className="hn-hero-fade" src={bundle.heroImage || bundle.poster} animeId={bundle.id} alt={bundle.title} eager style={{ position: 'absolute', inset: 0 }} />
          <div className="hn-hero-scrim" />
        </div>
        <div className="hn-detail-hero-actions">
          <button type="button" className="hn-iconbtn" aria-label="Kembali" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="hn-iconbtn" aria-label="Bagikan" onClick={() => void onShare()}>
            <Icon name="share" />
          </button>
          <button
            type="button"
            className="hn-iconbtn"
            aria-label={isFav ? 'Berhenti berlangganan anime' : 'Subscribe anime'}
            aria-pressed={isFav}
            style={isFav ? { color: 'var(--accent-pink)' } : undefined}
            onClick={onFav}
          >
            <Icon name={isFav ? 'heartFill' : 'heart'} />
          </button>
        </div>
        <div className="hn-detail-titleblock hn-page">
          {bundle.alt ? <p className="hn-detail-alt">{bundle.alt}</p> : null}
          <h1 className="hn-detail-title">{bundle.title}</h1>
          <p className="hn-detail-inline-sub">
            <Icon name="calendar" size={14} strokeWidth={2.2} />
            {bundle.status || 'Sedang Tayang'}
          </p>
        </div>
      </div>

      <div className="hn-page">
        <div className="hn-detail-chips">
          {bundle.score && bundle.score !== '-' ? (
            <span className="hn-chip hn-active">
              <Icon name="starFill" size={11} strokeWidth={0} />
              {bundle.score}
            </span>
          ) : null}
          {heroIcon ? <img className="hn-typeicon" src={heroIcon} alt={bundle.type || ''} title={bundle.type || ''} /> : null}
          {bundle.year ? <span className="hn-chip">{bundle.year}</span> : null}
          {bundle.type ? <span className="hn-chip">{bundle.type}</span> : null}
          {bundle.episodes ? <span className="hn-chip">{bundle.episodes} eps</span> : null}
          {bundle.duration ? <span className="hn-chip">{bundle.duration}</span> : null}
        </div>

        <div className="hn-detail-actions">
          <button type="button" className="hn-btn" disabled={!episodes.length || streamLoading} onClick={() => {
            const episode = episodes.find(ep => ep.num === resumeEp) || episodes[0];
            if (episode) void playEpisode(episode);
          }}>
            <Icon name="play" size={16} strokeWidth={0} /> {streamLoading ? 'Menyiapkan…' : 'Tonton Sekarang'}
          </button>
          <button type="button" className="hn-ghostbtn" onClick={onFav}>
            <Icon name={isFav ? 'bellFill' : 'bell'} size={16} strokeWidth={2} />
            {isFav ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>

        {bundle.genres.length ? (
          <div className="hn-chiprow">
            {bundle.genres.slice(0, 6).map(g => (
              <button key={g} type="button" className="hn-chip" onClick={() => navigate(`/genre/${encodeURIComponent(g)}/${encodeURIComponent(g)}`)}>
                {g}
              </button>
            ))}
          </div>
        ) : null}

        {bundle.synopsis ? (
          <div className="hn-section">
            <div className="hn-section-head">
              <h2 className="hn-section-title">Synopsis</h2>
              {bundle.synopsis.length > 120 ? (
                <button type="button" className="hn-section-link" onClick={() => setExpand(v => !v)}>
                  {expand ? 'Tutup' : 'Selengkapnya'}
                  <Icon name={expand ? 'up' : 'down'} size={13} strokeWidth={2.6} />
                </button>
              ) : null}
            </div>
            <p className="hn-detail-synopsis" data-expand={expand}>{bundle.synopsis}</p>
          </div>
        ) : null}

        {bundle.recommendations.length ? (
          <section className="hn-section">
            <h2 className="hn-section-title" style={{ padding: '0 var(--pad-x) 10px' }}>Related Anime</h2>
            <Grid>
              {bundle.recommendations.slice(0, 9).map((c, i) => (
                <UpdateCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
              ))}
            </Grid>
          </section>
        ) : null}

        {episodes.length ? (
          <section className="hn-section">
            <h2 className="hn-section-title" style={{ padding: '0 var(--pad-x) 10px' }}>Daftar Episode</h2>
            <div className="hn-detail-epbar">
              <div className="hn-searchbar" style={{ margin: 0, flex: 1, height: 44 }}>
                <Icon name="search" size={16} strokeWidth={2.2} />
                <input
                  className="hn-searchinput"
                  type="search"
                  placeholder="Cari episode…"
                  value={epQuery}
                  onChange={e => setEpQuery(e.target.value)}
                  aria-label="Cari episode"
                />
              </div>
              <button type="button" className="hn-iconbtn" aria-label="Urutan episode" onClick={() => setEpQuery('')}>
                <Icon name={epQuery ? 'x' : 'down'} size={16} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                className="hn-iconbtn"
                aria-label="Mode grid"
                aria-pressed={epMode === 'grid'}
                onClick={() => setEpMode(m => (m === 'grid' ? 'list' : 'grid'))}
              >
                <Icon name="grid" size={16} strokeWidth={2.2} />
              </button>
            </div>

            {epMode === 'list' ? (
              <div className="hn-rowlist" style={{ marginTop: 12 }}>
                {filteredEps.map(ep => {
                  const pr = progressMap.get(ep.num);
                  const active = resumeEp === ep.num && !!pr;
                  return (
                    <div className="hn-row" key={ep.num + ep.id} style={active && pr ? { borderColor: 'var(--border-blue)' } : undefined}>
                      <button type="button" className="hn-row-main" aria-label={`Putar episode ${ep.num}`} aria-busy={streamLoading && playingEpisode === ep.num} onClick={() => void playEpisode(ep)}>
                        <span className="hn-row-title">Episode {ep.num}
                          {pr?.completed ? <span style={{ color: 'var(--accent-green)', fontSize: 'var(--fs-label)', marginLeft: 6 }}>· Selesai</span> : null}
                        </span>
                        {ep.date ? <span className="hn-row-sub">{ep.date}</span> : null}
                        {pr && pr.percent > 0 ? (
                          <span className="hn-progressbar" style={{ position: 'static', marginTop: 6 }}>
                            <span className="hn-progressbar-fill" style={{ width: `${Math.min(100, Math.round(pr.percent))}%` }} />
                          </span>
                        ) : null}
                      </button>
                      <button type="button" className="hn-iconbtn" aria-label={`Putar episode ${ep.num}`} onClick={() => void playEpisode(ep)}><Icon name="play" size={15} /></button>
                    </div>
                  );
                })}
                {!filteredEps.length ? <p className="hn-state">Episode tidak ditemukan.</p> : null}
              </div>
            ) : (
              <>
                <div className="hn-detail-epgrid" style={{ marginTop: 12 }}>
                  {filteredEps.map(ep => {
                    const pr = progressMap.get(ep.num);
                    return (
                      <button type="button" className="hn-chip" key={ep.num + ep.id} style={pr?.completed ? { color: 'var(--accent-green)' } : undefined} onClick={() => void playEpisode(ep)} aria-label={`Putar episode ${ep.num}`} aria-busy={streamLoading && playingEpisode === ep.num}>
                        Eps {ep.num}
                        <Icon name="play" size={12} strokeWidth={0} />
                      </button>
                    );
                  })}
                </div>
                {!filteredEps.length ? <p className="hn-state">Episode tidak ditemukan.</p> : null}
              </>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
