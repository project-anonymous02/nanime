import type { CSSProperties, ReactNode } from 'react';
import type { AggregatedCard, ScheduleItem } from '../core/types';
import type { HistoryItem } from '../lib/remote/types';
import { Icon } from './icons';
import { SmartImage } from './SmartImage';
import { ProgressBar } from './Feedback';
import { titleKey } from '../core/services/TitleIndex';

/** Kartu-kartu siap pakai di seluruh halaman (design system hn-). */

export function Grid({ children }: { children: ReactNode }) {
  return <div className="hn-grid">{children}</div>;
}

export function Rail({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`hn-rail no-scrollbar ${className}`.trim()}>{children}</div>;
}

export function AnimeCard({
  card,
  index = 0,
  onOpen,
  width,
  titleNode
}: {
  card: AggregatedCard;
  index?: number;
  onOpen: (card: AggregatedCard) => void;
  width?: number;
  titleNode?: ReactNode;
}) {
  const style: CSSProperties = width ? { width } : {};
  if (index) (style as Record<string, unknown>)['--i'] = index;
  return (
    <button type="button" className="hn-card" style={style} onClick={() => onOpen(card)} aria-label={card.title}>
      <div className="hn-card-poster">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} eager={index < 4} />
        {card.score ? (
          <span className="hn-views">
            <Icon name="starFill" size={11} strokeWidth={0} />
            {card.score}
          </span>
        ) : null}
        {card.epLabel ? <span className="hn-episodecode">{card.epLabel}</span> : null}
      </div>
      <span className="hn-card-title">{titleNode ?? card.title}</span>
      <span className="hn-card-meta">
        {card.type ? (
          <span className="hn-card-meta-type">
            <Icon name="film" size={12} strokeWidth={2} />
            {card.type}
          </span>
        ) : null}
        {card.status ? <span> · {card.status}</span> : null}
      </span>
    </button>
  );
}

export function WeeklyCard({
  card,
  onOpen
}: {
  card: AggregatedCard;
  onOpen: (card: AggregatedCard) => void;
}) {
  return (
    <button type="button" className="hn-card" onClick={() => onOpen(card)} aria-label={card.title}>
      <span className="hn-card-poster">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} />
      </span>
      <span className="hn-rankbadge">#{card.rank ?? 1}</span>
      <span className="hn-card-title">{card.title}</span>
      <span className="hn-card-meta">
        {card.score ? <span>Skor: {card.score}</span> : null}
        {card.epLabel ? <span> · {card.epLabel}</span> : null}
      </span>
    </button>
  );
}

/* ── Kartu gaya mobinime ── */

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Kartu poster 3 kolom: badge sudut + rating + overlay status + views + judul. */
export function UpdateCard({
  card,
  index = 0,
  onOpen,
  badge,
  titleNode
}: {
  card: AggregatedCard;
  index?: number;
  onOpen: (card: AggregatedCard) => void;
  badge?: string;
  titleNode?: ReactNode;
}) {
  const score = card.score && card.score !== '-' ? card.score : '';
  const overlay = card.epLabel || card.status || '';
  const style: CSSProperties = index ? ({ '--i': index } as CSSProperties) : {};
  return (
    <button type="button" className="hn-card" style={style} onClick={() => onOpen(card)} aria-label={card.title}>
      <span className="hn-card-poster">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} eager={index < 6} />
        {badge ? <span className="hn-badge">{badge}</span> : null}
        {score ? (
          <span className="hn-views">
            <Icon name="starFill" size={11} strokeWidth={0} />
            {score}
          </span>
        ) : null}
        {overlay ? <span className="hn-episodecode">{overlay}</span> : null}
      </span>
      {card.views ? (
        <span className="hn-card-meta hn-views-inline">
          <Icon name="play" size={10} strokeWidth={0} />
          {card.views}
        </span>
      ) : null}
      <span className="hn-card-title">{titleNode ?? card.title}</span>
    </button>
  );
}

/** Kartu besar 2 kolom: badge rank gold + rating + "N Eps" dalam gambar. */
export function RankCard({
  card,
  index = 0,
  onOpen
}: {
  card: AggregatedCard;
  index?: number;
  onOpen: (card: AggregatedCard) => void;
}) {
  const score = card.score && card.score !== '-' ? card.score : '';
  const style: CSSProperties = index ? ({ '--i': index } as CSSProperties) : {};
  return (
    <button type="button" className="hn-card" style={style} onClick={() => onOpen(card)} aria-label={card.title}>
      <span className="hn-card-poster">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} />
        {card.rank ? <span className="hn-rankbadge">#{card.rank}</span> : null}
        {score ? (
          <span className="hn-views">
            <Icon name="starFill" size={11} strokeWidth={0} />
            {score}
          </span>
        ) : null}
        {card.epLabel ? <span className="hn-episodecode">{card.epLabel}</span> : null}
      </span>
      {card.views ? (
        <span className="hn-card-meta">
          <Icon name="play" size={10} strokeWidth={0} />
          {card.views} views
        </span>
      ) : null}
      <span className="hn-card-title">{card.title}</span>
    </button>
  );
}

