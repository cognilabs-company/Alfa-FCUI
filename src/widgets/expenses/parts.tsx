// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { CountUp } from '@/shared/ui/count-up';
import { Badge } from '@/shared/ui/status';
import { fmt, fmtMoneyRoll, monthLabel, monthShort } from '@/shared/lib/format';
import { EXPENSE_METHODS, STATUS_TONE, digitsOnly } from '@/shared/lib/expenses';

export function useMoney() {
  const { t } = useT();
  return React.useCallback((v) => `${fmt.format(Math.round(Number(v) || 0))} ${t('currency')}`, [t]);
}

export function ExpenseTotals({ payable = 0, paid = 0, unpaid = 0, total = 0, unpaidCount = 0, loading, caption, countKey = 'exp_count_sfx' }) {
  const { t, tp } = useT();
  const ratio = payable > 0 ? Math.min(1, Math.max(0, paid / payable)) : 0;
  const figures = [
    { key: 'payable', label: t('exp_totals_payable'), value: payable, icon: Icon.Coins, tone: '' },
    { key: 'paid', label: t('exp_totals_paid'), value: paid, icon: Icon.CheckCircle, tone: 'paid' },
    { key: 'unpaid', label: t('exp_totals_unpaid'), value: unpaid, icon: Icon.AlertCircle, tone: unpaid > 0 ? 'unpaid' : 'muted' },
  ];
  return (
    <section className="exp-totals">
      <div className="et-grid">
        {figures.map(f => (
          <div key={f.key} className={'et-fig' + (f.tone ? ' ' + f.tone : '')}>
            <span className="et-label"><f.icon size={14}/> {f.label}</span>
            <b className="et-value">{loading ? '—' : <CountUp value={Math.max(f.value, 0)} format={fmtMoneyRoll} duration={1300}/>}</b>
            <small className="et-exact">{loading ? '' : `${fmt.format(Math.round(Math.max(f.value, 0)))} ${t('currency')}`}</small>
          </div>
        ))}
      </div>
      <div className="et-meter">
        <div className="et-track"><i style={{ width: `${ratio * 100}%` }}/></div>
        <div className="et-foot">
          <span>{total} {tp(countKey, total)} · {unpaidCount} {tp('exp_unpaid_sfx', unpaidCount)}{caption ? ` · ${caption}` : ''}</span>
          <b>{Math.round(ratio * 100)}% {t('exp_totals_settled')}</b>
        </div>
      </div>
    </section>
  );
}

export function ExpenseStatusBadge({ status }) {
  const { t } = useT();
  const icon = status === 'paid' ? Icon.CheckCircle : status === 'partial' ? Icon.Hourglass : Icon.AlertCircle;
  return <Badge tone={STATUS_TONE[status] || 'neutral'} icon={icon}>{t(`exp_status_${status}`)}</Badge>;
}

export function PeriodText({ year, month }) {
  const { lang } = useT();
  return (
    <div className="meta" style={{ display: 'grid' }}>
      <span style={{ fontWeight: 750 }}>{monthLabel(Number(month) - 1, lang)}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{year}</span>
    </div>
  );
}

export function MoneyInput({ value, onChange, placeholder, autoFocus, invalid }) {
  const { t } = useT();
  const shown = value === '' || value == null ? '' : fmt.format(Number(value));
  return (
    <div className="money-input">
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        onChange={e => onChange(digitsOnly(e.target.value))}
      />
      <span className="money-input-unit">{t('currency')}</span>
    </div>
  );
}

const METHOD_ICON = { cash: Icon.Money, bank: Icon.Wallet, card: Icon.CreditCard };

export function MethodSeg({ value, onChange }) {
  const { t } = useT();
  return (
    <div className="seg method-seg" role="radiogroup">
      {EXPENSE_METHODS.map(m => {
        const Ic = METHOD_ICON[m];
        return (
          <button key={m} type="button" role="radio" aria-checked={value === m} className={value === m ? 'active' : ''} onClick={() => onChange(m)}>
            <Ic size={14}/> {t(`exp_method_${m}`)}
          </button>
        );
      })}
    </div>
  );
}

export function MonthChips({ selected, onToggle, states, error, disabled }) {
  const { lang } = useT();
  return (
    <div className="choice-grid months-6" role="group">
      {Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const state = states?.get(m) || 'payable';
        const on = selected.has(m);
        const locked = disabled || state !== 'payable';
        const cls = ['choice', on ? 'on' : '', !on && state === 'paid' ? 'done' : '', !on && state === 'empty' ? 'none' : '', !on && error && state === 'payable' ? 'err' : ''].filter(Boolean).join(' ');
        return (
          <button key={m} type="button" className={cls} aria-pressed={on} disabled={locked} title={monthLabel(i, lang)} onClick={() => onToggle(m)}>
            {on && <Icon.Check size={12} strokeWidth={2.6}/>}
            {!on && state === 'paid' && <Icon.CheckCircle size={12}/>}
            {monthShort(i, lang)}
          </button>
        );
      })}
    </div>
  );
}

export function ActionTile({ icon: Ic, label, hint, primary, onClick, href, disabled }) {
  const body = (
    <>
      <span className="at-icon"><Ic size={18}/></span>
      <span className="at-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </>
  );
  const cls = 'action-tile' + (primary ? ' primary' : '');
  if (href) return <a className={cls} href={href}>{body}</a>;
  return <button type="button" className={cls} onClick={onClick} disabled={disabled}>{body}</button>;
}
