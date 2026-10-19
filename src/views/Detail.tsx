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
import { Comments } from './Comments';
import { usePlayer } from '../state/player';
import { useSettings } from '../state/settings';
import { useWatchParty } from '../state/watchParty';
import { updatePartyEpisode } from '../lib/watchParty';
import { currentUserId } from '../state/auth';

/** Detail anime ala referensi — hero, chip, synopsis, related, daftar episode list/grid. */

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
  const autoPartyEpisode = useRef('');

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
  const activeParty = useWatchParty(s => s.active);

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
    const party = useWatchParty.getState().active;
    if (party?.host_id === currentUserId() && party.anime_id === id && party.episode !== ep.num) {
      autoPartyEpisode.current = `${party.id}:${id}:${ep.num}`;
      try {
        const updated = await updatePartyEpisode(party.id, ep.num);
        useWatchParty.getState().set(updated);
      } catch (cause) {
        toast(`Episode diputar lokal, tetapi Nobar gagal diperbarui: ${(cause as Error).message}`, 'err');
      }
    }
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

  // A room's "open episode" link is executable: load the catalog first, then
  // resolve the exact Nanime episode and launch it once for that party/episode.
  useEffect(() => {
    const partyId = params.get('partyId');
    const episodeNumber = activeParty?.id === partyId ? activeParty.episode : params.get('episode');
    if (!bundle || !partyId || !episodeNumber) return;
    if (playerSession?.episode === episodeNumber) return;
    const key = `${partyId}:${id}:${episodeNumber}`;
    if (autoPartyEpisode.current === key) return;
    autoPartyEpisode.current = key;
    const episode = episodes.find(item => item.num === episodeNumber || item.id === episodeNumber);
    if (episode) void playEpisode(episode);
    else toast(`Episode ${episodeNumber} dari room Nobar tidak ditemukan di katalog ini.`, 'err');
  }, [activeParty?.id, activeParty?.episode, bundle, episodes, id, params, playerSession?.episode]);

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
        <button type="button" className="ibtn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <ErrorState onRetry={() => void load()} />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="dt-hero">
        <div className="dt-hero-bg">
          <Skel className="poster" style={{ height: '100%', borderRadius: 0 }} />
        </div>
        <div className="dt-hero-shade" />
      </div>
    );
  }

  return (
    <>
      <div className={'dt-sticky' + (stuck ? ' show' : '')}>
        <button type="button" className="ibtn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <span className="dt-sticky-title ellipsis">{bundle.title}</span>
        <button type="button" className="ibtn ripple-host" aria-label="Bagikan" onClick={() => void onShare()}>
          <Icon name="share" />
        </button>
      </div>

      <div className="dt-hero">
        <div className="dt-hero-bg">
          <SmartImage key={bundle.id} src={bundle.heroImage || bundle.poster} animeId={bundle.id} alt={bundle.title} eager />
        </div>
        <div className="dt-hero-shade" />
        <div className="dt-hero-top">
          <button type="button" className="ibtn ripple-host" aria-label="Kembali" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ibtn ripple-host" aria-label="Bagikan" onClick={() => void onShare()}>
            <Icon name="share" />
          </button>
          <button
            type="button"
            className="ibtn ripple-host"
            aria-label={isFav ? 'Berhenti berlangganan anime' : 'Subscribe anime'}
            aria-pressed={isFav}
            style={isFav ? { color: 'var(--accent-pink)' } : undefined}
            onClick={onFav}
          >
            <Icon name={isFav ? 'heartFill' : 'heart'} />
          </button>
        </div>
        <div className="dt-hero-copy">
          {bundle.alt ? <p className="dt-alt clamp-1">{bundle.alt}</p> : null}
          <h1 className="dt-title clamp-2">{bundle.title}</h1>
          <p className="dt-status">
            <Icon name="calendar" size={14} strokeWidth={2.2} />
            {bundle.status || 'Sedang Tayang'}
          </p>
        </div>
      </div>

      <div className="dt-body">
        <div className="dt-chips">
          {bundle.score && bundle.score !== '-' ? (
            <span className="dt-chip gold">
              <Icon name="starFill" size={11} strokeWidth={0} />
              {bundle.score}
            </span>
          ) : null}
          {bundle.year ? <span className="dt-chip">{bundle.year}</span> : null}
          {bundle.type ? <span className="dt-chip">{bundle.type}</span> : null}
          {bundle.episodes ? <span className="dt-chip">{bundle.episodes} eps</span> : null}
          {bundle.duration ? <span className="dt-chip">{bundle.duration}</span> : null}
        </div>

        <div className="dt-actions">
          <button type="button" className="dt-btn primary" disabled={!episodes.length || streamLoading} onClick={() => {
            const episode = episodes.find(ep => ep.num === resumeEp) || episodes[0];
            if (episode) void playEpisode(episode);
          }}>
            <Icon name="play" size={16} strokeWidth={0} /> Tonton Sekarang
          </button>
          <button type="button" className={'dt-btn ghost' + (isFav ? ' on' : '')} onClick={onFav}>
            <Icon name={isFav ? 'bellFill' : 'bell'} size={16} strokeWidth={2} />
            {isFav ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>
        <button type="button" className="dt-party-link" onClick={() => navigate(`/watch-party?animeId=${encodeURIComponent(id)}&title=${encodeURIComponent(bundle.title)}&poster=${encodeURIComponent(bundle.poster || '')}&episode=${encodeURIComponent(resumeEp || episodes[0]?.num || '1')}`)}>
          <Icon name="users" size={15} /> Tonton bersama di Nobar
        </button>

        {bundle.genres.length ? (
          <div className="dt-chips" style={{ marginTop: 0 }}>
            {bundle.genres.slice(0, 5).map(g => (
              <span key={g} className="dt-chip dim">
                {g}
              </span>
            ))}
          </div>
        ) : null}

        {bundle.synopsis ? (
          <div className="dt-syn">
            <div className="dt-syn-head">
              <h2 className="dt-h2">Synopsis</h2>
              {bundle.synopsis.length > 120 ? (
                <button type="button" className="dt-syn-toggle" onClick={() => setExpand(v => !v)}>
                  {expand ? 'Tutup' : 'Selengkapnya'}
                  <Icon name={expand ? 'up' : 'down'} size={13} strokeWidth={2.6} />
                </button>
              ) : null}
            </div>
            <p className={'dt-syn-text' + (expand ? '' : ' clamp-2')}>{bundle.synopsis}</p>
          </div>
        ) : null}

        {bundle.recommendations.length ? (
          <section className="section" style={{ marginTop: 24 }}>
            <h2 className="dt-h2">Related Anime</h2>
            <Grid>
              {bundle.recommendations.slice(0, 9).map((c, i) => (
                <UpdateCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
              ))}
            </Grid>
          </section>
        ) : null}

        {episodes.length ? (
          <section className="section" style={{ marginTop: 26 }}>
            <h2 className="dt-h2">Daftar Episode</h2>
            <div className="dt-ep-controls">
              <div className="input-wrap" style={{ flex: 1, height: 44 }}>
                <Icon name="search" size={16} strokeWidth={2.2} />
                <input
                  type="search"
                  placeholder="Cari episode…"
                  value={epQuery}
                  onChange={e => setEpQuery(e.target.value)}
                  aria-label="Cari episode"
                />
              </div>
              <button type="button" className="dt-sq" aria-label="Urutan episode" onClick={() => setEpQuery('')}>
                <Icon name={epQuery ? 'x' : 'down'} size={16} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                className={'dt-sq' + (epMode === 'grid' ? ' on' : '')}
                aria-label="Mode grid"
                aria-pressed={epMode === 'grid'}
                onClick={() => setEpMode(m => (m === 'grid' ? 'list' : 'grid'))}
              >
                <Icon name="grid" size={16} strokeWidth={2.2} />
              </button>
            </div>

            {epMode === 'list' ? (
              <div className="dt-eplist">
                {filteredEps.map(ep => {
                  const pr = progressMap.get(ep.num);
                  const active = resumeEp === ep.num && pr;
                  return (
                    <div className={'dt-eprow' + ((active || playingEpisode === ep.num) ? ' on' : '')} key={ep.num + ep.id}>
                      <button type="button" className="dt-epl-main" aria-label={`Putar episode ${ep.num}`} aria-busy={streamLoading && playingEpisode === ep.num} onClick={() => void playEpisode(ep)}>
                        <span className="dt-epl-num">
                          Episode {ep.num}
                          {pr?.completed ? <span className="dt-epl-done">Selesai</span> : null}
                        </span>
                        {ep.date ? <span className="dt-epl-date">{ep.date}</span> : null}
                      </button>
                      <button type="button" className="dt-epl-play" aria-label={`Putar episode ${ep.num}`} onClick={() => void playEpisode(ep)}><Icon name="play" size={15} /></button>
                    </div>
                  );
                })}
                {!filteredEps.length ? <p className="dt-ep-empty">Episode tidak ditemukan.</p> : null}
              </div>
            ) : (
              <>
                <div className="dt-epgrid">
                  {filteredEps.map(ep => {
                    const pr = progressMap.get(ep.num);
                    const active = resumeEp === ep.num && pr;
                    return (
                      <button type="button" className={'dt-epcell' + ((active || playingEpisode === ep.num) ? ' on' : '')} key={ep.num + ep.id} onClick={() => void playEpisode(ep)} aria-label={`Putar episode ${ep.num}`} aria-busy={streamLoading && playingEpisode === ep.num}>
                        <span className="dt-epcell-num">
                          Eps {ep.num}
                        </span>
                        <Icon name="play" size={14} />
                      </button>
                    );
                  })}
                </div>
                {!filteredEps.length ? <p className="dt-ep-empty">Episode tidak ditemukan.</p> : null}
              </>
            )}
          </section>
        ) : null}
        <Comments animeId={id} />
      </div>
    </>
  );
}
