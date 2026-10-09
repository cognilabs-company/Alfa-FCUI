// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { SearchableSelect } from '@/shared/ui/controls';
import { Pager } from '@/shared/ui/pager';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { apiDeleteExpense, apiGetExpensesByCategories } from '@/shared/api';
import { monthLabel } from '@/shared/lib/format';
import { SALARY_CATEGORIES, expenseStatus } from '@/shared/lib/expenses';
import {
  BulkPayBar, EmployeePayDialog, EmployeeYearModal, ExpenseForm, ExpensePayDialog, ExpensePlansModal,
  ExpenseReceiptModal, ExpenseTable, ExpenseTotals, PeriodNav, StatusSeg, runGenerate, useEmployees, usePeriod,
} from '@/widgets/expenses';

const PAGE_SIZE = 20;

export function PayrollScreen({ onToast, canManage = true }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const period = usePeriod();
  const employees = useEmployees(true);

  const [category, setCategory] = React.useState('all');
  const [coachId, setCoachId] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const [allRows, setAllRows] = React.useState([]);
  const [meta, setMeta] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [selected, setSelected] = React.useState(new Set());

  const [yearSeed, setYearSeed] = React.useState(null);
  const [receiptId, setReceiptId] = React.useState(null);
  const [payRow, setPayRow] = React.useState(null);
  const [payFor, setPayFor] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [plansOpen, setPlansOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    apiGetExpensesByCategories(category === 'all' ? SALARY_CATEGORIES : [category], {
      ...period.params,
      coach_id: coachId || undefined,
      status: status === 'all' ? undefined : status,
    })
      .then(res => {
        if (!alive) return;
        setAllRows(res?.data || []);
        setMeta(res?.meta || null);
      })
      .catch(e => { if (alive) { setAllRows([]); setMeta(null); setLoadError(e.message); } })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [category, period.year, period.month, period.wholeYear, coachId, status, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const rows = React.useMemo(() => allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [allRows, page]);
  React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  React.useEffect(() => { setPage(1); setSelected(new Set()); }, [category, period.year, period.month, period.wholeYear, coachId, status]);
  React.useEffect(() => { setSelected(new Set()); }, [page]);

  const refresh = () => setReloadKey(k => k + 1);
  const done = (msg) => { if (msg) onToast?.(msg); refresh(); };

  const people = React.useMemo(() => {
    const list = category === 'coach_salary' ? employees.coaches
      : category === 'staff_salary' ? employees.staff
        : [...employees.coaches, ...employees.staff];
    const seen = new Set();
    return list.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [employees, category]);
  const phoneOf = React.useMemo(() => {
    const map = new Map();
    [...employees.coaches, ...employees.staff].forEach(p => map.set(p.id, p.phone));
    return map;
  }, [employees]);

  const summary = meta?.summary || {};
  const total = meta?.total ?? allRows.length;
  const caption = period.wholeYear ? String(period.year) : `${monthLabel(period.month - 1, lang)} ${period.year}`;
  const receiptRow = receiptId == null ? null : allRows.find(r => r.id === receiptId) || null;

  function openPayFor(r) {
    setYearSeed(null);
    setReceiptId(null);
    if (r.coach_id == null) { setPayRow(r); return; }
    setPayFor({ seed: r, coachId: r.coach_id, name: r.coach_name || r.title || '—', category: SALARY_CATEGORIES.includes(r.category) ? r.category : 'coach_salary' });
  }

  async function remove(r) {
    const name = r.coach_name || r.title || '—';
    if (!await confirmDialog(t('exp_delete_confirm').replace('{name}', `${name} · ${monthLabel(r.period_month - 1, lang)} ${r.period_year}`))) return;
    try {
      await apiDeleteExpense(r.id);
      done(t('exp_deleted'));
    } catch (e) {
      notify.error(e.message);
    }
  }

  async function generate() {
    setGenerating(true);
    const ok = await runGenerate({ period, t, lang, onToast });
    setGenerating(false);
    if (ok) refresh();
  }

  const activeFilters = [category !== 'all', !!coachId, status !== 'all'].filter(Boolean).length;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.HandCoins}/>
        <div>
          <h1 className="page-title">{t('nav_payroll')}</h1>
          <div className="page-sub">{`${total} ${tp('exp_count_sfx', total)} · ${t('pr_sub')}`}</div>
        </div>
        {canManage && (
          <div className="page-actions">
            <button className="btn" onClick={generate} disabled={generating}><I.CalendarCheck size={15}/> {t('exp_gen_action')}</button>
            <button className="btn" onClick={() => setPlansOpen(true)}><I.Repeat size={15}/> {t('exp_plans_title')}</button>
            <button className="btn primary" onClick={() => setForm({ expense: null })}><I.Plus size={15}/> {t('pr_new')}</button>
          </div>
        )}
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <PeriodNav period={period}/>
        <div className="seg">
          {[
            { key: 'all', label: t('all'), icon: I.Stack },
            { key: 'coach_salary', label: t('pr_tab_coaches'), icon: I.Whistle },
            { key: 'staff_salary', label: t('pr_tab_staff'), icon: I.UserGear },
          ].map(o => (
            <button key={o.key} type="button" className={category === o.key ? 'active' : ''} onClick={() => { setCategory(o.key); setCoachId(''); }}>
              <o.icon size={14}/> {o.label}
            </button>
          ))}
        </div>
        <SearchableSelect value={coachId} onChange={setCoachId}
          options={[{ value: '', label: t('pr_all_employees') }, ...people.map(p => ({ value: String(p.id), label: p.full_name }))]}/>
        {activeFilters > 0 && (
          <button className="btn sm ghost" onClick={() => { setCategory('all'); setCoachId(''); setStatus('all'); period.reset(); }}>
            <I.X size={14}/> {t('exp_reset_filters')}
          </button>
        )}
      </div>

      <ExpenseTotals
        payable={Number(summary.total_amount) || 0}
        paid={Number(summary.total_paid) || 0}
        unpaid={Number(summary.total_unpaid) || 0}
        total={total}
        unpaidCount={(Number(summary.unpaid_count) || 0) + (Number(summary.partial_count) || 0)}
        loading={loading && !meta}
        caption={caption}/>

      <div style={{ marginBottom: 12 }}><StatusSeg value={status} onChange={setStatus}/></div>

      {loadError && <div className="alert danger" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{loadError}</span></div>}

      {canManage && <BulkPayBar rows={rows} selected={selected} onClear={() => setSelected(new Set())} onDone={(msg) => { setSelected(new Set()); done(msg); }}/>}

      <ExpenseTable
        rows={rows}
        loading={loading}
        subject="person"
        canManage={canManage}
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(r) => {
          if (canManage && (r.coach_id != null || expenseStatus(r) !== 'paid')) openPayFor(r);
          else if (r.coach_id != null) setYearSeed(r);
          else setReceiptId(r.id);
        }}
        onPay={openPayFor}
        onView={(r) => { if (r.coach_id != null) setYearSeed(r); else setReceiptId(r.id); }}
        viewLabel={t('pr_show_receipt')}
        onEdit={(r) => setForm({ expense: r })}
        onDelete={remove}
        emptyText={t('pr_empty')}
        footer={<Pager page={page} totalPages={totalPages} onPage={setPage} total={allRows.length} pageSize={PAGE_SIZE}/>}/>

      {yearSeed && (
        <EmployeeYearModal seed={yearSeed} year={period.year} phone={phoneOf.get(yearSeed.coach_id)} canManage={canManage} reloadKey={reloadKey}
          onClose={() => setYearSeed(null)}
          onPay={openPayFor}
          onEdit={(r) => { setYearSeed(null); setForm({ expense: r }); }}/>
      )}

      {receiptRow && (
        <ExpenseReceiptModal expense={receiptRow} canManage={canManage}
          onClose={() => setReceiptId(null)}
          onPay={(r) => { setReceiptId(null); setPayRow(r); }}
          onEdit={(r) => { setReceiptId(null); setForm({ expense: r }); }}/>
      )}

      {payRow && (
        <ExpensePayDialog expense={payRow} onClose={() => setPayRow(null)} onDone={(msg) => { setPayRow(null); done(msg); }}
          onShowReceipt={() => { const id = payRow.id; setPayRow(null); setReceiptId(id); }}/>
      )}

      {payFor && (
        <EmployeePayDialog coachId={payFor.coachId} name={payFor.name} category={payFor.category} year={period.year}
          onClose={() => setPayFor(null)}
          onShowYear={() => { const seed = payFor.seed; setPayFor(null); setYearSeed(seed); }}
          onDone={(msg, keepOpen) => { if (!keepOpen) setPayFor(null); done(msg); }}/>
      )}

      {form && (
        <ExpenseForm expense={form.expense} mode="payroll" wage={category === 'staff_salary' ? 'staff_salary' : 'coach_salary'}
          defaultYear={period.year} defaultMonth={period.wholeYear ? new Date().getMonth() + 1 : period.month}
          employees={employees}
          onClose={() => setForm(null)}
          onSaved={(msg, written) => {
            setForm(null);
            if (category !== 'all' && written && written !== category) setCategory(written);
            done(msg);
          }}/>
      )}

      {plansOpen && (
        <ExpensePlansModal categories={category === 'all' ? SALARY_CATEGORIES : [category]} canManage={canManage} employees={employees}
          onClose={() => setPlansOpen(false)} onToast={onToast} onChanged={refresh}/>
      )}
    </div>
  );
}
