// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { DateInput } from '@/shared/ui/date-picker';
import { apiPayExpense } from '@/shared/api';
import { monthLabel, todayISO } from '@/shared/lib/format';
import { categoryLabel, expenseUnpaid, personName, toPaidAt } from '@/shared/lib/expenses';
import { MethodSeg, MoneyInput, useMoney } from './parts';

export function ExpensePayDialog({ expense, onClose, onDone, onShowReceipt }) {
  const I = Icon;
  const { t, lang } = useT();
  const money = useMoney();
  const outstanding = Math.round(expenseUnpaid(expense));
  const [amount, setAmount] = React.useState(String(outstanding || ''));
  const [paidAt, setPaidAt] = React.useState(todayISO());
  const [method, setMethod] = React.useState(expense?.method || 'cash');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const label = personName(expense) || expense.title || categoryLabel(t, expense.category, expense.category_label);

  async function submit() {
    setError('');
    const n = Number(amount || 0);
    if (!(n > 0)) return setError(t('exp_err_amount'));
    if (n > outstanding) return setError(t('exp_err_overpay').replace('{amount}', money(outstanding)));
    if (!paidAt) return setError(t('exp_err_date'));
    if (paidAt > todayISO()) return setError(t('exp_err_future'));
    setSaving(true);
    try {
      await apiPayExpense(expense.id, {
        paid_amount: n,
        paid_at: toPaidAt(paidAt),
        method,
        note: note.trim() || null,
      });
      onDone?.(t('exp_paid_toast'));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal icon={I.HandCoins} size="sm" onClose={onClose} title={t('exp_pay_title')} subtitle={label}
      footer={<>
        {onShowReceipt && <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={onShowReceipt}><I.Receipt size={14}/> {t('exp_show_receipt')}</button>}
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('exp_pay_confirm')}</button>
      </>}>
      <div className="owed-box">
        <div className="owed-top">
          <span>{monthLabel(Number(expense.period_month) - 1, lang)} {expense.period_year}</span>
          <span>{categoryLabel(t, expense.category, expense.category_label)}</span>
        </div>
        <div className="owed-main">
          <span>{t('exp_outstanding')}</span>
          <b>{money(outstanding)}</b>
        </div>
        {Number(expense.paid_amount) > 0 && (
          <div className="owed-foot">{t('exp_already_paid').replace('{amount}', money(expense.paid_amount))}</div>
        )}
      </div>
      <div className="form-row" style={{ marginTop: 14 }}>
        <div className="field col-span-2"><label>{t('exp_amount')} <span className="req">*</span></label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} autoFocus invalid={!!error}/>
        </div>
        <div className="field"><label>{t('exp_paid_at')} <span className="req">*</span></label>
          <DateInput value={paidAt} onChange={v => setPaidAt(v || todayISO())}/>
        </div>
        <div className="field"><label>{t('exp_method')}</label>
          <MethodSeg value={method} onChange={setMethod}/>
        </div>
        <div className="field col-span-2"><label>{t('exp_note')}</label>
          <input value={note} onChange={e => setNote(e.target.value)}/>
        </div>
      </div>
      {error && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
    </Modal>
  );
}
