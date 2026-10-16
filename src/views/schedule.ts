import { API, dayIndex } from '../core/api';
import { WEEKDAYS_SHORT } from '../core/config';
import { esc } from '../core/utils';
import { svg } from '../core/icons';
import { progress } from '../core/client';
import { initView } from '../ui/dom';
import { footerHTML, secHead, stateHTML } from '../ui/components';
import { detailHref, type ParsedRoute } from '../core/router';
import type { ScheduleGroup } from '../core/api';

const host = () => document.getElementById('view') as HTMLElement;
let groups: ScheduleGroup[] = [];
let activeDay = new Date().getDay();

function paint(): void {
  const days = document.getElementById('schedDays');
  const list = document.getElementById('schedList');
  if (!days || !list) return;

  days.innerHTML = WEEKDAYS_SHORT.map((d, i) => {
    const g = groups.find(x => dayIndex(x.day) === i);
    const n = g ? g.items.length : 0;
    return (
      '<button class="sched-day' + (activeDay === i ? ' on' : '') + '" data-act="sched-day" data-d="' + i + '">' +
      '<span class="d">' + d + '</span><span class="n">' + (n || '–') + '</span></button>'
    );
  }).join('');

  const g = groups.find(x => dayIndex(x.day) === activeDay);
  if (!g) {
    list.innerHTML = stateHTML('empty', 'Tidak ada rilis', 'Tidak ada jadwal rilis untuk hari ini.', '');
    return;
  }
  list.innerHTML = g.items
    .map(
      (it, i) =>
        '<div class="rv-s" style="--d:' + (i * 24) + 'ms"><a class="sched-row" href="' + detailHref(it.id, it.provider, it.slug, it.title) + '">' +
        (it.time ? '<span class="tm">' + esc(it.time) + '<small>' + esc(g.day.slice(0, 3)) + '</small></span>' : '') +
        (it.poster ? '<span class="th" style="width:44px;height:60px;flex:none;border-radius:9px;overflow:hidden;border:1px solid var(--line)"><img src="' + esc(it.poster) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"></span>' : '') +
        '<span class="tx"><b>' + esc(it.title) + '</b><span>' +
        (it.episode ? esc(it.episode) : it.time ? esc(it.time) : 'Segera') + '</span></span>' +
        '<span class="go" style="width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:var(--dim)">' + svg('right', '', 2.2) + '</span>' +
        '</a></div>'
    )
    .join('');
  initView(list);
}

export async function ViewSchedule(_r?: ParsedRoute): Promise<void> {
  host().innerHTML =
    '<div class="shell" style="padding-top:18px">' +
    '<div class="rv in" style="margin-bottom:16px"><h1 style="font-size:clamp(24px,5vw,32px);font-weight:760">Jadwal Rilis</h1>' +
    '<p style="margin:6px 0 0;color:var(--mut);font-size:13.4px">Jadwal episode mingguan · <b>Multi-sumber otomatis</b></p></div>' +
    '<div class="sched-days" id="schedDays"></div>' +
    '<div id="schedList" class="sched-list">' + skeleton() + '</div>' +
    footerHTML() + '</div>';

  try {
    progress(true, 25);
    groups = await API.schedule();
    progress(true, 100);
    setTimeout(() => progress(false), 250);
    if (!groups.find(x => dayIndex(x.day) === activeDay) && groups.length) {
      activeDay = dayIndex(groups[0].day);
    }
    paint();
  } catch (e: any) {
    progress(false);
    const list = document.getElementById('schedList');
    if (list) {
      list.innerHTML = stateHTML(
        'err',
        'Jadwal tidak tersedia',
        e?.message || 'Jadwal rilis tidak tersedia saat ini.',
        '<button class="btn primary" data-act="reload">' + svg('refresh', '', 2.1) + ' Muat ulang</button>'
      );
    }
    const days = document.getElementById('schedDays');
    if (days) days.style.display = 'none';
  }
}

function skeleton(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += '<div class="sk" style="height:66px;border-radius:15px;margin-bottom:9px"></div>';
  return s;
}

export const ScheduleActions = {
  setDay(n: number) {
    activeDay = n;
    paint();
  }
};
