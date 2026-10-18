import type { CSSProperties, ReactNode } from 'react';
import type { AggregatedCard, ScheduleItem } from '../core/types';
import type { HistoryItem } from '../lib/remote/types';
import { Icon } from './icons';
import { SmartImage } from './SmartImage';
import { ProgressBar } from './Feedback';
import { titleKey } from '../core/services/TitleIndex';

/** Kartu-kartu siap pakai di seluruh halaman. */

export function Grid({ children }: { children: ReactNode }) {
  return <div className="poster-grid stagger">{children}</div>;
}

export function Rail({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'rail no-scrollbar ' + className}>{children}</div>;
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
    <button type="button" className="anime-card" style={style} onClick={() => onOpen(card)} aria-label={card.title}>
      <div className="poster-wrap">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} eager={index < 4} />
        {card.score ? (
          <span className="rating-chip">
            <Icon name="starFill" size={11} strokeWidth={0} />
            {card.score}
          </span>
        ) : null}
        {card.epLabel ? <span className="ep-chip">{card.epLabel}</span> : null}
      </div>
      <span className="card-title clamp-2">{titleNode ?? card.title}</span>
      <span className="card-meta">
        {card.type ? (
          <span className="meta-item">
            <Icon name="film" size={13} strokeWidth={2} />
            {card.type}
          </span>
        ) : null}
        {card.status ? <span className="ellipsis">{card.status}</span> : null}
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
    <button type="button" className="weekly-card" onClick={() => onOpen(card)} aria-label={card.title}>
      <span className="week-bg">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} />
      </span>
      <span className="week-shade" />
      <span className="rank">{card.rank ?? 1}</span>
      <span className="week-body">
        <span className="week-title clamp-2">{card.title}</span>
        <span className="week-meta">
          {card.score ? (
            <span className="meta-item gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Icon name="starFill" size={13} strokeWidth={0} />
              {card.score}
            </span>
          ) : null}
          {card.epLabel ? <span>{card.epLabel}</span> : null}
        </span>
      </span>
    </button>
  );
}

/* ── Kartu gaya AnibiPlay (map-anibiplay.md) ── */

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
    <button type="button" className="up-card anim-up" style={style} onClick={() => onOpen(card)} aria-label={card.title}>
      <span className="up-poster">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} eager={index < 6} />
        {badge ? <span className="up-badge">{badge}</span> : null}
        {score ? (
          <span className="up-rating">
            <Icon name="starFill" size={11} strokeWidth={0} />
            {score}
          </span>
        ) : null}
        {overlay ? <span className="up-ep">{overlay}</span> : null}
      </span>
      {card.views ? (
        <span className="up-views">
          <Icon name="play" size={10} strokeWidth={0} />
          {card.views}
        </span>
      ) : null}
      <span className="up-title clamp-2">{titleNode ?? card.title}</span>
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
    <button type="button" className="rank-card anim-up" style={style} onClick={() => onOpen(card)} aria-label={card.title}>
      <span className="rk-img">
        <SmartImage src={card.poster} animeId={card.canonicalId} alt={card.title} />
        {card.rank ? <span className="rk-badge">#{card.rank}</span> : null}
        {score ? (
          <span className="rk-rating">
            <Icon name="starFill" size={11} strokeWidth={0} />
            {score}
          </span>
        ) : null}
        {card.epLabel ? <span className="rk-eps">{card.epLabel}</span> : null}
      </span>
      {card.views ? (
        <span className="rk-views">
          <Icon name="play" size={10} strokeWidth={0} />
          {card.views} views
        </span>
      ) : null}
      <span className="rk-title clamp-2">{card.title}</span>
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
    <button type="button" className="cr-card anim-up" onClick={() => onOpen(item)} aria-label={item.title}>
      <span className="cr-img">
        <SmartImage src={item.poster} animeId={item.animeId} alt={item.title} />
        <span className="cr-eps">Eps {item.episode}</span>
      </span>
      <span className="cr-title clamp-2">{item.title}</span>
      <span className="cr-meta">
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
    <div className="continue-card anim-up">
      <button type="button" className="cw-thumb" onClick={() => onOpen(item)} aria-label={item.title}>
        <SmartImage src={item.poster} animeId={item.animeId} alt={item.title} />
      </button>
      <button type="button" className="cw-body" onClick={() => onOpen(item)} style={{ textAlign: 'left' }}>
        <span className="cw-title clamp-2">{item.title}</span>
        <span className="cw-sub">
          Episode {item.episode}
          {item.completed ? ' • Selesai' : item.percent > 0 ? ` • ${Math.round(item.percent)}%` : ''}
        </span>
        <ProgressBar value={(item.percent || 0) / 100} />
      </button>
      {onRemove ? (
        <button type="button" className="ibtn" onClick={() => onRemove(item)} aria-label="Hapus dari lanjutkan menonton">
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
      className={'ep-row ripple-host' + (current ? ' current' : '')}
      onClick={onOpen}
      aria-current={current}
    >
      <span className="ep-thumb">
        <SmartImage src={poster} alt={'Episode ' + num} />
      </span>
      <span className="ep-body">
        <span className="ep-title ellipsis">
          Episode {num}
          {title ? ` — ${title}` : ''}
        </span>
        {date ? <span className="ep-sub">{date}</span> : null}
      </span>
      {watched ? (
        <span className="ep-check">
          <Icon name="check" size={11} strokeWidth={3} />
        </span>
      ) : null}
      {progress ? (
        <span className="ep-progress">
          <span className="fill" style={{ '--pct': Math.min(1, progress) } as CSSProperties} />
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
    <button type="button" className="schedule-card" onClick={() => onOpen(item)} aria-label={item.title}>
      <span className="sc-poster">
        <SmartImage src={item.poster} animeId={titleKey(item.title)} alt={item.title} />
      </span>
      <span className="sc-body">
        <span className="sc-title clamp-2">{item.title}</span>
        <span className="sc-meta">
          {item.episode ? <span>{item.episode}</span> : null}
          <span className="meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon name="clock" size={12} strokeWidth={2} />
            {item.time}
          </span>
        </span>
      </span>
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
    <button type="button" className={'day-pill' + (active ? ' active' : '')} onClick={onClick}>
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
    <button type="button" className={'chip' + (active ? ' active' : '')} onClick={onClick}>
      {children}
    </button>
  );
}
