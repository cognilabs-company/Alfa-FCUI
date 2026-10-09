// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { DateInput } from '@/shared/ui/date-picker';
import { apiGetExpenses, apiPayExpense } from '@/shared/api';
import { fmtMln, todayISO } from '@/shared/lib/format';
import { expenseStatus, expenseUnpaid, toPaidAt } from '@/shared/lib/expenses';
import { MethodSeg, MoneyInput, MonthChips, useMoney } from './parts';

export function EmployeePayDialog({ coachId, name, category, year, onClose, onDone, onShowYear }) {
  const I = Icon;
  const { t, lang } = useT();
  const money = useMoney();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [months, setMonths] = React.useState(new Set());
  const [monthsError, setMonthsError] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [paidAt, setPaidAt] = React.useState(todayISO());
  const [method, setMethod] = React.useState('cash');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const autoAmount = React.useRef('');

  const byMonth = React.useMemo(() => {
    const map = new Map();
    for (const r of rows) map.set(Number(r.period_month), r);
    return map;
  }, [rows]);

  const owedFor = React.useCallback((set) => [...set].reduce((s, m) => s + (byMonth.has(m) ? expenseUnpaid(byMonth.get(m)) : 0), 0), [byMonth]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGetExpenses({ category, coach_id: coachId, year, page: 1, page_size: 100 })
      .then(res => {
        if (!alive) return;
        const data = res?.data || [];
        setRows(data);
        const unpaid = new Set(data.filter(r => expenseStatus(r) !== 'paid').map(r => Number(r.period_month)));
        setMonths(unpaid);
        const value = data.filter(r => unpaid.has(Number(r.period_month))).reduce((s, r) => s + expenseUnpaid(r), 0);
        const text = value > 0 ? String(Math.round(value)) : '';
        autoAmount.current = text;
        setAmount(text);
      })
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [coachId, category, year]);

  const states = React.useMemo(() => {
    const map = new Map();
    for (let m = 1; m <= 12; m++) {
      const r = byMonth.get(m);
      map.set(m, !r ? 'empty' : expenseStatus(r) === 'paid' ? 'paid' : 'payable');
    }
    return map;
  }, [byMonth]);

  const selectedOwed = Math.round(owedFor(months));

  function toggleMonth(m) {
    const next = new Set(months);
    if (next.has(m)) next.delete(m); else next.add(m);
    setMonths(next);
    setMonthsError(false);
    const current = amount.trim();
    if (current && current !== autoAmount.current) return;
    const value = owedFor(next);
    const text = value > 0 ? String(Math.round(value)) : '';
    autoAmount.current = text;
    setAmount(text);
  }

  async function submit() {
    setError('');
    if (months.size === 0) { setMonthsError(true); return; }
    const total = Number(amount || 0);
    if (!(total > 0)) return setError(t('exp_err_amount'));
    if (total > selectedOwed) return setError(t('exp_err_overpay').replace('{amount}', money(selectedOwed)));
    if (paidAt > todayISO()) return setError(t('exp_err_future'));
    const targets = [...months].sort((a, b) => a - b).map(m => byMonth.get(m)).filter(Boolean);
    let left = total;
    let paidCount = 0;
    setSaving(true);
    try {
      for (const r of targets) {
        if (left <= 0) break;
        const due = Math.min(left, Math.round(expenseUnpaid(r)));
        if (due <= 0) continue;
        await apiPayExpense(r.id, { paid_amount: due, paid_at: toPaidAt(paidAt), method });
        left -= due;
        paidCount += 1;
      }
      onDone?.(t('exp_pay_months_toast').replace('{n}', String(paidCount)));
    } catch (e) {
      setError(paidCount > 0 ? `${e.message} · ${t('exp_pay_partial_saved').replace('{n}', String(paidCount))}` : e.message);
      if (paidCount > 0) onDone?.(null, true);
    } finally {
      setSaving(false);
    }
  }

  const partial = Number(amount || 0) > 0 && Number(amount) < selectedOwed;
  const allSettled = !loading && rows.length > 0 && rows.every(r => expenseStatus(r) === 'paid');

  return (
    <Modal icon={I.HandCoins} size="md" onClose={onClose} title={t('exp_pay_title')} subtitle={`${name} · ${year}`}
      footer={<>
        {onShowYear && <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={onShowYear}><I.Receipt size={14}/> {t('pr_show_receipt')}</button>}
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving || loading || allSettled}><I.Check size={14}/> {saving ? t('saving') : t('exp_pay_confirm')}</button>
      </>}>
      {allSettled && <div className="alert success" style={{ marginBottom: 14 }}><I.CheckCircle size={16}/> <span>{t('pr_all_settled')}</span></div>}
      <div className="field">
        <label style={{ display: 'flex', justifyContent: 'space-between', color: monthsError ? 'var(--danger)' : undefined }}>
          <span>{t('pr_which_months')}</span>
          <span className="num" style={{ color: months.size ? 'var(--text)' : 'var(--muted)' }}>{String(months.size).padStart(2, '0')}/12</span>
        </label>
        {loading
          ? <div className="empty loading" style={{ padding: 16 }}>{t('loading')}</div>
          : <MonthChips selected={months} onToggle={toggleMonth} states={states} error={monthsError}/>}
        {monthsError
          ? <div className="error">{t('pr_pick_month')}</div>
          : <div className="hint">{t('pr_month_legend')}</div>}
      </div>

      <div className="form-row" style={{ marginTop: 14 }}>
        <div className="field col-span-2">
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('exp_amount')} <span className="req">*</span></span>
            {selectedOwed > 0 && <span style={{ color: 'var(--muted)' }}>{t('exp_outstanding')}: {fmtMln(selectedOwed, lang)}</span>}
          </label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} invalid={!!error}/>
          {partial && <div className="hint" style={{ color: 'var(--warning)' }}>{t('pr_partial_hint').replace('{amount}', money(selectedOwed - Number(amount)))}</div>}
        </div>
        <div className="field"><label>{t('exp_paid_at')} <span className="req">*</span></label>
          <DateInput value={paidAt} onChange={v => setPaidAt(v || todayISO())}/>
        </div>
        <div className="field"><label>{t('exp_method')}</label>
          <MethodSeg value={method} onChange={setMethod}/>
        </div>
      </div>
      {error && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
    </Modal>
  );
}
