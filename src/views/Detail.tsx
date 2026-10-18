import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import { recordClientMetric } from '../core/services/Telemetry';
import type { AggregatedCard, DetailBundle, StreamBundle } from '../core/types';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Grid, UpdateCard } from '../ui/Cards';
import { ErrorState, Skel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { AdaptiveVideo } from '../ui/AdaptiveVideo';
import { detailPath, shareOrCopy } from '../lib/nav';
import { Comments } from './Comments';

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
  const [playingEpisode, setPlayingEpisode] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamBundle | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [sourceIndex, setSourceIndex] = useState(0);
  const requestId = useRef(0);
  const streamRequestId = useRef(0);
  const lastProgressWrite = useRef(0);

  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const history = useLibrary(s => s.history);
  const addHistory = useLibrary(s => s.addHistory);

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

  useEffect(() => () => { streamRequestId.current++; }, []);

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
    const request = ++streamRequestId.current;
    const startedAt = performance.now();
    setPlayingEpisode(ep.num);
    setStream(null);
    setStreamError('');
    setStreamLoading(true);
    setSourceIndex(0);
    lastProgressWrite.current = 0;
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
      if (request !== streamRequestId.current) return;
      if (result.availability === 'unavailable' || (!result.servers.length && !result.qualities.length)) {
        throw new Error(result.unavailableReason || 'Sumber video episode ini tidak tersedia. Coba lagi atau pilih episode lain.');
      }
      recordClientMetric({ name: 'playback-resolution', durationMs: performance.now() - startedAt, ok: true, count: result.servers.length + result.qualities.length });
      setStream(result);
    } catch (cause) {
      if (request === streamRequestId.current) {
        recordClientMetric({ name: 'playback-resolution', durationMs: performance.now() - startedAt, ok: false });
        setStreamError((cause as Error)?.message || 'Gagal menyiapkan episode. Periksa koneksi lalu coba lagi.');
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (request === streamRequestId.current) setStreamLoading(false);
    }
  };

  const closePlayer = () => {
    streamRequestId.current++;
    setPlayingEpisode(null);
    setStream(null);
    setStreamError('');
    setStreamLoading(false);
  };

  const playableSources = stream ? [
    ...stream.qualities.filter(item => item.source).map(item => ({ label: item.label, url: item.source!.url, kind: item.source!.kind })),
    ...stream.servers.filter(item => item.url && !stream.qualities.some(quality => quality.source?.url === item.url)).map(item => ({ label: item.label, url: item.url, kind: stream.sourceKind === 'direct-media' && /\.(?:m3u8|mp4|webm|mov|mpd)(?:[?#]|$)/i.test(item.url) ? 'file' as const : 'embed' as const }))
  ] : [];
  const activeSource = playableSources[sourceIndex];

  const savePlaybackProgress = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!playingEpisode || !bundle) return;
    const video = event.currentTarget;
    const now = Date.now();
    if (event.type === 'timeupdate' && now - lastProgressWrite.current < 15_000) return;
    lastProgressWrite.current = now;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const percent = duration > 0 ? Math.min(100, Math.round(video.currentTime / duration * 100)) : 0;
    addHistory({ animeId: id, episode: playingEpisode, title: bundle.title, poster: bundle.poster, positionSec: Math.floor(video.currentTime), durationSec: Math.floor(duration), percent, completed: event.type === 'ended' || percent >= 92, watchedAt: now });
  };

  const onMediaError = useCallback(() => {
    setStreamError('Browser tidak dapat memutar sumber ini. Coba server lain atau episode berikutnya.');
  }, []);

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
            aria-label={isFav ? 'Hapus dari favorit' : 'Tambah ke favorit'}
            aria-pressed={isFav}
            style={isFav ? { color: 'var(--accent-pink)' } : undefined}
            onClick={onFav}
          >
            <Icon name={isFav ? 'heartFill' : 'heart'} />
          </button>
        </div>
      </div>

      <div className="dt-body">
        {bundle.alt ? <p className="dt-alt clamp-1">{bundle.alt}</p> : null}
        <h1 className="dt-title clamp-2">{bundle.title}</h1>

        <p className="dt-status">
          <Icon name="calendar" size={14} strokeWidth={2.2} />
          {bundle.status || 'Sedang Tayang'}
        </p>

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
          <button type="button" className={'dt-btn ghost' + (isFav ? ' on' : '')} onClick={onFav}>
            <Icon name={isFav ? 'bellFill' : 'bell'} size={16} strokeWidth={2} />
            {isFav ? 'Tersimpan' : 'Favorit'}
          </button>
        </div>

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
      {playingEpisode ? <div className="episode-player-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closePlayer(); }}>
        <section className="episode-player" role="dialog" aria-modal="true" aria-label={`Episode ${playingEpisode}`}>
          <header className="episode-player-head"><div><strong>{bundle.title}</strong><span>Episode {playingEpisode}</span></div><button type="button" className="ibtn" onClick={closePlayer} aria-label="Tutup pemutar"><Icon name="x" /></button></header>
          {streamLoading ? <div className="episode-player-state" role="status"><span className="spinner-sm" />Menyiapkan sumber video…</div> : null}
          {!streamLoading && streamError ? <div className="episode-player-state error" role="alert"><p>{streamError}</p><button type="button" className="dt-btn primary" onClick={() => { const ep = episodes.find(item => item.num === playingEpisode); if (ep) void playEpisode(ep); }}>Coba lagi</button></div> : null}
          {!streamLoading && !streamError && activeSource ? <>
            <div className="episode-player-video">{activeSource.kind === 'file' ? <AdaptiveVideo key={activeSource.url} src={activeSource.url} poster={stream?.poster || bundle.poster} onTimeUpdate={savePlaybackProgress} onPause={savePlaybackProgress} onEnded={savePlaybackProgress} onError={onMediaError} /> : <iframe key={activeSource.url} src={activeSource.url} title={`${bundle.title} episode ${playingEpisode}`} allow="autoplay; fullscreen; picture-in-picture" referrerPolicy="no-referrer" allowFullScreen />}</div>
            {playableSources.length > 1 ? <label className="episode-player-source">Kualitas / sumber<select value={sourceIndex} onChange={event => { setSourceIndex(Number(event.target.value)); setStreamError(''); }} aria-label="Pilih kualitas atau sumber">{playableSources.map((source, index) => <option key={`${source.url}-${index}`} value={index}>{source.label}</option>)}</select></label> : null}
          </> : null}
        </section>
      </div> : null}
    </>
  );
}
