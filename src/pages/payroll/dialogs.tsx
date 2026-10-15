// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { DateInput } from '@/shared/ui/date-picker';
import { SearchableSelect } from '@/shared/ui/controls';
import { confirmDialog } from '@/shared/ui/dialogs';
import {
  apiCreatePayrollPayment, apiUpdatePayrollPayment,
  apiCreatePayrollAdjustment, apiUpdatePayrollAdjustment,
  apiSetSalaryProfile, apiDeleteSalaryProfile,
} from '@/shared/api';
import { todayISO } from '@/shared/lib/format';
import { monthStartISO } from '@/shared/lib/expenses';
import { MoneyInput, useMoney } from '@/widgets/expenses';

const num = (v) => Number(v) || 0;

function EmployeeField({ value, onChange, employees, locked, name }) {
  const { t } = useT();
  return (
    <div className="field col-span-2"><label>{t('lg_employee')} <span className="req">*</span></label>
      {locked
        ? <input value={name || ''} readOnly/>
        : <SearchableSelect value={value} onChange={onChange} placeholder={t('py_pick_employee')}
            options={employees.map(e => ({ value: String(e.id), label: e.full_name || `#${e.id}` }))}/>}
    </div>
  );
}

function ErrorLine({ error }) {
  if (!error) return null;
  return <div className="alert danger" style={{ marginTop: 12 }}><Icon.AlertTriangle size={16}/> <span>{error}</span></div>;
}

/**
 * A salary payment — part of what was earned, or all of it. Opened from an
 * employee's row (their earned / paid / left is shown and the amount starts at
 * what is left), from the header for anyone, or on an existing payment to edit it.
 */
export function PayrollPayDialog({ item, payment, employees, nameOf, onClose, onDone }) {
  const I = Icon;
  const { t } = useT();
  const money = useMoney();
  const editing = !!payment;
  const remaining = item ? Math.round(num(item.remaining_amount)) : null;
  const [userId, setUserId] = React.useState(String(payment?.user_id ?? item?.user_id ?? ''));
  const [amount, setAmount] = React.useState(String(editing ? Math.round(num(payment.amount)) : (remaining > 0 ? remaining : '')));
  const [date, setDate] = React.useState(payment?.payment_date || todayISO());
  const [note, setNote] = React.useState(payment?.note || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setError('');
    const n = Number(amount || 0);
    if (!userId) return setError(t('py_err_employee'));
    if (!(n > 0)) return setError(t('exp_err_amount'));
    if (!editing && remaining != null && n > remaining) return setError(t('exp_err_overpay').replace('{amount}', money(remaining)));
    if (!date) return setError(t('exp_err_date'));
    if (date > todayISO()) return setError(t('exp_err_future'));
    setSaving(true);
    try {
      const body = { amount: n, payment_date: date, note: note.trim() || null };
      if (editing) await apiUpdatePayrollPayment(payment.id, body);
      else await apiCreatePayrollPayment({ user_id: Number(userId), ...body });
      onDone(t(editing ? 'py_payment_updated' : 'exp_paid_toast'));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const name = item?.user_full_name || nameOf(payment?.user_id);
  return (
    <Modal icon={I.HandCoins} size="sm" onClose={onClose} title={t(editing ? 'py_payment_edit' : 'py_pay_title')} subtitle={name || undefined}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t(editing ? 'save' : 'exp_pay_confirm')}</button>
      </>}>
      {item && (
        <div className="owed-box" style={{ marginBottom: 14 }}>
          <div className="owed-top">
            <span>{t('pf_pay_earned')}: {money(item.earned_amount)}</span>
            <span>{t('pf_pay_paid')}: {money(item.paid_amount)}</span>
          </div>
          <div className="owed-main">
            <span>{t('pf_pay_remaining')}</span>
            <b>{money(remaining)}</b>
          </div>
          {(num(item.bonus_amount) > 0 || num(item.penalty_amount) > 0) && (
            <div className="owed-foot">
              {t('py_base')}: {money(item.base_amount)} · +{money(item.bonus_amount)} · −{money(item.penalty_amount)}
            </div>
          )}
        </div>
      )}
      <div className="form-row">
        {!item && <EmployeeField value={userId} onChange={setUserId} employees={employees} locked={editing} name={name}/>}
        <div className="field col-span-2"><label>{t('exp_amount')} <span className="req">*</span></label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} autoFocus invalid={!!error}/>
          {!editing && remaining > 0 && <div className="hint">{t('py_part_hint')}</div>}
        </div>
        <div className="field"><label>{t('exp_paid_at')} <span className="req">*</span></label>
          <DateInput value={date} onChange={v => setDate(v || todayISO())}/>
        </div>
        <div className="field"><label>{t('exp_note')}</label>
          <input value={note} onChange={e => setNote(e.target.value)}/>
        </div>
      </div>
      <ErrorLine error={error}/>
    </Modal>
  );
}

