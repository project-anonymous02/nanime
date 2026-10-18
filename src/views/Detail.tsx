import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard, DetailBundle } from '../core/types';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Grid, UpdateCard } from '../ui/Cards';
import { ErrorState, Skel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { detailPath, shareOrCopy, watchPath } from '../lib/nav';
import { Comments } from './Comments';

/** Detail anime ala referensi — hero, chip, synopsis, related, daftar episode list/grid. */

export function Detail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const titleHint = params.get('title') || '';
  const navigate = useNavigate();

  const [bundle, setBundle] = useState<DetailBundle | null>(null);
  const [error, setError] = useState(false);
  const [expand, setExpand] = useState(false);
  const [epMode, setEpMode] = useState<'list' | 'grid'>('list');
  const [epQuery, setEpQuery] = useState('');
  const [stuck, setStuck] = useState(false);

  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const history = useLibrary(s => s.history);

  const load = useCallback(async () => {
    setError(false);
    try {
      setBundle(await Catalog.detail(id, { title: titleHint }));
    } catch {
      setError(true);
    }
  }, [id, titleHint]);

  useEffect(() => {
    window.scrollTo(0, 0);
    void load();
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

  const onWatch = () => {
    if (!resumeEp) {
      toast('Episode belum tersedia untuk tayangan ini', 'err');
      return;
    }
    navigate(watchPath(id, resumeEp, bundle?.title || titleHint));
  };

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
          <SmartImage src={bundle.poster} animeId={bundle.id} alt={bundle.title} eager />
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
          <button type="button" className="dt-btn primary" onClick={onWatch}>
            <Icon name="play" size={16} strokeWidth={0} />
            {resumeEp && progressMap.get(resumeEp) ? `Lanjut Eps ${resumeEp}` : 'Tonton Sekarang'}
          </button>
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
                    <div className={'dt-eprow' + (active ? ' on' : '')} key={ep.num + ep.id}>
                      <button type="button" className="dt-epl-main" onClick={() => navigate(watchPath(id, ep.num, bundle.title))}>
                        <span className="dt-epl-num">
                          Episode {ep.num}
                          {pr?.completed ? <span className="dt-epl-done">Selesai</span> : null}
                        </span>
                        {ep.date ? <span className="dt-epl-date">{ep.date}</span> : null}
                      </button>
                      <button
                        type="button"
                        className="dt-epl-play"
                        aria-label={'Tonton episode ' + ep.num}
                        onClick={() => navigate(watchPath(id, ep.num, bundle.title))}
                      >
                        <Icon name="play" size={14} strokeWidth={0} />
                      </button>
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
                      <div className={'dt-epcell' + (active ? ' on' : '')} key={ep.num + ep.id}>
                        <button type="button" className="dt-epcell-num" onClick={() => navigate(watchPath(id, ep.num, bundle.title))}>
                          Eps {ep.num}
                        </button>
                        <button
                          type="button"
                          className="dt-epl-play"
                          aria-label={'Tonton episode ' + ep.num}
                          onClick={() => navigate(watchPath(id, ep.num, bundle.title))}
                        >
                          <Icon name="play" size={13} strokeWidth={0} />
                        </button>
                      </div>
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
