import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { ScheduleGroup } from '../core/types';
import { ErrorState, ListSkel, OfflineBar } from '../ui/Feedback';
import { Icon } from '../ui/icons';
import { usePullToRefresh } from '../ui/hooks';
import { SmartImage } from '../ui/SmartImage';
import { detailPath } from '../lib/nav';

/** Jadwal tayang — timeline gold per hari, scroll menerus, pil navigasi hari melayang. */

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
      <div className="ptr" style={{ height: pull.refreshing ? 42 : pull.pull, opacity: pull.pull > 0 || pull.refreshing ? 1 : 0 }}>
        <span className="ptr-ring" />
      </div>

      <h1 className="sch-title">Jadwal Tayang</h1>
      <div className="sch-divider" />

      <OfflineBar show={stale} />

      {error && !groups ? <ErrorState onRetry={() => void load()} /> : null}
      {!groups && !error ? <ListSkel count={5} /> : null}

      {days.map(d => (
        <section
          className="sch-day"
          key={d.idx}
          ref={el => {
            dayRefs.current[d.idx] = el;
          }}
        >
          <button
            type="button"
            className={'sch-day-head' + (d.idx === todayIdx ? ' active' : '')}
            onClick={() => setViewDay(d.idx)}
          >
            <span className="sch-day-name">{d.label}</span>
            <span className="sch-count">{d.items.length} Anime</span>
          </button>

          {d.items.length ? (
            d.items.map((it, j) => (
              <button
                type="button"
                className="sch-item"
                key={it.provider + it.id + j}
                onClick={() => navigate(detailPath(it.id, it.title))}
                aria-label={it.title}
              >
                <span className="sch-rail">
                  {j > 0 ? <span className="sch-line" /> : null}
                  <span className="sch-time">{it.time || '—'}</span>
                  <span className="sch-dot" />
                </span>
                <span className="sch-card">
                  <span className="sch-thumb">
                    <SmartImage src={it.poster} alt={it.title} eager={d.idx === todayIdx && j < 3} />
                  </span>
                  <span className="sch-body">
                    <span className="sch-name clamp-2">{it.title}</span>
                    {it.episode ? <span className="sch-ep">{it.episode}</span> : null}
                    <span className="sch-wait">Menunggu Update</span>
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="sch-empty">Belum ada jadwal rilis.</p>
          )}
        </section>
      ))}

      {groups ? (
        <div className="sch-nav">
          <button type="button" className="sch-nav-pill" onClick={() => goDay(-1)}>
            <Icon name="left" size={14} strokeWidth={2.6} />
            {prevLabel}
          </button>
          <button type="button" className="sch-nav-pill" onClick={() => goDay(1)}>
            {nextLabel}
            <Icon name="right" size={14} strokeWidth={2.6} />
          </button>
        </div>
      ) : null}
    </>
  );
}
