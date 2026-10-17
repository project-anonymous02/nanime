import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Catalog } from '../core/services/Catalog';
import type { ScheduleGroup } from '../core/types';
import { DayPill, ScheduleCard } from '../ui/Cards';
import { EmptyState, ErrorState, ListSkel, OfflineBar } from '../ui/Feedback';
import { usePullToRefresh } from '../ui/hooks';
import { detailPath } from '../lib/nav';

/** Jadwal rilis mingguan — dikelompokkan per hari, urut jam tayang. */

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function Schedule() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ScheduleGroup[] | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState(false);
  const todayIdx = new Date().getDay();
  const [dayIdx, setDayIdx] = useState(todayIdx);

  const load = async () => {
    setError(false);
    try {
      const r = await Catalog.schedule();
      setGroups(r.groups);
      setStale(r.stale);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pull = usePullToRefresh(load);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const idx = (todayIdx + i) % 7;
        const label = i === 0 ? 'Hari Ini' : i === 1 ? 'Besok' : DAYS[idx];
        return { idx, label, name: DAYS[idx] };
      }),
    [todayIdx]
  );

  const group = groups?.find(g => g.day.toLowerCase() === DAYS[dayIdx].toLowerCase());
  const items = group?.items || [];

  return (
    <>
      <div className="ptr" style={{ height: pull.refreshing ? 42 : pull.pull, opacity: pull.pull > 0 || pull.refreshing ? 1 : 0 }}>
        <span className="ptr-ring" />
      </div>

      <h1 className="tb-title" style={{ padding: '4px 0 14px' }}>
        Jadwal Rilis
      </h1>

      <div className="day-picker no-scrollbar" role="tablist" aria-label="Pilih hari">
        {days.map(d => (
          <DayPill key={d.idx} label={d.label} active={d.idx === dayIdx} onClick={() => setDayIdx(d.idx)} />
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <OfflineBar show={stale} />

        {error && !groups ? <ErrorState onRetry={() => void load()} /> : null}
        {!groups && !error ? <ListSkel count={5} /> : null}

        {groups && items.length ? (
          <div className="timeline" key={dayIdx}>
            {items.map((it, i) => (
              <div key={it.provider + it.id + i} className="tl-item" style={{ '--i': i } as React.CSSProperties}>
                <span className="tl-time">{it.time || '—'}</span>
                <span className="tl-dot" />
                <ScheduleCard item={it} onOpen={s => navigate(detailPath(s.id, s.title))} />
              </div>
            ))}
          </div>
        ) : null}

        {groups && !items.length ? (
          <EmptyState
            icon="calendar"
            title={`Tidak ada rilis di ${DAYS[dayIdx]}`}
            sub="Belum ada jadwal untuk hari ini. Coba pilih hari lain."
          />
        ) : null}
      </div>
    </>
  );
}
