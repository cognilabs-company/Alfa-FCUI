// @ts-nocheck
import React from 'react';
import { toLocalISO } from './format';

/**
 * One calendar month shared by the home page and every Reports tab
 * (FRONTEND_OY_TANLAGICH.md): pick October in one place and all of them show
 * October. Kept in memory only, so opening the app starts on the current month.
 */
const nowMonth = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };
let selected = { ...nowMonth(), version: 0 };
const listeners = new Set();
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const select = (next) => { selected = { version: selected.version, ...next }; listeners.forEach(l => l()); };

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

export function useSelectedMonth() {
  const sel = React.useSyncExternalStore(subscribe, () => selected);
  const now = nowMonth();
  const isCurrent = sel.year === now.year && sel.month === now.month;
  return {
    ...sel,
    isCurrent,
    // months to come have no payments yet, so the picker stops at this one
    shift: (delta) => {
      const d = new Date(sel.year, sel.month - 1 + delta, 1);
      const next = { year: d.getFullYear(), month: d.getMonth() + 1 };
      if (next.year * 12 + next.month > now.year * 12 + now.month) return;
      select(next);
    },
    reset: () => select(nowMonth()),
    monthStart: toLocalISO(new Date(sel.year, sel.month - 1, 1)),
    monthEnd: toLocalISO(new Date(sel.year, sel.month, 0)),
  };
}
