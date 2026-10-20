// @ts-nocheck
import React from 'react';
import { Icon } from './icons';
import { useT } from '@/shared/i18n/lang';
import { monthLabel } from '@/shared/lib/format';

/** ‹ Oktabr 2026 › — drives useSelectedMonth(); no way forward past the current month. */
export function MonthNav({ period }) {
  const I = Icon;
  const { t, lang } = useT();
  return (
    <div className="period-nav">
      <button type="button" className="icon-btn" aria-label={t('prev')} onClick={() => period.shift(-1)}><I.ChevronLeft size={16}/></button>
      <span className="period-label">{monthLabel(period.month - 1, lang)} {period.year}</span>
      <button type="button" className="icon-btn" aria-label={t('next')} onClick={() => period.shift(1)} disabled={period.isCurrent}><I.ChevronRight size={16}/></button>
      {!period.isCurrent && <button type="button" className="btn sm ghost" onClick={period.reset}>{t('lg_this_month')}</button>}
    </div>
  );
}
