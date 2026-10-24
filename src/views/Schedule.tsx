import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { ScheduleGroup } from '../core/types';
import { ErrorState, ListSkel, OfflineBar } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { usePullToRefresh } from '../ui/hooks';
import { PullToRefreshIndicator } from '../ui/PullToRefresh';
import { SmartImage } from '../ui/SmartImage';
import { detailPath } from '../lib/nav';
import { titleKey } from '../core/services/TitleIndex';

/** Jadwal tayang — kelompok per hari + pil navigasi hari. */

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function Schedule() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ScheduleGroup[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(false);
  const todayIdx = new Date().getDay();
  const [viewDay, setViewDay] = useState(todayIdx);

  const dayRefs = useRef<Record<number, HTMLElement | null>>({});

  const load = useCallback(async () => {
    setError(false);
    try {
      const r = await Catalog.schedule();
      setGroups(r.groups);
      setStale(r.stale);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, []);

  const pull = usePullToRefresh(load);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const idx = (todayIdx + i) % 7;
        const name = DAYS[idx];
        const label = i === 0 ? 'Hari Ini' : i === 1 ? 'Besok' : name;
        const g = groups?.find(x => x.day.toLowerCase() === name.toLowerCase());
        return { idx, name, label, items: g?.items || [] };
      }),
    [groups, todayIdx]
  );

  const goDay = (delta: number) => {
    const next = (viewDay + delta + 7) % 7;
    setViewDay(next);
    dayRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const prevLabel = DAYS[(viewDay - 1 + 7) % 7];
  const nextLabel = DAYS[(viewDay + 1) % 7];

  return (
    <>
      <PullToRefreshIndicator state={pull} />

      <header className="hn-pagehead">
        <button type="button" className="hn-back" aria-label="Kembali" onClick={() => navigate(-1)}>
          <Icon name="left" />
        </button>
        <h1 className="hn-pagehead-title">Jadwal Tayang</h1>
        <span style={{ width: 40 }} />
      </header>

      <div className="hn-datetabs no-scrollbar">
        {days.map(d => (
          <button
            type="button"
            key={d.idx}
            className={`hn-datetab${viewDay === d.idx ? ' hn-active' : ''}`}
            onClick={() => {
              setViewDay(d.idx);
              dayRefs.current[d.idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <OfflineBar show={stale} />

      {error && !groups ? <ErrorState onRetry={() => void load()} /> : null}
      {!groups && !error ? <ListSkel count={5} /> : null}

      {days.map(d => (
        <section
          className="hn-section"
          key={d.idx}
          ref={el => {
            dayRefs.current[d.idx] = el;
          }}
        >
          <div className="hn-section-head">
            <span className="hn-section-title">{d.label}</span>
            <span className="hn-section-link">{d.items.length} Anime</span>
          </div>

          {d.items.length ? (
            <div className="hn-rowlist">
              {d.items.map((it, j) => (
                <button
                  type="button"
                  className="hn-row"
                  key={it.provider + it.id + j}
                  onClick={() => navigate(detailPath(it.id, it.title))}
                  aria-label={it.title}
                >
                  <span className="hn-row-main" style={{ flexShrink: 0, width: 46, textAlign: 'center' }}>
                    <span className="hn-avatarrow-sub">{j > 0 ? '' : null}</span>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: 12, color: 'var(--accent-cyan)' }}>{it.time || '—'}</span>
                    <span className="hn-progressbar" style={{ position: 'static', marginTop: 4 }}>
                      <span className="hn-progressbar-fill" style={{ width: '100%' }} />
                    </span>
                  </span>
                  <span className="hn-card-poster" style={{ width: 60, borderRadius: 8, flexShrink: 0 }}>
                    <SmartImage src={it.poster} animeId={titleKey(it.title)} alt={it.title} eager={d.idx === todayIdx && j < 3} />
                  </span>
                  <span className="hn-row-main">
                    <span className="hn-row-title">{it.title}</span>
                    {it.episode ? <span className="hn-row-sub">{it.episode}</span> : null}
                    <span className="hn-row-sub" style={{ color: 'var(--accent-gold)' }}>Menunggu Update</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="hn-state">Belum ada jadwal rilis.</p>
          )}
        </section>
      ))}

      {groups ? (
        <div className="hn-formactions" style={{ justifyContent: 'space-between', marginTop: 18 }}>
          <button type="button" className="hn-ghostbtn" onClick={() => goDay(-1)}>
            <Icon name="left" size={14} strokeWidth={2.6} />
            {prevLabel}
          </button>
          <button type="button" className="hn-ghostbtn" onClick={() => goDay(1)}>
            {nextLabel}
            <Icon name="right" size={14} strokeWidth={2.6} />
          </button>
        </div>
      ) : null}
    </>
  );
}
