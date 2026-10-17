import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { Grid } from '../ui/Cards';
import { EmptyState } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { SmartImage } from '../ui/SmartImage';
import { Topbar } from '../shell/Topbar';
import { detailPath } from '../lib/nav';

/** Favorit — kisi poster dengan tombol hati untuk melepas. */
export function Favorites() {
  const navigate = useNavigate();
  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);

  return (
    <>
      <Topbar
        title="Favorit"
        right={
          <button type="button" className="ibtn ripple-host" aria-label="Riwayat" onClick={() => navigate('/history')}>
            <Icon name="clock" />
          </button>
        }
      />

      {favorites.length ? (
        <Grid>
          {favorites.map((f, i) => (
            <div key={f.id} className="anime-card" style={{ '--i': i } as React.CSSProperties}>
              <button
                type="button"
                className="poster-wrap"
                onClick={() => navigate(detailPath(f.id, f.title))}
                aria-label={f.title}
              >
                <SmartImage src={f.poster} alt={f.title} eager={i < 4} />
                {f.score ? (
                  <span className="rating-chip">
                    <Icon name="starFill" size={11} strokeWidth={0} />
                    {f.score}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="card-title clamp-2"
                style={{ textAlign: 'left' }}
                onClick={() => navigate(detailPath(f.id, f.title))}
              >
                {f.title}
              </button>
              <button
                type="button"
                className="fav-heart"
                aria-label={'Hapus ' + f.title + ' dari favorit'}
                onClick={() => {
                  toggleFavorite(f);
                  toast('Dihapus dari favorit', 'ok');
                }}
              >
                <Icon name="heartFill" />
              </button>
            </div>
          ))}
        </Grid>
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
