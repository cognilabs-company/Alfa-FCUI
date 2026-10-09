// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { DateInput } from '@/shared/ui/date-picker';
import { SearchableSelect } from '@/shared/ui/controls';
import { apiCreateExpense, apiUpdateExpense } from '@/shared/api';
import { todayISO } from '@/shared/lib/format';
import { LEDGER_CATEGORIES, categoryLabel, isSalaryCategory, toPaidAt } from '@/shared/lib/expenses';
import { MethodSeg, MoneyInput, MonthChips } from './parts';

const yearOptions = () => {
  const y = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => y + 1 - i).map(v => ({ value: String(v), label: String(v) }));
};

export function ExpenseForm({ expense, mode, wage = 'coach_salary', defaultYear, defaultMonth, employees, onClose, onSaved }) {
  const I = Icon;
  const { t } = useT();
  const editing = !!expense;
  const payroll = mode === 'payroll';
  const booksPayment = !editing && !payroll;

  const [category, setCategory] = React.useState(expense?.category || (payroll ? wage : 'other'));
  const [coachId, setCoachId] = React.useState(expense?.coach_id != null ? String(expense.coach_id) : '');
  const [title, setTitle] = React.useState(expense?.title || '');
  const [year, setYear] = React.useState(expense?.period_year || defaultYear);
  const [month, setMonth] = React.useState(expense?.period_month || defaultMonth);
  const [amount, setAmount] = React.useState(expense ? String(Math.round(expense.amount)) : '');
  const [note, setNote] = React.useState(expense?.note || '');
  const [paidAt, setPaidAt] = React.useState(todayISO());
  const [method, setMethod] = React.useState(expense?.method || 'cash');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const periodTouched = React.useRef(false);

  const salary = isSalaryCategory(category);
  const people = category === 'coach_salary' ? employees.coaches : employees.staff;

  function changePaidAt(v) {
    const next = v || todayISO();
    setPaidAt(next);
    if (periodTouched.current) return;
    const [y, m] = next.split('-');
    if (y && m) { setYear(Number(y)); setMonth(Number(m)); }
  }

  async function submit() {
    setError('');
    const n = Number(amount || 0);
    if (!(n > 0)) return setError(t('exp_err_amount'));
    if (!editing && salary && !coachId) return setError(t('pr_err_employee'));
    if (!salary && !title.trim()) return setError(t('exp_err_title'));
    if (booksPayment && paidAt > todayISO()) return setError(t('exp_err_future'));
    setSaving(true);
    try {
      if (editing) {
        await apiUpdateExpense(expense.id, {
          amount: n,
          title: title.trim() || null,
          note: note.trim() || null,
          period_year: Number(year),
          period_month: Number(month),
        });
        onSaved(t('exp_saved'), expense.category);
      } else {
        await apiCreateExpense({
          category,
          coach_id: salary ? Number(coachId) : null,
          title: title.trim() || null,
          period_year: Number(year),
          period_month: Number(month),
          amount: n,
          note: note.trim() || null,
          ...(booksPayment ? { is_paid: true, paid_at: toPaidAt(paidAt), paid_amount: n, method } : {}),
        });
        onSaved(booksPayment ? t('exp_created_paid') : t('exp_created'), category);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal icon={payroll ? I.HandCoins : I.Coins} size="md" onClose={onClose}
      title={editing ? t('exp_edit') : (payroll ? t('pr_new') : t('exp_new'))}
      subtitle={editing ? categoryLabel(t, expense.category, expense.category_label) : undefined}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
      </>}>
      {payroll && !editing && (
        <div className="type-choice" style={{ marginBottom: 14 }}>
          {[
            { key: 'coach_salary', label: t('exp_cat_coach_salary'), hint: t('pr_coach_hint'), icon: I.Whistle },
            { key: 'staff_salary', label: t('exp_cat_staff_salary'), hint: t('pr_staff_hint'), icon: I.UserGear },
          ].map(opt => (
            <button key={opt.key} type="button" className={'type-opt' + (category === opt.key ? ' on' : '')}
              onClick={() => { setCategory(opt.key); setCoachId(''); }}>
              <opt.icon size={18}/>
              <span><b>{opt.label}</b><small>{opt.hint}</small></span>
            </button>
          ))}
        </div>
      )}

      <div className="form-row">
        {!payroll && !editing && (
          <div className="field"><label>{t('exp_category')}</label>
            <SearchableSelect value={category} onChange={setCategory}
              options={LEDGER_CATEGORIES.map(c => ({ value: c, label: categoryLabel(t, c) }))}/>
          </div>
        )}
        {salary ? (
          <div className="field col-span-2"><label>{category === 'coach_salary' ? t('pr_coach') : t('pr_employee')} {!editing && <span className="req">*</span>}</label>
            {editing
              ? <input value={expense.coach_name || '—'} disabled/>
              : <SearchableSelect value={coachId} onChange={setCoachId} placeholder={t('pr_pick_employee')}
                  options={people.map(p => ({ value: String(p.id), label: `${p.full_name}${p.phone ? ' · ' + p.phone : ''}` }))}/>}
            {editing && <div className="hint">{t('pr_person_locked')}</div>}
            {!editing && category === 'staff_salary' && employees.staffError && <div className="hint" style={{ color: 'var(--warning)' }}>{t('pr_staff_forbidden')}</div>}
          </div>
        ) : (
          <div className={'field' + (!payroll && !editing ? '' : ' col-span-2')}><label>{t('exp_title')} <span className="req">*</span></label>
            <input value={title} onChange={e => { setTitle(e.target.value); setError(''); }} placeholder={t('exp_title_ph')} autoFocus/>
          </div>
        )}
        {salary && (
          <div className="field col-span-2"><label>{t('exp_title_salary')}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('exp_title_salary_ph')}/>
          </div>
        )}

        <div className="field col-span-2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label>{t('exp_period_month')}</label>
            <div style={{ width: 120 }}>
              <SearchableSelect value={String(year)} onChange={v => { periodTouched.current = true; setYear(Number(v)); }} options={yearOptions()}/>
            </div>
          </div>
          <MonthChips selected={new Set([Number(month)])} onToggle={m => { periodTouched.current = true; setMonth(m); }}/>
        </div>

        <div className="field col-span-2"><label>{t('exp_amount')} <span className="req">*</span></label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} invalid={!!error}/>
          <div className="hint">{booksPayment ? t('exp_amount_paid_hint') : t('exp_amount_hint')}</div>
        </div>

        {booksPayment && (
          <div className="col-span-2 paid-notice">
            <div className="pn-head"><I.HandCoins size={15}/> {t('exp_paid_notice')}</div>
            <div className="form-row">
              <div className="field"><label>{t('exp_paid_at')}</label>
                <DateInput value={paidAt} onChange={changePaidAt}/>
              </div>
              <div className="field"><label>{t('exp_method')}</label>
                <MethodSeg value={method} onChange={setMethod}/>
              </div>
            </div>
          </div>
        )}

        <div className="field col-span-2"><label>{t('exp_note')}</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}/>
        </div>
      </div>
      {error && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
    </Modal>
  );
}
