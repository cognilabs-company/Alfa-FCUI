// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { DateInput } from './date-picker';
import { useT } from '@/shared/i18n/lang';
import { monthShort, toLocalISO } from '@/shared/lib/format';
import { periodLabel } from '@/shared/lib/selected-month';

const W = 380;
const iso = (y, m0, d) => toLocalISO(new Date(y, m0, d));

/** Quick picks; each says which from/to it stands for, so the active one can be lit. */
function presets(t) {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  const monthOf = (k) => ({ from: iso(y, m - k, 1), to: iso(y, m - k + 1, 0) });
  return [
    { id: 'this_month', label: t('pp_this_month'), ...monthOf(0) },
    { id: 'last_month', label: t('pp_last_month'), ...monthOf(1) },
    { id: 'last_3', label: t('pp_last_3'), from: iso(y, m - 2, 1), to: iso(y, m + 1, 0) },
    { id: 'last_6', label: t('pp_last_6'), from: iso(y, m - 5, 1), to: iso(y, m + 1, 0) },
    { id: 'this_year', label: t('pp_this_year'), from: iso(y, 0, 1), to: iso(y, m + 1, 0) },
    { id: 'last_year', label: t('pp_last_year'), from: iso(y - 1, 0, 1), to: iso(y - 1, 12, 0) },
  ];
}

/**
 * ‹ Oktabr 2026 › for the Reports period (useReportPeriod). The label opens a
 * panel with quick picks, any month of any year, and a free from–to range;
 * on phones the panel is a bottom sheet. Nothing past this month can be picked.
 */
export function PeriodPicker({ period }) {
  const I = Icon;
  const { t, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const label = periodLabel(period, lang);

  return (
    <div className="period-nav">
      <button type="button" className="icon-btn" aria-label={t('prev')} onClick={() => period.shift(-1)}><I.ChevronLeft size={16}/></button>
      <button type="button" ref={btnRef} className="period-label pp-trigger" aria-haspopup="dialog" aria-expanded={open}
        title={t('pp_open')} onClick={() => setOpen(o => !o)}>
        <I.Calendar size={15}/> <span>{label}</span> <I.ChevronDown size={14}/>
      </button>
      <button type="button" className="icon-btn" aria-label={t('next')} onClick={() => period.shift(1)} disabled={!period.canShiftForward}><I.ChevronRight size={16}/></button>
      {!period.isCurrent && <button type="button" className="btn sm ghost" onClick={period.reset}>{t('lg_this_month')}</button>}
      {open && <PeriodPanel period={period} anchorRef={btnRef} onClose={() => setOpen(false)}/>}
    </div>
  );
}

function PeriodPanel({ period, anchorRef, onClose }) {
  const I = Icon;
  const { t, lang } = useT();
  const popRef = React.useRef(null);
  const now = new Date();
  const [year, setYear] = React.useState(period.year);
  const [from, setFrom] = React.useState(period.from_date);
  const [to, setTo] = React.useState(period.to_date);
  const [pos, setPos] = React.useState({ top: -9999, left: -9999 });
  const sheet = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches;

  React.useLayoutEffect(() => {
    if (sheet) return;
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(r.left + r.width / 2 - W / 2, 8), window.innerWidth - W - 8);
    setPos({ top: r.bottom + 8, left });
  }, [sheet]);

  React.useEffect(() => {
    function down(e) {
      // the from/to calendars open in their own layer; a click there is still "inside"
      if (popRef.current?.contains(e.target) || anchorRef.current?.contains(e.target) || e.target.closest?.('.cal-pop')) return;
      onClose();
    }
    function key(e) { if (e.key === 'Escape' && !document.querySelector('.cal-pop')) onClose(); }
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
    };
  }, []);

  const pick = (fn) => { fn(); onClose(); };
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const inPeriod = (y, m0) => period.months.some(p => p.year === y && p.month === m0 + 1);
  const rangeValid = from && to && from <= to && from <= toLocalISO(now);

  const panel = (
    <div ref={popRef} className={'pp-panel' + (sheet ? ' sheet' : '')} role="dialog" aria-label={t('pp_open')}
      style={sheet ? undefined : { top: pos.top, left: pos.left, width: W }}>
      {sheet && <div className="pp-grip" aria-hidden="true"/>}

      <div className="pp-section-label">{t('pp_quick')}</div>
      <div className="pp-presets">
        {presets(t).map(p => (
          <button key={p.id} type="button" className={'pill' + (p.from === period.from_date && p.to === period.to_date ? ' active' : '')}
            onClick={() => pick(() => period.setRange(p.from, p.to))}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="pp-section-label">{t('pp_pick_month')}</div>
      <div className="pp-year">
        <button type="button" className="icon-btn" aria-label={t('prev')} onClick={() => setYear(y => y - 1)}><I.ChevronLeft size={15}/></button>
        <span>{year}</span>
        <button type="button" className="icon-btn" aria-label={t('next')} onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}><I.ChevronRight size={15}/></button>
      </div>
      <div className="pp-months">
        {Array.from({ length: 12 }, (_, m0) => {
          const on = !period.isRange && period.year === year && period.month === m0 + 1;
          const within = period.isRange && inPeriod(year, m0);
          return (
            <button key={m0} type="button" className={'pp-month' + (on ? ' on' : '') + (within ? ' within' : '')}
              disabled={year * 12 + m0 > nowIdx} onClick={() => pick(() => period.setMonth(year, m0 + 1))}>
              {monthShort(m0, lang)}
            </button>
          );
        })}
      </div>

      <div className="pp-section-label">{t('pp_range')}</div>
      <div className="pp-range">
        <div className="field"><label>{t('pp_from')}</label><DateInput value={from} onChange={setFrom}/></div>
        <div className="field"><label>{t('pp_to')}</label><DateInput value={to} onChange={setTo}/></div>
      </div>
      <button type="button" className="btn primary block" disabled={!rangeValid} onClick={() => pick(() => period.setRange(from, to))}>
        {t('pp_apply')}
      </button>
    </div>
  );

  return createPortal(
    <>
      {sheet && <div className="pp-backdrop" onClick={onClose}/>}
      {panel}
    </>,
    document.body,
  );
}
