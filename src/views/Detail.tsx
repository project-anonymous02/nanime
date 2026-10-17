import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard, DetailBundle } from '../core/types';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { AnimeCard, Grid } from '../ui/Cards';
import { Badge, ErrorState, SectionHead, Skel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { Button } from '../ui/Button';
import { SmartImage } from '../ui/SmartImage';
import { detailPath, shareOrCopy, watchPath } from '../lib/nav';

/** Detail tayangan — hero, sinopsis, episode, dan rekomendasi. */

export function Detail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const titleHint = params.get('title') || '';
  const navigate = useNavigate();

  const [bundle, setBundle] = useState<DetailBundle | null>(null);
  const [error, setError] = useState(false);
  const [expand, setExpand] = useState(false);

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
      <div className="detail-hero" style={{ minHeight: 260 }}>
        <div className="hero-bg">
          <Skel className="poster" style={{ height: '100%', borderRadius: 0 }} />
        </div>
        <div className="hero-shade" />
        <div className="hero-body">
          <Skel className="line w60" style={{ height: 22 }} />
          <Skel className="line w40" style={{ marginTop: 12 }} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="detail-hero">
        <div className="hero-bg">
          <SmartImage src={bundle.poster} alt={bundle.title} eager />
        </div>
        <div className="hero-shade" />
        <div className="hero-top">
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
            style={isFav ? { color: 'var(--accent-red)' } : undefined}
            onClick={onFav}
          >
            <Icon name={isFav ? 'heartFill' : 'heart'} />
          </button>
        </div>
        <div className="hero-body">
          {bundle.score ? (
            <Badge tone="gold">
              <Icon name="starFill" size={12} strokeWidth={0} />
              {bundle.score}
            </Badge>
          ) : null}
          <h1 className="hero-title">{bundle.title}</h1>
          <div className="hero-meta">
            {[bundle.year, bundle.type, bundle.status, bundle.duration, bundle.episodes ? `${bundle.episodes} eps` : '']
              .filter(Boolean)
              .map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            <Badge tone="blue">4 Kualitas</Badge>
          </div>
        </div>
      </div>

      <div className="detail-info">
        <div className="di-poster">
          <SmartImage src={bundle.poster} alt={bundle.title} />
        </div>
        <div className="di-body">
          {bundle.synopsis ? (
            <>
              <p className={'di-synopsis' + (expand ? '' : ' clamp-3')}>{bundle.synopsis}</p>
              {bundle.synopsis.length > 120 ? (
                <button type="button" className="section-link" onClick={() => setExpand(v => !v)}>
                  {expand ? 'Sembunyikan' : 'Baca selengkapnya'}
                </button>
              ) : null}
            </>
          ) : null}
          {bundle.genres.length ? (
            <div className="chip-row no-scrollbar" style={{ gap: 6 }}>
              {bundle.genres.slice(0, 6).map(g => (
                <span key={g} className="badge gray">
                  {g}
                </span>
              ))}
            </div>
          ) : null}
          {bundle.studio ? <p className="di-synopsis">Studio: {bundle.studio}</p> : null}
        </div>
      </div>

      <div className="detail-actions">
        <Button variant="primary" size="lg" className="watch" icon={<Icon name="play" size={18} />} onClick={onWatch}>
          {resumeEp && progressMap.get(resumeEp) ? `Lanjut Eps ${resumeEp}` : 'Tonton Sekarang'}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="icon-only"
          aria-label={isFav ? 'Hapus dari favorit' : 'Tambah ke favorit'}
          onClick={onFav}
        >
          <Icon name={isFav ? 'heartFill' : 'heart'} />
        </Button>
      </div>

      {episodes.length ? (
        <section className="section" style={{ marginTop: 30 }}>
          <SectionHead title={`Episode (${episodes.length})`} />
          <div className="ep-grid">
            {episodes.map(ep => {
              const pr = progressMap.get(ep.num);
              return (
                <button
                  key={ep.num + ep.id}
                  type="button"
                  className={'ep-cell ripple-host' + (resumeEp === ep.num && pr ? ' current' : '') + (pr?.completed ? ' watched' : '')}
                  onClick={() => navigate(watchPath(id, ep.num, bundle.title))}
                >
                  {ep.num}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {bundle.recommendations.length ? (
        <section className="section" style={{ marginTop: 30 }}>
          <SectionHead title="Rekomendasi" />
          <Grid>
            {bundle.recommendations.map((c, i) => (
              <AnimeCard key={c.canonicalId} card={c} index={i} onOpen={openCard} />
            ))}
          </Grid>
        </section>
      ) : null}
    </>
  );
}