/** A bonus adds to what an employee earned in the period, a penalty takes from it. */
export function AdjustmentDialog({ adjustment, presetUserId, employees, nameOf, onClose, onDone }) {
  const I = Icon;
  const { t } = useT();
  const editing = !!adjustment;
  const [type, setType] = React.useState(adjustment?.adjustment_type || 'bonus');
  const [userId, setUserId] = React.useState(String(adjustment?.user_id ?? presetUserId ?? ''));
  const [amount, setAmount] = React.useState(editing ? String(Math.round(num(adjustment.amount))) : '');
  const [date, setDate] = React.useState(adjustment?.adjustment_date || todayISO());
  const [note, setNote] = React.useState(adjustment?.note || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setError('');
    const n = Number(amount || 0);
    if (!userId) return setError(t('py_err_employee'));
    if (!(n > 0)) return setError(t('exp_err_amount'));
    if (!date) return setError(t('exp_err_date'));
    setSaving(true);
    try {
      const body = { adjustment_type: type, amount: n, adjustment_date: date, note: note.trim() || null };
      if (editing) await apiUpdatePayrollAdjustment(adjustment.id, body);
      else await apiCreatePayrollAdjustment({ user_id: Number(userId), ...body });
      onDone(t(editing ? 'py_adj_updated' : 'py_adj_saved'));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const locked = editing || presetUserId != null;
  return (
    <Modal icon={type === 'penalty' ? I.MinusCircle : I.PlusCircle} size="sm" onClose={onClose}
      title={t(editing ? 'py_adj_edit' : 'py_adj_title')} subtitle={locked ? nameOf(Number(userId)) : undefined}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
      </>}>
      <div className="seg" role="radiogroup" style={{ marginBottom: 14 }}>
        {[['bonus', I.PlusCircle], ['penalty', I.MinusCircle]].map(([k, Ic]) => (
          <button key={k} type="button" role="radio" aria-checked={type === k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>
            <Ic size={14}/> {t(`py_type_${k}`)}
          </button>
        ))}
      </div>
      <div className="form-row">
        {!locked && <EmployeeField value={userId} onChange={setUserId} employees={employees}/>}
        <div className="field col-span-2"><label>{t('exp_amount')} <span className="req">*</span></label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} autoFocus invalid={!!error}/>
          <div className="hint">{t(type === 'penalty' ? 'py_penalty_hint' : 'py_bonus_hint')}</div>
        </div>
        <div className="field"><label>{t('py_date')} <span className="req">*</span></label>
          <DateInput value={date} onChange={v => setDate(v || todayISO())}/>
        </div>
        <div className="field"><label>{t('exp_note')}</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="KPI"/>
        </div>
      </div>
      <ErrorLine error={error}/>
    </Modal>
  );
}

/**
 * An employee's standing rate: monthly, or per day worked. Picking someone who
 * already has a rate loads it, so saving updates it rather than adding a second.
 */
export function ProfileDialog({ presetUserId, employees, profiles, nameOf, onClose, onDone }) {
  const I = Icon;
  const { t } = useT();
  const profileOf = (id) => profiles.find(p => String(p.user_id) === String(id)) || null;
  const [userId, setUserId] = React.useState(presetUserId != null ? String(presetUserId) : '');
  const existing = profileOf(userId);
  const [salaryType, setSalaryType] = React.useState(existing?.salary_type || 'monthly');
  const [amount, setAmount] = React.useState(existing ? String(Math.round(num(existing.amount))) : '');
  const [from, setFrom] = React.useState(existing?.effective_from || monthStartISO());
  const [active, setActive] = React.useState(existing ? existing.is_active !== false : true);
  const [note, setNote] = React.useState(existing?.note || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function pick(id) {
    setUserId(id);
    const p = profileOf(id);
    setSalaryType(p?.salary_type || 'monthly');
    setAmount(p ? String(Math.round(num(p.amount))) : '');
    setFrom(p?.effective_from || monthStartISO());
    setActive(p ? p.is_active !== false : true);
    setNote(p?.note || '');
  }

  async function submit() {
    setError('');
    const n = Number(amount || 0);
    if (!userId) return setError(t('py_err_employee'));
    if (!(n > 0)) return setError(t('exp_err_amount'));
    if (!from) return setError(t('exp_err_date'));
    setSaving(true);
    try {
      await apiSetSalaryProfile(Number(userId), { salary_type: salaryType, amount: n, effective_from: from, is_active: active, note: note.trim() || null });
      onDone(t('py_rate_saved'));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!await confirmDialog(t('py_rate_delete_confirm').replace('{name}', nameOf(Number(userId))))) return;
    setSaving(true);
    try {
      await apiDeleteSalaryProfile(Number(userId));
      onDone(t('py_rate_deleted'));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const locked = presetUserId != null;
  return (
    <Modal icon={I.Coins} size="sm" onClose={onClose} title={t(existing ? 'py_rate_edit' : 'py_rate_title')} subtitle={locked ? nameOf(Number(userId)) : undefined}
      footer={<>
        {existing && <button className="btn danger-ghost" style={{ marginRight: 'auto' }} onClick={remove} disabled={saving}><I.Trash2 size={14}/> {t('delete')}</button>}
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
      </>}>
      <div className="form-row">
        {!locked && <EmployeeField value={userId} onChange={pick} employees={employees}/>}
        <div className="field col-span-2"><label>{t('py_salary_type')}</label>
          <div className="seg" role="radiogroup">
            {['monthly', 'daily'].map(k => (
              <button key={k} type="button" role="radio" aria-checked={salaryType === k} className={salaryType === k ? 'active' : ''} onClick={() => setSalaryType(k)}>
                {k === 'monthly' ? <I.Calendar size={14}/> : <I.CalendarCheck size={14}/>} {t(`py_type_${k}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="field col-span-2"><label>{t(salaryType === 'daily' ? 'py_rate_daily' : 'py_rate_monthly')} <span className="req">*</span></label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} invalid={!!error}/>
        </div>
        <div className="field"><label>{t('py_effective_from')} <span className="req">*</span></label>
          <DateInput value={from} onChange={v => setFrom(v || monthStartISO())}/>
        </div>
        <div className="field"><label>{t('students_col_status')}</label>
          <label className="check-line" style={{ height: 'var(--control-h)' }}>
            <span className="switch"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/><i/></span>
            {t(active ? 'status_active' : 'status_inactive')}
          </label>
        </div>
        <div className="field col-span-2"><label>{t('exp_note')}</label>
          <input value={note} onChange={e => setNote(e.target.value)}/>
        </div>
      </div>
      <ErrorLine error={error}/>
    </Modal>
  );
}
