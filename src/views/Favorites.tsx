import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Grid } from '../ui/Cards';
import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { detailPath } from '../lib/nav';

/** Favorit — kisi poster gaya "Subscribed Anime" dengan pengurutan. */

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
      <h1 className="fav-title">Favorit Anime</h1>

      {favorites.length ? (
        <>
          <div className="fav-row">
            <span className="fav-total">Total ({favorites.length})</span>
            <div className="fav-sort-wrap">
              <button type="button" className="fav-sort" onClick={() => setOpenSort(o => !o)} aria-expanded={openSort}>
                {SORT_LABEL[sort]}
                <Icon name="down" size={13} strokeWidth={2.4} />
              </button>
              {openSort ? (
                <div className="fav-sort-panel" role="menu">
                  {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                    <button
                      key={k}
                      type="button"
                      className={'fav-sort-item' + (sort === k ? ' active' : '')}
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
            </div>
          </div>

          <Grid>
            {sorted.map((f, i) => (
              <div key={f.id} className="up-card anim-up" style={{ '--i': i } as React.CSSProperties}>
                <button
                  type="button"
                  className="up-poster"
                  onClick={() => navigate(detailPath(f.id, f.title))}
                  aria-label={f.title}
                >
                  <SmartImage src={f.poster} alt={f.title} eager={i < 6} />
                  {f.score ? (
                    <span className="up-rating">
                      <Icon name="starFill" size={11} strokeWidth={0} />
                      {f.score}
                    </span>
                  ) : null}
                  {f.type ? <span className="up-ep">{f.type}</span> : null}
                </button>
                <button
                  type="button"
                  className="fav-mini"
                  aria-label={'Hapus ' + f.title + ' dari favorit'}
                  onClick={() => {
                    toggleFavorite(f);
                    toast('Dihapus dari favorit', 'ok');
                  }}
                >
                  <Icon name="heartFill" size={12} />
                </button>
                <button
                  type="button"
                  className="up-title clamp-2"
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
          title="Belum ada favorit"
          sub="Tekan ikon hati di halaman detail untuk menyimpan tayangan ke sini."
        />
      )}
    </>
  );
}
