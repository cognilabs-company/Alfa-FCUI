// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { apiGenerateExpenses, apiGenerateRecurringExpenses } from '@/shared/api';
import { monthLabel } from '@/shared/lib/format';
import { EXPENSE_STATUSES } from '@/shared/lib/expenses';

export function usePeriod() {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [wholeYear, setWholeYear] = React.useState(false);
  const shift = (delta) => {
    if (wholeYear) { setYear(y => y + delta); return; }
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };
  const reset = () => {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setWholeYear(false);
  };
  return { year, month, wholeYear, setWholeYear, shift, reset, params: { year, month: wholeYear ? undefined : month } };
}

export function PeriodNav({ period }) {
  const I = Icon;
  const { t, lang } = useT();
  const label = period.wholeYear ? String(period.year) : `${monthLabel(period.month - 1, lang)} ${period.year}`;
  return (
    <div className="period-nav">
      <button type="button" className="icon-btn" aria-label={t('prev')} onClick={() => period.shift(-1)}><I.ChevronLeft size={16}/></button>
      <span className="period-label">{label}</span>
      <button type="button" className="icon-btn" aria-label={t('next')} onClick={() => period.shift(1)}><I.ChevronRight size={16}/></button>
      <div className="seg">
        <button type="button" className={!period.wholeYear ? 'active' : ''} onClick={() => period.setWholeYear(false)}>{t('exp_period_month_tab')}</button>
        <button type="button" className={period.wholeYear ? 'active' : ''} onClick={() => period.setWholeYear(true)}>{t('exp_period_year_tab')}</button>
      </div>
    </div>
  );
}

export function StatusSeg({ value, onChange }) {
  const I = Icon;
  const { t } = useT();
  const icons = { all: I.Stack, unpaid: I.AlertCircle, partial: I.Hourglass, paid: I.CheckCircle };
  return (
    <div className="seg">
      {['all', ...EXPENSE_STATUSES].map(s => {
        const Ic = icons[s];
        return (
          <button key={s} type="button" className={value === s ? 'active' : ''} onClick={() => onChange(s)}>
            <Ic size={14}/> {s === 'all' ? t('all') : t(`exp_status_${s}`)}
          </button>
        );
      })}
    </div>
  );
}

export async function runGenerate({ period, t, lang, onToast }) {
  const name = period.wholeYear ? null : `${monthLabel(period.month - 1, lang)} ${period.year}`;
  const msg = `${name ? t('exp_gen_confirm_month').replace('{period}', name) : t('exp_gen_confirm_current')} ${t('exp_gen_auto_hint')}`;
  if (!await confirmDialog(msg, { title: t('exp_gen_title'), tone: 'primary', icon: Icon.CalendarCheck, confirmText: t('exp_gen_action') })) return false;
  try {
    const res = name
      ? await apiGenerateExpenses({ year: period.year, month: period.month })
      : await apiGenerateRecurringExpenses();
    const d = res?.data || {};
    onToast?.(t('exp_gen_done').replace('{created}', String(d.created_count ?? 0)).replace('{skipped}', String(d.skipped_count ?? 0)));
    return true;
  } catch (e) {
    notify.error(e.message);
    return false;
  }
}
