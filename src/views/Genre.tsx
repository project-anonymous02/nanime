import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { AggregatedCard } from '../core/types';
import { Grid, UpdateCard } from '../ui/Cards';
import { EmptyState, ErrorState, ListSkel } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { detailPath } from '../lib/nav';

export function Genre() {
  const navigate = useNavigate();
  const { genreUrl = '', genreTitle = '' } = useParams();
  const [items, setItems] = useState<AggregatedCard[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const title = genreTitle || genreUrl;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    setItems(null);
    setPage(1);
    Catalog.genre(genreUrl, 1)
      .then(result => {
        if (!alive) return;
        setItems(result.list as AggregatedCard[]);
        setHasNext(!!result.pagination?.hasNextPage);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [genreUrl, retry]);

  const loadMore = async () => {
    if (loadingMore || !hasNext) return;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const result = await Catalog.genre(genreUrl, next);
      setItems(current => [...(current || []), ...(result.list as AggregatedCard[])]);
      setPage(next);
      setHasNext(!!result.pagination?.hasNextPage);
    } catch {
      setHasNext(false);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <header className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <div style={{ flex: 1 }}>
          <h1 className="hn-pagehead-title">{title}</h1>
          <p className="hn-profilehero-sub">{items ? items.length + ' judul' : 'Genre anime'}</p>
        </div>
      </header>

      {loading ? <ListSkel count={6} /> : null}
      {error && !loading ? <ErrorState onRetry={() => setRetry(value => value + 1)} /> : null}
      {!loading && !error && items && items.length === 0 ? (
        <EmptyState icon="search" title="Belum ada judul" sub={'Genre ' + title + ' belum memiliki daftar anime yang bisa ditampilkan.'} />
      ) : null}
      {items && items.length ? (
        <>
          <Grid>
            {items.map((card, index) => (
              <UpdateCard key={card.provider + ':' + card.id + ':' + index} card={card} index={index} onOpen={item => navigate(detailPath(item.canonicalId, item.title))} />
            ))}
          </Grid>
          {hasNext ? (
            <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
              <button type="button" className="hn-ghostbtn" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
