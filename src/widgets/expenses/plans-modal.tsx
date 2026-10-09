// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { Badge } from '@/shared/ui/status';
import { DateInput } from '@/shared/ui/date-picker';
import { SearchableSelect } from '@/shared/ui/controls';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { apiCreateExpensePlan, apiDeleteExpensePlan, apiGenerateExpenses, apiGetExpensePlans, apiUpdateExpensePlan } from '@/shared/api';
import { fmtDate } from '@/shared/lib/format';
import { CATEGORY_COLOR, categoryLabel, isSalaryCategory, monthStartISO, nextMonthStartISO } from '@/shared/lib/expenses';
import { MoneyInput, useMoney } from './parts';

function defaultCategory(categories) {
  if (categories.includes('rent')) return 'rent';
  return categories[0] || 'other';
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function materialiseCurrentMonth(category, from) {
  if (String(from || '').slice(0, 7) > currentYM()) return null;
  const d = new Date();
  const res = await apiGenerateExpenses({ year: d.getFullYear(), month: d.getMonth() + 1, category });
  return res?.data || null;
}

function PlanForm({ plan, categories, employees, takenIds, onClose, onSaved }) {
  const I = Icon;
  const { t } = useT();
  const money = useMoney();
  const editing = !!plan;
  const payroll = categories.every(isSalaryCategory);
  const [category, setCategory] = React.useState(plan?.category || defaultCategory(categories));
  const [coachId, setCoachId] = React.useState(plan?.coach_id != null ? String(plan.coach_id) : '');
  const [title, setTitle] = React.useState(plan?.title || '');
  const [amount, setAmount] = React.useState(plan ? String(Math.round(plan.monthly_amount)) : '');
  const [from, setFrom] = React.useState(plan ? nextMonthStartISO() : monthStartISO());
  const [note, setNote] = React.useState(plan?.note || '');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const coachIds = React.useMemo(() => new Set(employees.coaches.map(c => c.id)), [employees]);
  const people = React.useMemo(() => {
    const seen = new Set();
    const list = [];
    const push = (p, role) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      list.push({ ...p, roleLabel: role });
    };
    if (categories.includes('coach_salary')) employees.coaches.forEach(p => push(p, t('pr_coach')));
    if (categories.includes('staff_salary')) employees.staff.forEach(p => push(p, (p.roles || []).map(r => r?.name).filter(Boolean).join(', ') || t('pr_employee')));
    return list.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  }, [employees, categories, t]);

  const salary = payroll || isSalaryCategory(category);
  const resolvedCategory = payroll && !editing
    ? (coachId && !coachIds.has(Number(coachId)) && categories.includes('staff_salary') ? 'staff_salary' : (categories.includes('coach_salary') ? 'coach_salary' : 'staff_salary'))
    : category;
  const amountChanged = editing && Number(amount || 0) !== Math.round(Number(plan.monthly_amount) || 0);
  const taken = !editing && coachId && takenIds.has(Number(coachId));

  async function submit() {
    setError('');
    const n = Number(amount || 0);
    if (!editing && salary && !coachId) return setError(t('pr_err_employee'));
    if (taken) return setError(t('pr_err_taken'));
    if (!editing && !salary && !title.trim()) return setError(t('exp_err_title'));
    if (!(n > 0)) return setError(t('exp_err_amount'));
    setSaving(true);
    try {
      if (editing) {
        const res = await apiUpdateExpensePlan(plan.id, {
          ...(amountChanged ? { monthly_amount: n, effective_from: from } : {}),
          title: title.trim() || null,
          note: note.trim() || null,
        });
        onSaved(res?.meta?.superseded_plan_id ? t('exp_plan_superseded') : t('exp_plan_saved'));
      } else {
        await apiCreateExpensePlan({
          category: resolvedCategory,
          coach_id: salary ? Number(coachId) : null,
          title: title.trim() || null,
          monthly_amount: n,
          effective_from: from || null,
          note: note.trim() || null,
        });
        let msg = t('exp_plan_created');
        try {
          const gen = await materialiseCurrentMonth(resolvedCategory, from);
          if (gen && gen.created_count > 0) msg = t('exp_plan_created_row');
        } catch (e) {
          notify.error(e.message);
        }
        onSaved(msg);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const personOptions = people.map(p => ({
    value: String(p.id),
    label: `${p.full_name} · ${p.roleLabel}${p.phone ? ' · ' + p.phone : ''}${takenIds.has(p.id) ? ` · ${t('pr_has_rate')}` : ''}`,
  }));

  return (
    <Modal icon={I.Repeat} size="md" onClose={onClose}
      title={editing ? t('exp_plan_edit') : (payroll ? t('pr_plan_new') : t('exp_plan_new'))}
      subtitle={editing ? (plan.coach_name || plan.title || categoryLabel(t, plan.category, plan.category_label)) : (payroll ? t('pr_plan_sub') : t('exp_plans_sub'))}
      footer={<>
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
      </>}>
      <div className="form-row">
        {!editing && !payroll && categories.length > 1 && (
          <div className="field col-span-2"><label>{t('exp_category')} <span className="req">*</span></label>
            <SearchableSelect value={category} onChange={v => { setCategory(v); setTitle(''); }}
              options={categories.map(c => ({ value: c, label: categoryLabel(t, c) }))}/>
          </div>
        )}
        {salary ? (
          <div className="field col-span-2"><label>{t('pr_employee')} {!editing && <span className="req">*</span>}</label>
            {editing
              ? <input value={plan.coach_name || '—'} disabled/>
              : <SearchableSelect value={coachId} onChange={v => { setCoachId(v); setError(''); }} placeholder={t('pr_pick_employee')} options={personOptions}/>}
            {!editing && coachId && <div className="hint">{categoryLabel(t, resolvedCategory)}</div>}
            {taken && <div className="error">{t('pr_err_taken')}</div>}
            {!editing && employees.staffError && <div className="hint" style={{ color: 'var(--warning)' }}>{t('pr_staff_forbidden')}</div>}
          </div>
        ) : (
          <div className="field col-span-2"><label>{t('exp_title')} {!editing && <span className="req">*</span>}</label>
            <input value={title} onChange={e => { setTitle(e.target.value); setError(''); }} placeholder={t('exp_title_ph')} autoFocus={!editing}/>
          </div>
        )}
        {editing && <div className="col-span-2 hint" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{t('exp_plan_locked_hint')}</div>}
        <div className="field col-span-2"><label>{payroll ? t('pr_plan_monthly') : t('exp_plan_monthly')} <span className="req">*</span></label>
          <MoneyInput value={amount} onChange={v => { setAmount(v); setError(''); }} invalid={!!error} placeholder="2 000 000"/>
        </div>
        {amountChanged && (
          <div className="col-span-2 alert warning">
            <I.AlertTriangle size={16}/>
            <span>{t('exp_plan_supersede').replace('{old}', money(plan.monthly_amount)).replace('{amount}', money(amount))}</span>
          </div>
        )}
        {(!editing || amountChanged) && (
          <div className="field col-span-2"><label>{t('exp_plan_from')}</label>
            <DateInput value={from} onChange={v => setFrom(v || monthStartISO())}/>
            <div className="hint">{editing ? t('exp_plan_from_hint') : t('exp_plan_from_new_hint')}</div>
          </div>
        )}
        <div className="field col-span-2"><label>{t('exp_note')}</label>
          <input value={note} onChange={e => setNote(e.target.value)}/>
        </div>
      </div>
      {error && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
    </Modal>
  );
}

export function ExpensePlansModal({ categories, canManage, employees, onClose, onToast, onChanged }) {
  const I = Icon;
  const { t } = useT();
  const money = useMoney();
  const [plans, setPlans] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [form, setForm] = React.useState(null);
  const [search, setSearch] = React.useState('');

  const payroll = categories.every(isSalaryCategory);
  const categoryParam = categories.length === 1 ? categories[0] : undefined;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiGetExpensePlans({ category: categoryParam, page: 1, page_size: 200 });
      setPlans((res?.data || []).filter(p => categories.includes(p.category)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => { load(); }, [categories.join(',')]);

  const takenIds = React.useMemo(() => new Set(plans.filter(p => !p.effective_to && p.coach_id != null).map(p => p.coach_id)), [plans]);

  const q = search.trim().toLowerCase();
  const sorted = [...plans]
    .filter(p => !q || [p.coach_name, p.title, categoryLabel(t, p.category, p.category_label)].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => {
      const ac = a.effective_to ? 1 : 0;
      const bc = b.effective_to ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return String(a.coach_name || a.title || '').localeCompare(String(b.coach_name || b.title || ''));
    });
  const openPlans = plans.filter(p => !p.effective_to && p.is_active !== false);
  const openTotal = openPlans.reduce((s, p) => s + (Number(p.monthly_amount) || 0), 0);

  async function remove(plan) {
    const label = plan.coach_name || plan.title || categoryLabel(t, plan.category, plan.category_label);
    if (!await confirmDialog(t('exp_plan_delete_confirm').replace('{name}', label))) return;
    try {
      await apiDeleteExpensePlan(plan.id);
      onToast?.(t('exp_plan_deleted'));
      load();
      onChanged?.();
    } catch (e) {
      notify.error(e.message);
    }
  }

  if (form) {
    return (
      <PlanForm plan={form.plan} categories={categories} employees={employees} takenIds={takenIds}
        onClose={() => setForm(null)}
        onSaved={(msg) => { setForm(null); onToast?.(msg); load(); onChanged?.(); }}/>
    );
  }

  return (
    <Modal icon={I.Repeat} size="lg" onClose={onClose} title={t('exp_plans_title')} subtitle={payroll ? t('pr_plans_sub') : t('exp_plans_sub')}
      headerExtra={canManage ? <button className="btn sm primary" onClick={() => setForm({ plan: null })}><I.Plus size={14}/> {payroll ? t('pr_plan_new') : t('exp_plan_new')}</button> : null}>
      <div className="plan-total">
        <span>{t('exp_plans_monthly_total')} · {openPlans.length}</span>
        <b>{money(openTotal)}</b>
      </div>
      {plans.length > 5 && (
        <div className="search" style={{ marginBottom: 12 }}>
          <span className="icon-l"><I.Search size={15}/></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={payroll ? t('pr_plans_search') : t('exp_plans_search')}/>
        </div>
      )}
      {error && <div className="alert danger" style={{ marginBottom: 12 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
      {loading && <div className="empty loading" style={{ padding: 20 }}>{t('loading')}</div>}
      {!loading && !error && sorted.length === 0 && (
        <div className="empty" style={{ padding: 28, display: 'grid', gap: 6, placeItems: 'center' }}>
          <I.Wallet size={24} color="var(--muted)"/>
          <b>{t('exp_plans_empty')}</b>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{payroll ? t('pr_plans_empty_hint') : t('exp_plans_empty_hint')}</span>
        </div>
      )}
      {!loading && sorted.length > 0 && (
        <div className="rate-list">
          {sorted.map(p => {
            const closed = !!p.effective_to;
            const label = p.coach_name || p.title || categoryLabel(t, p.category, p.category_label);
            return (
              <div key={p.id} className={'rate-row' + (closed ? ' closed' : '')}>
                <span className="cat-dot" style={{ background: CATEGORY_COLOR[p.category] || 'var(--viz-other)' }}/>
                <div className="rate-main">
                  <b>{label}</b>
                  <small>
                    {categoryLabel(t, p.category, p.category_label)} · {fmtDate(p.effective_from)}{p.effective_to ? ` — ${fmtDate(p.effective_to)}` : ''}
                  </small>
                  {p.note && <small>{p.note}</small>}
                </div>
                <div className="rate-amount">
                  <b>{money(p.monthly_amount)}</b>
                  {closed && <Badge tone="neutral" icon={I.Archive}>{t('exp_plan_closed')}</Badge>}
                  {!closed && p.is_active === false && <Badge tone="warning" icon={I.Pause}>{t('exp_plan_paused')}</Badge>}
                </div>
                {canManage && !closed && (
                  <div className="rate-actions">
                    <button className="icon-btn plain" aria-label={t('edit')} onClick={() => setForm({ plan: p })}><I.Edit size={15}/></button>
                    <button className="icon-btn plain danger" aria-label={t('delete')} onClick={() => remove(p)}><I.Trash2 size={15}/></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!loading && sorted.length > 0 && <div className="hint" style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{t('exp_plans_auto_hint')}</div>}
    </Modal>
  );
}
