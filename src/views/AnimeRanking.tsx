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

  return <div>
    <header className="hn-pagehead">
      <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}><Icon name="left" /></button>
      <div style={{ flex: 1 }}>
        <span className="hn-profilehero-sub" style={{ textTransform: 'uppercase', letterSpacing: 2 }}>NANIME</span>
        <h1 className="hn-pagehead-title">Peringkat Anime</h1>
        <p className="hn-profilehero-sub">Anime dengan rating tertinggi dari katalog yang tersedia.</p>
      </div>
    </header>
    {error && !items ? <ErrorState onRetry={() => void load()} /> : null}
    {!items && !error ? <ListSkel count={5} /> : null}
    {items?.length ? <section style={{ padding: '0 0 20px' }}><SectionHead title="Mingguan" /><GridRank>{items.map((card, index) => <RankCard key={card.canonicalId} card={{ ...card, rank: index + 1 }} index={index} onOpen={item => navigate(detailPath(item.canonicalId, item.title))} />)}</GridRank></section> : null}
    {items && !items.length ? <div className="hn-state"><span className="hn-state-icon"><Icon name="chart" size={26} /></span><strong className="hn-state-title">Belum ada peringkat</strong><span className="hn-state-sub">Data rating belum tersedia dari katalog anime.</span></div> : null}
  </div>;
}

function GridRank({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 12, padding: '8px var(--pad-x) 4px' }}>{children}</div>;
}
