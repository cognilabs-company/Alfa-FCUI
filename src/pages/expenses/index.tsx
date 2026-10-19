// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { SearchableSelect } from '@/shared/ui/controls';
import { Pager } from '@/shared/ui/pager';
import { PageIcon } from '@/shared/ui/page-head';
import { Columns, Donut, ChartLegend } from '@/shared/ui/charts';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { apiDeleteExpense, apiGetExpensesByCategories, apiGetExpensesReport } from '@/shared/api';
import { fmt, fmtMln, monthLabel, monthShort } from '@/shared/lib/format';
import { CATEGORY_COLOR, categoryLabel, expenseStatus } from '@/shared/lib/expenses';
import {
  BulkPayBar, ExpenseCategoriesModal, ExpenseForm, ExpensePayDialog, ExpensePlansModal, ExpenseReceiptModal, ExpenseTable,
  ExpenseTotals, PeriodNav, StatusSeg, runGenerate, useExpenseCategories, usePeriod,
} from '@/widgets/expenses';

const PAGE_SIZE = 20;
const NO_EMPLOYEES = { coaches: [], staff: [], staffError: false, loading: false };

function ExpensesReport({ year, month }) {
  const { t, lang } = useT();
  const [byCategory, setByCategory] = React.useState([]);
  const [monthly, setMonthly] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    Promise.all([
      apiGetExpensesReport({ year, month }),
      ...months.map(m => apiGetExpensesReport({ year, month: m })),
    ])
      .then(([cat, ...perMonth]) => {
        if (!alive) return;
        setByCategory(cat?.data || []);
        setMonthly(perMonth.map((res, i) => {
          const rows = res?.data || [];
          const sum = (k) => rows.reduce((s, r) => s + (Number(r?.[k]) || 0), 0);
          return { month: i + 1, paid: sum('paid'), unpaid: sum('unpaid') };
        }));
      })
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [year, month]);

  const money = (v, axis) => (axis ? fmtMln(v, lang) : `${fmt.format(Math.round(v))} ${t('currency')}`);
  const items = byCategory
    .map(r => ({ id: r.key, label: categoryLabel(t, r.key, r.label), value: Number(r.payable) || 0, color: CATEGORY_COLOR[r.key] || 'var(--viz-other)' }))
    .filter(i => i.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = items.reduce((s, i) => s + i.value, 0);
  const series = [
    { id: 'paid', label: t('exp_totals_paid'), color: 'var(--viz-payme)' },
    { id: 'unpaid', label: t('exp_totals_unpaid'), color: 'var(--viz-cash)' },
  ];
  const periodName = month ? `${monthLabel(month - 1, lang)} ${year}` : String(year);

  if (loading) return <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>;
  if (error) return <div className="alert danger"><Icon.AlertTriangle size={16}/> <span>{error}</span></div>;

  return (
    <>
      <div className="chart-grid-2" style={{ marginBottom: 14 }}>
        <div className="chart-card span-2">
          <div className="chart-card-head">
            <div>
              <div className="ch-title">{t('exp_report_monthly')}</div>
              <div className="ch-sub">{t('exp_report_monthly_sub').replace('{year}', String(year))}</div>
            </div>
            <div className="ch-right"><ChartLegend items={series} inline/></div>
          </div>
          <Columns
            data={monthly.map(m => ({ label: monthShort(m.month - 1, lang), full: `${monthLabel(m.month - 1, lang)} ${year}`, parts: { paid: m.paid, unpaid: m.unpaid } }))}
            series={series} format={money} height={210}/>
        </div>
        <div className="chart-card">
          <div className="chart-card-head">
            <div>
              <div className="ch-title">{t('exp_report_by_category')}</div>
              <div className="ch-sub">{periodName} · {t('exp_report_with_salaries')}</div>
            </div>
          </div>
          {items.length > 0
            ? <Donut items={items} format={money} centerValue={fmtMln(total, lang)} centerLabel={t('total')}/>
            : <div className="chart-empty">{t('exp_report_empty')}</div>}
        </div>
        <div className="chart-card">
          <div className="chart-card-head">
            <div>
              <div className="ch-title">{t('exp_report_table')}</div>
              <div className="ch-sub">{periodName}</div>
            </div>
          </div>
          {byCategory.length === 0
            ? <div className="chart-empty">{t('exp_report_empty')}</div>
            : (
              <div className="table-scroll">
                <table className="table compact-report-table">
                  <thead>
                    <tr>
                      <th>{t('exp_category')}</th>
                      <th style={{ textAlign: 'right' }}>{t('exp_totals_payable')}</th>
                      <th style={{ textAlign: 'right' }}>{t('exp_totals_paid')}</th>
                      <th style={{ textAlign: 'right' }}>{t('exp_totals_unpaid')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map(r => (
                      <tr key={r.key} className="static">
                        <td>
                          <div className="row-name">
                            <span className="cat-dot" style={{ background: CATEGORY_COLOR[r.key] || 'var(--viz-other)' }}/>
                            <div className="meta">
                              <span className="name">{categoryLabel(t, r.key, r.label)}</span>
                              <span className="sub">{r.records_count} {t('exp_records_short')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(r.payable || 0))}</td>
                        <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.format(Math.round(r.paid || 0))}</td>
                        <td className="money" style={{ textAlign: 'right', color: Number(r.unpaid) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt.format(Math.round(r.unpaid || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
    </>
  );
}

export function ExpensesScreen({ onToast, canEdit = true }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const period = usePeriod();

  const [tab, setTab] = React.useState('list');
  const [category, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const [allRows, setAllRows] = React.useState([]);
  const [meta, setMeta] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [selected, setSelected] = React.useState(new Set());

  const [receiptId, setReceiptId] = React.useState(null);
  const [payRow, setPayRow] = React.useState(null);
  const [form, setForm] = React.useState(null);
  const [plansOpen, setPlansOpen] = React.useState(false);
  const [categoriesOpen, setCategoriesOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  // Salaries are in payroll; every other category, switched-off ones too, since old rows keep theirs
  const cats = useExpenseCategories();
  const ledger = React.useMemo(() => (cats.items || []).filter(c => !c.is_salary), [cats.items]);
  const ledgerKeys = ledger.map(c => c.key);
  const activeOptions = ledger.filter(c => c.is_active).map(c => ({ value: c.key, label: c.label }));

  React.useEffect(() => {
    if (tab !== 'list' || !cats.items) return;
    let alive = true;
    setLoading(true);
    setLoadError('');
    apiGetExpensesByCategories(category ? [category] : ledgerKeys, {
      ...period.params,
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
  }, [tab, category, period.year, period.month, period.wholeYear, status, reloadKey, ledgerKeys.join(',')]);

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  const rows = React.useMemo(() => allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [allRows, page]);
  React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  React.useEffect(() => { setPage(1); setSelected(new Set()); }, [category, period.year, period.month, period.wholeYear, status]);
  React.useEffect(() => { setSelected(new Set()); }, [page]);

  const refresh = () => setReloadKey(k => k + 1);
  const done = (msg) => { if (msg) onToast?.(msg); refresh(); };

  const summary = meta?.summary || {};
  const total = meta?.total ?? allRows.length;
  const caption = period.wholeYear ? String(period.year) : `${monthLabel(period.month - 1, lang)} ${period.year}`;
  const receiptRow = receiptId == null ? null : allRows.find(r => r.id === receiptId) || null;

  async function remove(r) {
    const name = r.title || categoryLabel(t, r.category, r.category_label);
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

  const categoryOptions = [{ value: '', label: t('exp_all_categories') },
    ...ledger.map(c => ({ value: c.key, label: c.is_active ? c.label : `${c.label} (${t('status_inactive').toLowerCase()})` }))];
  const activeFilters = [!!category, status !== 'all'].filter(Boolean).length;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Coins}/>
        <div>
          <h1 className="page-title">{t('nav_expenses')}</h1>
          <div className="page-sub">{tab === 'list' ? `${total} ${tp('exp_count_sfx', total)} · ${t('exp_sub')}` : t('exp_report_sub')}</div>
        </div>
        {canEdit && tab === 'list' && (
          <div className="page-actions">
            <button className="btn" onClick={generate} disabled={generating}><I.CalendarCheck size={15}/> {t('exp_gen_action')}</button>
            <button className="btn" onClick={() => setCategoriesOpen(true)}><I.Stack size={15}/> {t('exp_catm_btn')}</button>
            <button className="btn" onClick={() => setPlansOpen(true)}><I.Repeat size={15}/> {t('exp_plans_title')}</button>
            <button className="btn primary" onClick={() => setForm({ expense: null })}><I.Plus size={15}/> {t('exp_new')}</button>
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {[
          { id: 'list', label: t('exp_tab_list') },
          { id: 'report', label: t('exp_tab_report') },
        ].map(tb => (
          <button key={tb.id} type="button" className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>{tb.label}</button>
        ))}
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <PeriodNav period={period}/>
        {tab === 'list' && <SearchableSelect value={category} onChange={setCategory} options={categoryOptions}/>}
        {tab === 'list' && activeFilters > 0 && (
          <button className="btn sm ghost" onClick={() => { setCategory(''); setStatus('all'); period.reset(); }}>
            <I.X size={14}/> {t('exp_reset_filters')}
          </button>
        )}
      </div>

      {tab === 'report' && <ExpensesReport year={period.year} month={period.wholeYear ? undefined : period.month}/>}

      {tab === 'list' && (
        <>
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

          {canEdit && <BulkPayBar rows={rows} selected={selected} onClear={() => setSelected(new Set())} onDone={(msg) => { setSelected(new Set()); done(msg); }}/>}

          <ExpenseTable
            rows={rows}
            loading={loading}
            subject="venue"
            canManage={canEdit}
            selected={selected}
            onSelectedChange={setSelected}
            onRowClick={(r) => { if (canEdit && expenseStatus(r) !== 'paid') setPayRow(r); else setReceiptId(r.id); }}
            onPay={setPayRow}
            onView={(r) => setReceiptId(r.id)}
            viewLabel={t('exp_show_receipt')}
            onEdit={(r) => setForm({ expense: r })}
            onDelete={remove}
            emptyText={t('exp_empty')}
            footer={<Pager page={page} totalPages={totalPages} onPage={setPage} total={allRows.length} pageSize={PAGE_SIZE}/>}/>
        </>
      )}

      {receiptRow && (
        <ExpenseReceiptModal expense={receiptRow} canManage={canEdit}
          onClose={() => setReceiptId(null)}
          onPay={(r) => { setReceiptId(null); setPayRow(r); }}
          onEdit={(r) => { setReceiptId(null); setForm({ expense: r }); }}/>
      )}

      {payRow && (
        <ExpensePayDialog expense={payRow} onClose={() => setPayRow(null)} onDone={(msg) => { setPayRow(null); done(msg); }}
          onShowReceipt={() => { const id = payRow.id; setPayRow(null); setReceiptId(id); }}/>
      )}

      {form && (
        <ExpenseForm expense={form.expense} mode="expenses"
          defaultYear={period.year} defaultMonth={period.wholeYear ? new Date().getMonth() + 1 : period.month}
          employees={NO_EMPLOYEES} categoryOptions={activeOptions}
          onClose={() => setForm(null)}
          onSaved={(msg) => { setForm(null); done(msg); }}/>
      )}

      {categoriesOpen && (
        <ExpenseCategoriesModal canManage={canEdit} onClose={() => setCategoriesOpen(false)}
          onChanged={() => { cats.reload(); refresh(); }}/>
      )}

      {plansOpen && (
        <ExpensePlansModal categories={ledgerKeys} categoryOptions={activeOptions} canManage={canEdit} employees={NO_EMPLOYEES}
          onClose={() => setPlansOpen(false)} onToast={onToast} onChanged={refresh}/>
      )}
    </div>
  );
}