/** Kartu horizontal "Terakhir Ditonton": gambar 16:9 + jam. */
export function ContinueRailCard({
  item,
  onOpen
}: {
  item: HistoryItem;
  onOpen: (item: HistoryItem) => void;
}) {
  const time =
    item.durationSec > 0 ? `${mmss(item.positionSec)} / ${mmss(item.durationSec)}` : `Episode ${item.episode}`;
  return (
    <button type="button" className="hn-card" onClick={() => onOpen(item)} aria-label={item.title}>
      <span className="hn-card-poster">
        <SmartImage src={item.poster} animeId={item.animeId} alt={item.title} />
        <span className="hn-episodecode">Eps {item.episode}</span>
        {item.percent > 0 ? (
          <span className="hn-progressbar">
            <span className="hn-progressbar-fill" style={{ width: `${Math.min(100, Math.round(item.percent))}%` }} />
          </span>
        ) : null}
      </span>
      <span className="hn-card-title">{item.title}</span>
      <span className="hn-card-meta">
        <Icon name="clock" size={12} strokeWidth={2} />
        {time}
      </span>
    </button>
  );
}

export function ContinueCard({
  item,
  onOpen,
  onRemove
}: {
  item: HistoryItem;
  onOpen: (item: HistoryItem) => void;
  onRemove?: (item: HistoryItem) => void;
}) {
  return (
    <div className="hn-row">
      <button type="button" className="hn-card-poster" style={{ width: 118, flexShrink: 0 }} onClick={() => onOpen(item)} aria-label={item.title}>
        <SmartImage src={item.poster} animeId={item.animeId} alt={item.title} />
        {item.percent > 0 ? (
          <span className="hn-progressbar">
            <span className="hn-progressbar-fill" style={{ width: `${Math.min(100, Math.round(item.percent))}%` }} />
          </span>
        ) : null}
      </button>
      <button type="button" className="hn-row-main" style={{ textAlign: 'left' }} onClick={() => onOpen(item)}>
        <span className="hn-row-title">{item.title}</span>
        <span className="hn-row-sub">
          Episode {item.episode}
          {item.completed ? ' • Selesai' : item.percent > 0 ? ` • ${Math.round(item.percent)}%` : ''}
        </span>
        <ProgressBar value={(item.percent || 0) / 100} />
      </button>
      {onRemove ? (
        <button type="button" className="hn-iconbtn" onClick={() => onRemove(item)} aria-label="Hapus dari lanjutkan menonton">
          <Icon name="x" size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function EpisodeRow({
  num,
  title,
  date,
  poster,
  watched,
  current,
  progress,
  onOpen
}: {
  num: string;
  title?: string;
  date?: string;
  poster?: string;
  watched?: boolean;
  current?: boolean;
  progress?: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="hn-row"
      style={current ? { borderColor: 'var(--border-blue)' } : undefined}
      onClick={onOpen}
      aria-current={current}
    >
      <span className="hn-card-poster" style={{ width: 84, flexShrink: 0 }}>
        <SmartImage src={poster} alt={'Episode ' + num} />
      </span>
      <span className="hn-row-main">
        <span className="hn-row-title">Episode {num}{title ? ` — ${title}` : ''}</span>
        {date ? <span className="hn-row-sub">{date}</span> : null}
        {progress ? (
          <span className="hn-progressbar" style={{ position: 'static', marginTop: 6 }}>
            <span className="hn-progressbar-fill" style={{ width: `${Math.min(100, Math.round(progress))}%` }} />
          </span>
        ) : null}
      </span>
      {watched ? (
        <span className="hn-row-actions" style={{ color: 'var(--accent-green)' }}>
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

export function ScheduleCard({
  item,
  onOpen
}: {
  item: ScheduleItem;
  onOpen: (item: ScheduleItem) => void;
}) {
  return (
    <button type="button" className="hn-card" onClick={() => onOpen(item)} aria-label={item.title}>
      <span className="hn-card-poster">
        <SmartImage src={item.poster} animeId={titleKey(item.title)} alt={item.title} />
        {item.episode ? <span className="hn-episodecode">{item.episode}</span> : null}
      </span>
      <span className="hn-card-title">{item.title}</span>
    </button>
  );
}

export function DayPill({
  label,
  active,
  date,
  onClick
}: {
  label: string;
  active?: boolean;
  date?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`hn-datetab${active ? ' hn-active' : ''}`} onClick={onClick}>
      {date ? `${label} ${date}` : label}
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`hn-chip${active ? ' hn-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
