import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Grid } from '../ui/Cards';
import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { detailPath } from '../lib/nav';

/** Langganan anime — koleksi seri yang disimpan pengguna dan tersinkron lintas perangkat. */

type SortKey = 'recent' | 'title' | 'rating';

const SORT_LABEL: Record<SortKey, string> = {
  recent: 'Terbaru',
  title: 'A-Z',
  rating: 'Rating'
};

export function Favorites() {
  const navigate = useNavigate();
  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const syncError = useLibrary(s => s.syncError);
  const syncing = useLibrary(s => s.syncing);
  const retrySync = useLibrary(s => s.retrySync);
  const [sort, setSort] = useState<SortKey>('recent');
  const [openSort, setOpenSort] = useState(false);

  const sorted = useMemo(() => {
    const list = favorites.slice();
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'rating') list.sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    else list.sort((a, b) => b.addedAt - a.addedAt);
    return list;
  }, [favorites, sort]);

  return (
    <>
      <header className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <h1 className="hn-pagehead-title">Anime Disubscribe</h1>
        <span style={{ width: 40 }} />
      </header>

      {syncError ? <div className="hn-inline-warn" role="alert"><span>{syncError}</span>
        <button type="button" className="hn-textbtn" disabled={syncing} onClick={() => void retrySync()}>{syncing ? 'Menyinkronkan…' : 'Coba sinkronkan'}</button>
      </div> : null}

      {favorites.length ? (
        <>
          <div className="hn-section-head">
            <span className="hn-section-title">Total ({favorites.length})</span>
            <button type="button" className="hn-section-link" onClick={() => setOpenSort(o => !o)} aria-expanded={openSort}>
              {SORT_LABEL[sort]}
              <Icon name="down" size={13} strokeWidth={2.4} />
            </button>
          </div>
          {openSort ? (
            <div className="hn-chiprow" role="menu" style={{ paddingBottom: 10 }}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                <button
                  key={k}
                  type="button"
                  className={`hn-chip${sort === k ? ' hn-active' : ''}`}
                  role="menuitemradio"
                  aria-checked={sort === k}
                  onClick={() => {
                    setSort(k);
                    setOpenSort(false);
                  }}
                >
                  {SORT_LABEL[k]}
                </button>
              ))}
            </div>
          ) : null}

          <Grid>
            {sorted.map((f, i) => (
              <div key={f.id} style={{ '--i': i, position: 'relative' } as React.CSSProperties}>
                <button
                  type="button"
                  className="hn-card"
                  onClick={() => navigate(detailPath(f.id, f.title))}
                  aria-label={f.title}
                >
                  <span className="hn-card-poster">
                    <SmartImage src={f.poster} alt={f.title} eager={i < 6} />
                    {f.score ? (
                      <span className="hn-views">
                        <Icon name="starFill" size={11} strokeWidth={0} />
                        {f.score}
                      </span>
                    ) : null}
                    {f.type ? <span className="hn-episodecode">{f.type}</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="hn-iconbtn"
                  style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, color: 'var(--accent-pink)' }}
                  aria-label={'Berhenti subscribe ' + f.title}
                  onClick={() => {
                    toggleFavorite(f);
                    toast('Dihapus dari favorit', 'ok');
                  }}
                >
                  <Icon name="heartFill" size={12} />
                </button>
                <button
                  type="button"
                  className="hn-card-title"
                  style={{ textAlign: 'left' }}
                  onClick={() => navigate(detailPath(f.id, f.title))}
                >
                  {f.title}
                </button>
              </div>
            ))}
          </Grid>
        </>
      ) : (
        <EmptyState
          icon="heart"
          title="Belum ada langganan"
          sub="Subscribe anime dari halaman detail agar seri tersimpan di koleksimu."
        />
      )}
    </>
  );
}
