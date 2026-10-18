import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard } from '../core/types';
import { RankCard } from '../ui/Cards';
import { ErrorState, ListSkel, SectionHead } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { detailPath } from '../lib/nav';

export function AnimeRanking() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AggregatedCard[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try { setItems((await Catalog.home({ fresh: true })).weekly); }
    catch { setError(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="ranking-page">
    <header className="ranking-heading"><button type="button" className="ibtn" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button><div><span className="eyebrow">NANIME</span><h1>Peringkat Anime</h1><p>Anime dengan rating tertinggi dari katalog yang tersedia.</p></div></header>
    {error && !items ? <ErrorState onRetry={() => void load()} /> : null}
    {!items && !error ? <ListSkel count={5} /> : null}
    {items?.length ? <section className="section"><SectionHead title="Mingguan" /><div className="rank-grid">{items.map((card, index) => <RankCard key={card.canonicalId} card={{ ...card, rank: index + 1 }} index={index} onOpen={item => navigate(detailPath(item.canonicalId, item.title))} />)}</div></section> : null}
    {items && !items.length ? <div className="community-state-card"><Icon name="chart" /><strong>Belum ada peringkat</strong><span>Data rating belum tersedia dari katalog anime.</span></div> : null}
  </div>;
}
