// @ts-nocheck
import React from 'react';
import { toLocalISO, monthLabel, monthShort } from './format';

/**
 * One period shared by the home page and every Reports tab
 * (FRONTEND_OY_TANLAGICH.md): pick October in one place and all of them show
 * October. Kept in memory only, so opening the app starts on the current month.
 *
 * The period is either one calendar month or a free date range (Reports only).
 * While a range is chosen, year/month hold the month the range ends in, so the
 * home page — which only understands months — shows that month.
 */
const nowMonth = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };
let selected = { ...nowMonth(), mode: 'month', from: null, to: null, version: 0 };
const listeners = new Set();
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const select = (next) => { selected = { version: selected.version, mode: 'month', from: null, to: null, ...next }; listeners.forEach(l => l()); };

// Coming back to the app after a while bumps `version`, so the money figures
// are fetched again instead of showing what the server said before a fix.
const STALE_MS = 30_000;
let hiddenAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= STALE_MS) select({ ...selected, version: selected.version + 1 });
    hiddenAt = 0;
  });
}

const monthIndex = (y, m) => y * 12 + m;
const parseISO = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
const isFirstOfMonth = (d) => d.getDate() === 1;
const isLastOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getDate() === 1;

function selectMonth(year, month) {
  const now = nowMonth();
  if (monthIndex(year, month) > monthIndex(now.year, now.month)) return;
  select({ year, month });
}

/**
 * A range that is exactly one calendar month becomes that month. It may not
 * start after today, and is cut off at the end of this month, so "this year"
 * stays whole months, like the month picker that allows this month.
 */
function selectRange(from, to) {
  if (!from || !to) return;
  if (from > to) [from, to] = [to, from];
  const now = new Date();
  const lastDay = toLocalISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (from > toLocalISO(now)) return;
  if (to > lastDay) to = lastDay;
  const f = parseISO(from), e = parseISO(to);
  const sameMonth = f.getFullYear() === e.getFullYear() && f.getMonth() === e.getMonth();
  if (sameMonth && isFirstOfMonth(f) && isLastOfMonth(e)) {
    select({ year: f.getFullYear(), month: f.getMonth() + 1 });
    return;
  }
  select({ year: e.getFullYear(), month: e.getMonth() + 1, mode: 'range', from, to });
}

export function useSelectedMonth() {
  const sel = React.useSyncExternalStore(subscribe, () => selected);
  const now = nowMonth();
  const isCurrent = sel.mode === 'month' && sel.year === now.year && sel.month === now.month;
  return {
    year: sel.year,
    month: sel.month,
    version: sel.version,
    isCurrent,
    // months to come have no payments yet, so the picker stops at this one
    shift: (delta) => {
      const d = new Date(sel.year, sel.month - 1 + delta, 1);
      selectMonth(d.getFullYear(), d.getMonth() + 1);
    },
    reset: () => select(nowMonth()),
    monthStart: toLocalISO(new Date(sel.year, sel.month - 1, 1)),
    monthEnd: toLocalISO(new Date(sel.year, sel.month, 0)),
  };
}

/**
 * The Reports period: a month or a date range, always as from_date/to_date
 * (inclusive). `months` lists the calendar months the period touches, oldest first.
 */
export function useReportPeriod() {
  const sel = React.useSyncExternalStore(subscribe, () => selected);
  const now = nowMonth();
  const isRange = sel.mode === 'range';
  const from_date = isRange ? sel.from : toLocalISO(new Date(sel.year, sel.month - 1, 1));
  const to_date = isRange ? sel.to : toLocalISO(new Date(sel.year, sel.month, 0));
  const f = parseISO(from_date), e = parseISO(to_date);
  const months = [];
  for (let d = new Date(f.getFullYear(), f.getMonth(), 1); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  const wholeMonths = isFirstOfMonth(f) && isLastOfMonth(e);
  const isCurrent = !isRange && sel.year === now.year && sel.month === now.month;

  return {
    mode: sel.mode,
    isRange,
    year: sel.year,
    month: sel.month,
    version: sel.version,
    from_date,
    to_date,
    months,
    isCurrent,
    // ‹ › step: a month by a month; a range by its own length (whole months when it is whole months)
    canShiftForward: isRange ? to_date < toLocalISO(new Date(now.year, now.month - 1, 1)) : !isCurrent,
    shift: (delta) => {
      if (!isRange) {
        const d = new Date(sel.year, sel.month - 1 + delta, 1);
        selectMonth(d.getFullYear(), d.getMonth() + 1);
        return;
      }
      let nf, ne;
      if (wholeMonths) {
        const n = months.length * delta;
        nf = new Date(f.getFullYear(), f.getMonth() + n, 1);
        ne = new Date(e.getFullYear(), e.getMonth() + n + 1, 0);
      } else {
        const days = Math.round((e - f) / 86_400_000) + 1;
        nf = new Date(f.getFullYear(), f.getMonth(), f.getDate() + days * delta);
        ne = new Date(e.getFullYear(), e.getMonth(), e.getDate() + days * delta);
      }
      selectRange(toLocalISO(nf), toLocalISO(ne));
    },
    setMonth: selectMonth,
    setRange: selectRange,
    reset: () => select(nowMonth()),
  };
}

/** "Oktabr 2026" for a month; "1 Avg – 15 Okt 2026" (or "Avg – Okt 2026" for whole months) for a range. */
export function periodLabel(p, lang) {
  if (!p.isRange) return `${monthLabel(p.month - 1, lang)} ${p.year}`;
  const f = parseISO(p.from_date), e = parseISO(p.to_date);
  const sameYear = f.getFullYear() === e.getFullYear();
  if (isFirstOfMonth(f) && isLastOfMonth(e)) {
    const a = `${monthShort(f.getMonth(), lang)}${sameYear ? '' : ' ' + f.getFullYear()}`;
    return `${a} – ${monthShort(e.getMonth(), lang)} ${e.getFullYear()}`;
  }
  const a = `${f.getDate()} ${monthShort(f.getMonth(), lang)}${sameYear ? '' : ' ' + f.getFullYear()}`;
  return `${a} – ${e.getDate()} ${monthShort(e.getMonth(), lang)} ${e.getFullYear()}`;
}
