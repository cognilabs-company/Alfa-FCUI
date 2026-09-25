// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { useT } from '@/shared/i18n/lang';
import { monthLabel, fmtDate, fmtDateTime } from '@/shared/lib/format';

const WEEKDAYS = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(y, mo, d) { return `${y}-${pad(mo + 1)}-${pad(d)}`; }
function parseISO(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
}
function parseTime(v) {
  const m = String(v || '').match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

function CalendarPop({ anchorRef, value, onPick, lang, t, withTime, time, onTimeChange, onClose, multi, selectedSet }) {
  const popRef = React.useRef(null);
  const today = new Date();
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());
  const sel = parseISO(value);
  const [view, setView] = React.useState({ y: sel?.y ?? today.getFullYear(), mo: sel?.mo ?? today.getMonth() });
  const [mode, setMode] = React.useState('days');
  const W = 282;

  const [pos, setPos] = React.useState({ top: -9999, left: -9999 });
  React.useLayoutEffect(() => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const H = popRef.current?.offsetHeight || 360;
    const top = (window.innerHeight - r.bottom < H + 12 && r.top > H + 12) ? r.top - H - 6 : r.bottom + 6;
    const left = Math.min(Math.max(r.left, 8), window.innerWidth - W - 8);
    setPos({ top, left });
  }, [mode, withTime]);

  React.useEffect(() => {
    function down(e) {
      if (popRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    }
    function key(e) { if (e.key === 'Escape') onClose(); }
    function scroll(e) { if (!popRef.current?.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, []);

  const wd = WEEKDAYS[lang] || WEEKDAYS.uz;
  const firstIdx = (new Date(view.y, view.mo, 1).getDay() + 6) % 7;
  const daysIn = new Date(view.y, view.mo + 1, 0).getDate();
  const daysPrev = new Date(view.y, view.mo, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstIdx + 1;
    if (dayNum < 1) cells.push({ d: daysPrev + dayNum, y: view.mo === 0 ? view.y - 1 : view.y, mo: (view.mo + 11) % 12, out: true });
    else if (dayNum > daysIn) cells.push({ d: dayNum - daysIn, y: view.mo === 11 ? view.y + 1 : view.y, mo: (view.mo + 1) % 12, out: true });
    else cells.push({ d: dayNum, y: view.y, mo: view.mo, out: false });
  }

  function nav(delta) {
    if (mode === 'days') {
      const m = view.mo + delta;
      setView({ y: view.y + Math.floor(m / 12), mo: ((m % 12) + 12) % 12 });
    } else if (mode === 'months') setView(v => ({ ...v, y: v.y + delta }));
    else setView(v => ({ ...v, y: v.y + delta * 12 }));
  }

  const yearBase = view.y - (view.y % 12);

  return createPortal(
    <div ref={popRef} className="cal-pop" style={{ top: pos.top, left: pos.left, width: W, zIndex: 5500 }}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => nav(-1)}><Icon.ChevronLeft size={15}/></button>
        <button type="button" className="cal-label" onClick={() => setMode(mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days')}>
          {mode === 'days' && `${monthLabel(view.mo, lang)} ${view.y}`}
          {mode === 'months' && view.y}
          {mode === 'years' && `${yearBase} – ${yearBase + 11}`}
        </button>
        <button type="button" className="cal-nav" onClick={() => nav(1)}><Icon.ChevronRight size={15}/></button>
      </div>

      {mode === 'days' && (
        <>
          <div className="cal-grid cal-wd">
            {wd.map(w => <span key={w}>{w}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((c, i) => {
              const iso = toISO(c.y, c.mo, c.d);
              const isSel = multi ? selectedSet?.has(iso) : (value && iso === value.slice(0, 10));
              const cls = 'cal-cell' + (c.out ? ' muted' : '') + (iso === todayISO ? ' today' : '') + (isSel ? ' selected' : '');
              return (
                <button key={i} type="button" className={cls}
                  onClick={() => { if (c.out) setView({ y: c.y, mo: c.mo }); onPick(iso, multi ? false : !withTime); }}>
                  {c.d}
                </button>
              );
            })}
          </div>
        </>
      )}

      {mode === 'months' && (
        <div className="cal-mgrid">
          {Array.from({ length: 12 }, (_, m) => (
            <button key={m} type="button" className={'cal-mcell' + (m === view.mo ? ' selected' : '')}
              onClick={() => { setView(v => ({ ...v, mo: m })); setMode('days'); }}>
              {monthLabel(m, lang)}
            </button>
          ))}
        </div>
      )}

      {mode === 'years' && (
        <div className="cal-mgrid">
          {Array.from({ length: 12 }, (_, i) => yearBase + i).map(y => (
            <button key={y} type="button" className={'cal-mcell' + (y === view.y ? ' selected' : '')}
              onClick={() => { setView(v => ({ ...v, y })); setMode('months'); }}>
              {y}
            </button>
          ))}
        </div>
      )}

      {withTime && (
        <div className="cal-time">
          <Icon.Clock size={14} color="var(--muted)"/>
          <input type="time" value={time} onChange={e => onTimeChange(e.target.value)}/>
        </div>
      )}

      <div className="cal-foot">
        <button type="button" className="btn ghost sm" onClick={() => { setView({ y: today.getFullYear(), mo: today.getMonth() }); setMode('days'); onPick(todayISO, multi ? false : !withTime); }}>
          {t('cal_today')}
        </button>
        {multi
          ? <button type="button" className="btn primary sm" onClick={onClose}>{t('cal_ok')}</button>
          : withTime
            ? <button type="button" className="btn primary sm" onClick={onClose}>{t('cal_ok')}</button>
            : (value ? <button type="button" className="btn ghost sm" onClick={() => onPick('', true)}>{t('cal_clear')}</button> : null)}
      </div>
    </div>,
    document.body
  );
}

/** Handmade calendar input. value: 'YYYY-MM-DD' | ''. onChange(value). */
export function DateInput({ value, onChange, placeholder, style }) {
  const { t, tp, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  return (
    <>
      <button type="button" ref={btnRef} className="date-input" style={style} onClick={() => setOpen(o => !o)}>
        <Icon.Calendar size={15} color="var(--muted)"/>
        <span className={'date-input-value' + (value ? '' : ' ph')}>{value ? fmtDate(value) : (placeholder || t('cal_pick'))}</span>
        {value && (
          <span className="date-input-clear" onClick={(e) => { e.stopPropagation(); onChange(''); }}>
            <Icon.X size={13}/>
          </span>
        )}
      </button>
      {open && (
        <CalendarPop anchorRef={btnRef} value={value || ''} lang={lang} t={t}
          onPick={(iso, close) => { onChange(iso); if (close) setOpen(false); }}
          onClose={() => setOpen(false)}/>
      )}
    </>
  );
}

/** Multi-select calendar. values: string[] of 'YYYY-MM-DD'. onChange(next[]). Click a day to toggle it. */
export function MultiDateInput({ values, onChange, placeholder, style }) {
  const { t, tp, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const list = values || [];
  const set = React.useMemo(() => new Set(list), [list]);
  const label = list.length === 0
    ? (placeholder || t('cal_pick'))
    : list.length === 1
      ? fmtDate(list[0])
      : `${list.length} ${tp('sessions_dates_selected', list.length)}`;
  function toggle(iso) {
    if (!iso) return;
    onChange(set.has(iso) ? list.filter(v => v !== iso) : [...list, iso]);
  }
  return (
    <>
      <button type="button" ref={btnRef} className="date-input" style={style} onClick={() => setOpen(o => !o)}>
        <Icon.Calendar size={15} color="var(--muted)"/>
        <span className={'date-input-value' + (list.length ? '' : ' ph')}>{label}</span>
      </button>
      {open && (
        <CalendarPop anchorRef={btnRef} value="" lang={lang} t={t} multi selectedSet={set}
          onPick={(iso, close) => { if (close) { setOpen(false); return; } toggle(iso); }}
          onClose={() => setOpen(false)}/>
      )}
    </>
  );
}

/** Handmade calendar + time. value: 'YYYY-MM-DDTHH:mm' | ''. onChange(value). */
export function DateTimeInput({ value, onChange, placeholder, style }) {
  const { t, tp, lang } = useT();
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const datePart = (value || '').slice(0, 10);
  const timePart = parseTime(value) || '00:00';
  return (
    <>
      <button type="button" ref={btnRef} className="date-input" style={style} onClick={() => setOpen(o => !o)}>
        <Icon.Calendar size={15} color="var(--muted)"/>
        <span className={'date-input-value' + (value ? '' : ' ph')}>{value ? fmtDateTime(value) : (placeholder || t('cal_pick'))}</span>
        {value && (
          <span className="date-input-clear" onClick={(e) => { e.stopPropagation(); onChange(''); }}>
            <Icon.X size={13}/>
          </span>
        )}
      </button>
      {open && (
        <CalendarPop anchorRef={btnRef} value={datePart} lang={lang} t={t} withTime time={timePart}
          onPick={(iso) => { onChange(iso ? `${iso}T${timePart}` : ''); }}
          onTimeChange={(tm) => { if (datePart) onChange(`${datePart}T${tm}`); }}
          onClose={() => setOpen(false)}/>
      )}
    </>
  );
}
