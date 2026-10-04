// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { DateInput } from '@/shared/ui/date-picker';
import { SearchableSelect } from '@/shared/ui/controls';
import { Pager, menuPosition } from '@/shared/ui/pager';
import { CountUp } from '@/shared/ui/count-up';
import { Badge } from '@/shared/ui/status';
import { Columns, Donut, ChartLegend } from '@/shared/ui/charts';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import {
  apiGetExpenses, apiCreateExpense, apiUpdateExpense, apiDeleteExpense, apiGetExpensesSummary,
  apiGetRecurringExpenses, apiCreateRecurringExpense, apiUpdateRecurringExpense,
  apiDeleteRecurringExpense, apiGetRecurringOccurrences, apiCreateExpenseFromRecurring,
} from '@/shared/api';
import { fmt, fmtMln, fmtMoneyRoll, fmtDate, monthShort, toLocalISO, todayISO } from '@/shared/lib/format';
import { periodDate } from '@/shared/lib/analytics';

const PAGE_SIZE = 20;
const CATEGORIES = ['rent', 'salary', 'utilities', 'equipment', 'inventory', 'transport', 'marketing', 'other'];
const CATEGORY_COLOR = {
  rent: 'var(--viz-click)', salary: 'var(--viz-bank)', utilities: 'var(--viz-payme)',
  equipment: 'var(--viz-cash)', inventory: '#14B8A6', transport: '#0EA5E9', marketing: '#EC4899', other: 'var(--viz-other)',
};
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];
const FREQ_UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
const TYPE_COLOR = { fixed: 'var(--viz-click)', additional: 'var(--viz-cash)' };

const emptyRecurring = () => ({
  name: '', amount: '', frequency: 'monthly', interval: '1', category: '',
  start_date: todayISO(), next_due_date: todayISO(), end_date: '', comment: '', is_active: true,
});

const emptyForm = () => ({
  name: '', amount: '', expense_type: 'fixed', category: '', comment: '',
  expense_date: todayISO(), start_date: toLocalISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  end_date: '', is_active: true,
});

/** Expenses: recurring (fixed) and one-off (additional) costs, with a period summary. */
export function ExpensesScreen({ onToast, canEdit = true }) {
  const I = Icon;
  const { t, tp, lang } = useT();

  const [tab, setTab] = React.useState('list');

  const [rows, setRows] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [unsupported, setUnsupported] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // filters — the period drives both the summary and the one-off list
  const [type, setType] = React.useState('all');
  const [category, setCategory] = React.useState('');
  const [fromDate, setFromDate] = React.useState(() => toLocalISO(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1)));
  const [toDate, setToDate] = React.useState(todayISO());

  // modal
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  // row menu
  const [openMenuId, setOpenMenuId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });

  const [recRows, setRecRows] = React.useState([]);
  const [recLoading, setRecLoading] = React.useState(false);
  const [recPage, setRecPage] = React.useState(1);
  const [recTotalPages, setRecTotalPages] = React.useState(1);
  const [recTotalCount, setRecTotalCount] = React.useState(0);
  const [recModal, setRecModal] = React.useState(false);
  const [recEditing, setRecEditing] = React.useState(null);
  const [recForm, setRecForm] = React.useState(emptyRecurring);
  const [recSaving, setRecSaving] = React.useState(false);
  const [recError, setRecError] = React.useState('');
  const [recMenuId, setRecMenuId] = React.useState(null);

  const [payTarget, setPayTarget] = React.useState(null);
  const [payForm, setPayForm] = React.useState({ expense_date: todayISO(), amount: '', comment: '' });
  const [paySaving, setPaySaving] = React.useState(false);
  const [payError, setPayError] = React.useState('');

  const [occ, setOcc] = React.useState([]);
  const [occLoading, setOccLoading] = React.useState(false);

  const money = (v, axis) => (axis ? fmtMln(v, lang) : `${fmt.format(Math.round(v))} ${t('currency')}`);
  const catLabel = (c) => (c && CATEGORIES.includes(c) ? t(`exp_cat_${c}`) : (c || '—'));
  const catColor = (c) => CATEGORY_COLOR[c] || 'var(--viz-other)';

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const params = { page, page_size: PAGE_SIZE, from_date: fromDate, to_date: toDate };
      if (type !== 'all') params.expense_type = type;
      if (category) params.category = category;
      const [list, sum] = await Promise.allSettled([
        apiGetExpenses(params),
        apiGetExpensesSummary({ from_date: fromDate, to_date: toDate }),
      ]);
      if (list.status === 'rejected') {
        // an older backend has no /expenses at all
        if (list.reason?.status === 404) { setUnsupported(true); setRows([]); return; }
        throw list.reason;
      }
      setUnsupported(false);
      setRows(list.value?.data || []);
      setTotalPages(list.value?.meta?.total_pages || 1);
      setTotalCount(list.value?.meta?.total ?? (list.value?.data || []).length);
      setSummary(sum.status === 'fulfilled' ? (sum.value?.data || null) : null);
    } catch (e) {
      setRows([]);
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecurring() {
    setRecLoading(true);
    try {
      const res = await apiGetRecurringExpenses({ page: recPage, page_size: PAGE_SIZE });
      setRecRows(res?.data || []);
      setRecTotalPages(res?.meta?.total_pages || 1);
      setRecTotalCount(res?.meta?.total ?? (res?.data || []).length);
    } catch (e) {
      setRecRows([]);
      notify.error(e.message);
    } finally {
      setRecLoading(false);
    }
  }

  async function loadOccurrences() {
    setOccLoading(true);
    try {
      const res = await apiGetRecurringOccurrences({ from_date: fromDate, to_date: toDate });
      setOcc(res?.data || []);
    } catch {
      setOcc([]);
    } finally {
      setOccLoading(false);
    }
  }

  React.useEffect(() => { load(); }, [page, type, category, fromDate, toDate]);
  React.useEffect(() => { if (tab === 'recurring') loadRecurring(); }, [tab, recPage]);
  React.useEffect(() => { if (tab === 'report') loadOccurrences(); }, [tab, fromDate, toDate]);
  React.useEffect(() => {
    const close = () => { setOpenMenuId(null); setRecMenuId(null); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError('');
    setShowModal(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name || '', amount: String(row.amount ?? ''), expense_type: row.expense_type || 'fixed',
      category: row.category || '', comment: row.comment || '',
      expense_date: row.expense_date || todayISO(), start_date: row.start_date || todayISO(),
      end_date: row.end_date || '', is_active: row.is_active !== false,
    });
    setFormError('');
    setOpenMenuId(null);
    setShowModal(true);
  }

  async function save() {
    setFormError('');
    const amount = Number(form.amount);
    if (!form.name.trim()) return setFormError(t('exp_err_name'));
    if (!(amount > 0)) return setFormError(t('exp_err_amount'));
    const fixed = form.expense_type === 'fixed';
    if (fixed && !form.start_date) return setFormError(t('exp_err_date'));
    if (!fixed && !form.expense_date) return setFormError(t('exp_err_date'));
    if (fixed && form.end_date && form.end_date < form.start_date) return setFormError(t('exp_err_end'));

    const payload = {
      name: form.name.trim(),
      amount,
      expense_type: form.expense_type,
      category: form.category || null,
      comment: form.comment.trim() || null,
      ...(fixed
        ? { start_date: form.start_date, end_date: form.end_date || null, is_active: !!form.is_active, expense_date: null }
        : { expense_date: form.expense_date, start_date: null, end_date: null }),
    };
    setSaving(true);
    try {
      if (editing) await apiUpdateExpense(editing.id, payload);
      else await apiCreateExpense(payload);
      setShowModal(false);
      onToast?.(editing ? t('exp_saved') : t('exp_created'));
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openRecCreate() {
    setRecEditing(null);
    setRecForm(emptyRecurring());
    setRecError('');
    setRecModal(true);
  }

  function openRecEdit(row) {
    setRecEditing(row);
    setRecForm({
      name: row.name || '', amount: String(row.amount ?? ''), frequency: row.frequency || 'monthly',
      interval: String(row.interval ?? 1), category: row.category || '',
      start_date: row.start_date || todayISO(), next_due_date: row.next_due_date || todayISO(),
      end_date: row.end_date || '', comment: row.comment || '', is_active: row.is_active !== false,
    });
    setRecError('');
    setRecMenuId(null);
    setRecModal(true);
  }

  async function saveRecurring() {
    setRecError('');
    const amount = Number(recForm.amount);
    const interval = Number(recForm.interval);
    if (!recForm.name.trim()) return setRecError(t('exp_err_name'));
    if (!(amount > 0)) return setRecError(t('exp_err_amount'));
    if (!(interval >= 1)) return setRecError(t('exp_err_interval'));
    if (!recForm.start_date) return setRecError(t('exp_err_date'));
    if (recForm.end_date && recForm.end_date < recForm.start_date) return setRecError(t('exp_err_end'));

    const payload = {
      name: recForm.name.trim(),
      amount,
      frequency: recForm.frequency,
      interval,
      category: recForm.category || null,
      start_date: recForm.start_date,
      next_due_date: recForm.next_due_date || recForm.start_date,
      end_date: recForm.end_date || null,
      comment: recForm.comment.trim() || null,
      is_active: !!recForm.is_active,
    };
    setRecSaving(true);
    try {
      if (recEditing) await apiUpdateRecurringExpense(recEditing.id, payload);
      else await apiCreateRecurringExpense(payload);
      setRecModal(false);
      onToast?.(t('exp_rec_saved'));
      loadRecurring();
    } catch (e) {
      setRecError(e.message);
    } finally {
      setRecSaving(false);
    }
  }

  async function removeRecurring(row) {
    setRecMenuId(null);
    if (!await confirmDialog(t('exp_rec_delete_confirm').replace('{name}', row.name))) return;
    try {
      await apiDeleteRecurringExpense(row.id);
      onToast?.(t('exp_rec_deleted'));
      loadRecurring();
    } catch (e) {
      notify.error(e.message);
    }
  }

  function openPay(row, date) {
    setRecMenuId(null);
    setPayTarget(row);
    setPayForm({
      expense_date: date || row.next_due_date || todayISO(),
      amount: String(row.amount ?? ''),
      comment: '',
    });
    setPayError('');
  }

  async function savePay() {
    setPayError('');
    const amount = Number(payForm.amount);
    if (!payForm.expense_date) return setPayError(t('exp_err_date'));
    if (payForm.amount !== '' && !(amount > 0)) return setPayError(t('exp_err_amount'));
    setPaySaving(true);
    try {
      await apiCreateExpenseFromRecurring(payTarget.recurring_expense_id || payTarget.id, {
        expense_date: payForm.expense_date,
        ...(payForm.amount === '' ? {} : { amount }),
        ...(payForm.comment.trim() ? { comment: payForm.comment.trim() } : {}),
      });
      setPayTarget(null);
      onToast?.(t('exp_rec_created'));
      load();
      if (tab === 'recurring') loadRecurring();
      if (tab === 'report') loadOccurrences();
    } catch (e) {
      setPayError(e.message);
    } finally {
      setPaySaving(false);
    }
  }

  function freqLabel(row) {
    const n = Number(row.interval) || 1;
    if (n === 1) return t(`exp_freq_${row.frequency}`);
    return t('exp_freq_every').replace('{n}', String(n)).replace('{unit}', t(`exp_unit_${FREQ_UNIT[row.frequency] || 'month'}`));
  }

  async function remove(row) {
    setOpenMenuId(null);
    if (!await confirmDialog(t('exp_delete_confirm').replace('{name}', row.name))) return;
    try {
      await apiDeleteExpense(row.id);
      onToast?.(t('exp_deleted'));
      load();
    } catch (e) {
      notify.error(e.message);
    }
  }

  // ── derived for the summary banner and charts ────────────────────────────
  const total = Number(summary?.total) || 0;
  const fixedTotal = Number(summary?.fixed_total) || 0;
  const additionalTotal = Number(summary?.additional_total) || 0;
  const split = [
    { key: 'fixed', label: t('exp_fixed_total'), value: fixedTotal, color: TYPE_COLOR.fixed },
    { key: 'additional', label: t('exp_additional_total'), value: additionalTotal, color: TYPE_COLOR.additional },
  ];
  const splitSum = split.reduce((s, p) => s + p.value, 0) || 1;
  const byCategory = (summary?.by_category || []).map(c => ({
    id: c.category || 'other', label: catLabel(c.category), value: Number(c.amount) || 0, color: catColor(c.category),
  })).sort((a, b) => b.value - a.value);
  const monthly = (summary?.monthly || []).map(m => ({
    date: periodDate(m.period),
    parts: { fixed: Number(m.fixed) || 0, additional: Number(m.additional) || 0 },
  }));
  const monthSeries = split.map(s => ({ id: s.key, label: s.label, color: s.color }));

  const occTotal = occ.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

  const categoryOptions = [{ value: '', label: t('exp_all_categories') }, ...CATEGORIES.map(c => ({ value: c, label: t(`exp_cat_${c}`) }))];
  const formCategoryOptions = [{ value: '', label: t('not_selected') }, ...CATEGORIES.map(c => ({ value: c, label: t(`exp_cat_${c}`) }))];

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Coins}/>
        <div>
          <h1 className="page-title">{t('nav_expenses')}</h1>
          <div className="page-sub">
            {unsupported
              ? t('exp_sub')
              : tab === 'recurring'
                ? `${recTotalCount} ${tp('exp_rec_count_sfx', recTotalCount)} · ${t('exp_rec_sub')}`
                : `${totalCount} ${tp('exp_count_sfx', totalCount)} · ${t('exp_sub')}`}
          </div>
        </div>
        {canEdit && !unsupported && (
          <div className="page-actions">
            <button className="btn primary" onClick={tab === 'recurring' ? openRecCreate : openCreate}>
              <I.Plus size={15}/> {tab === 'recurring' ? t('exp_rec_new') : t('exp_new')}
            </button>
          </div>
        )}
      </div>

      {unsupported && (
        <div className="card empty" style={{ padding: 48, display: 'grid', gap: 10, placeItems: 'center' }}>
          <I.Wrench size={28} color="var(--muted)"/>
          <div style={{ fontWeight: 700 }}>{t('exp_unsupported')}</div>
        </div>
      )}

      {!unsupported && (
        <>
          <div className="tabs" style={{ marginBottom: 14 }}>
            {[
              { id: 'list', label: t('exp_tab_list') },
              { id: 'recurring', label: t('exp_tab_recurring') },
              { id: 'report', label: t('exp_tab_report') },
            ].map(tb => (
              <button key={tb.id} type="button" className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>{tb.label}</button>
            ))}
          </div>

          {tab !== 'recurring' && (
          <div className="toolbar" style={{ marginBottom: 14 }}>
            {tab === 'list' && (
              <div className="seg">
                {[
                  { key: 'all', label: t('all'), icon: I.Stack },
                  { key: 'fixed', label: t('exp_type_fixed'), icon: I.Repeat },
                  { key: 'additional', label: t('exp_type_additional'), icon: I.Receipt },
                ].map(tb => (
                  <button key={tb.key} type="button" className={type === tb.key ? 'active' : ''}
                    onClick={() => { setPage(1); setType(tb.key); }}>
                    <tb.icon size={14}/> {tb.label}
                  </button>
                ))}
              </div>
            )}
            {tab === 'list' && <SearchableSelect value={category} onChange={(v) => { setPage(1); setCategory(v); }} options={categoryOptions}/>}
            <DateInput value={fromDate} onChange={(v) => { setPage(1); setFromDate(v || fromDate); }} placeholder={t('cal_from')}/>
            <DateInput value={toDate} onChange={(v) => { setPage(1); setToDate(v || toDate); }} placeholder={t('cal_to')}/>
          </div>
          )}

          {tab === 'list' && (<>
          {loadError && <div className="alert danger" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{loadError}</span></div>}

          <div className={'table-wrap' + (loading ? ' is-loading' : '')}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('exp_name')}</th>
                    <th>{t('exp_type')}</th>
                    <th>{t('exp_category')}</th>
                    <th>{t('exp_period')}</th>
                    <th style={{ textAlign: 'right' }}>{t('exp_amount')}</th>
                    <th style={{ width: 48 }}/>
                  </tr>
                </thead>
                <tbody>
                  {!loading && rows.length === 0 && (
                    <tr className="static"><td colSpan={6} className="empty-cell">{t('exp_empty')}</td></tr>
                  )}
                  {rows.map((r) => {
                    const fixed = r.expense_type === 'fixed';
                    return (
                      <tr key={r.id} className="static" onClick={() => canEdit && openEdit(r)} style={canEdit ? { cursor: 'pointer' } : undefined}>
                        <td>
                          <div style={{ fontWeight: 800 }}>{r.name}</div>
                          {r.comment && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.comment}</div>}
                        </td>
                        <td>
                          {fixed
                            ? <Badge tone={r.is_active === false ? 'neutral' : 'info'} icon={I.Repeat}>{t('exp_type_fixed')}{r.is_active === false ? ` · ${t('exp_inactive')}` : ''}</Badge>
                            : <Badge tone="warning" icon={I.Receipt}>{t('exp_type_additional')}</Badge>}
                        </td>
                        <td>
                          <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <i style={{ width: 8, height: 8, borderRadius: 3, background: catColor(r.category) }}/>{catLabel(r.category)}
                          </span>
                        </td>
                        <td className="num" style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {fixed
                            ? <>{fmtDate(r.start_date)} <span style={{ color: 'var(--muted)' }}>→</span> {r.end_date ? fmtDate(r.end_date) : t('exp_ongoing')}</>
                            : fmtDate(r.expense_date)}
                        </td>
                        <td className="money" style={{ textAlign: 'right' }}>
                          {fmt.format(r.amount || 0)} {t('currency')}
                          {fixed && <small style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>/ {t('contract_months_sfx')}</small>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {canEdit && (
                            <>
                              <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => {
                                e.stopPropagation();
                                if (openMenuId === r.id) setOpenMenuId(null);
                                else { setMenuPos(menuPosition(e.currentTarget, 2)); setOpenMenuId(r.id); }
                              }}><I.More size={16}/></button>
                              {openMenuId === r.id && (
                                <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                                  <button className="menu-item" onClick={() => openEdit(r)}><I.Edit size={14}/> {t('edit')}</button>
                                  <button className="menu-item danger" onClick={() => remove(r)}><I.Trash2 size={14}/> {t('delete')}</button>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} onPage={setPage} total={totalCount} pageSize={PAGE_SIZE}/>
          </div>
          </>)}

          {tab === 'recurring' && (<>
          <div className={'table-wrap' + (recLoading ? ' is-loading' : '')}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('exp_name')}</th>
                    <th>{t('exp_rec_freq')}</th>
                    <th>{t('exp_category')}</th>
                    <th>{t('exp_rec_next')}</th>
                    <th>{t('exp_period')}</th>
                    <th style={{ textAlign: 'right' }}>{t('exp_amount')}</th>
                    <th style={{ width: 160 }}/>
                  </tr>
                </thead>
                <tbody>
                  {!recLoading && recRows.length === 0 && (
                    <tr className="static"><td colSpan={7} className="empty-cell">{t('exp_rec_empty')}</td></tr>
                  )}
                  {recRows.map((r) => (
                    <tr key={r.id} className="static" onClick={() => canEdit && openRecEdit(r)} style={canEdit ? { cursor: 'pointer' } : undefined}>
                      <td>
                        <div style={{ fontWeight: 800 }}>{r.name}</div>
                        {r.comment && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.comment}</div>}
                      </td>
                      <td>
                        <Badge tone={r.is_active === false ? 'neutral' : 'info'} icon={I.Repeat}>
                          {freqLabel(r)}{r.is_active === false ? ` · ${t('exp_inactive')}` : ''}
                        </Badge>
                      </td>
                      <td>
                        <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <i style={{ width: 8, height: 8, borderRadius: 3, background: catColor(r.category) }}/>{catLabel(r.category)}
                        </span>
                      </td>
                      <td className="num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.next_due_date ? fmtDate(r.next_due_date) : '—'}</td>
                      <td className="num" style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.start_date)} <span style={{ color: 'var(--muted)' }}>→</span> {r.end_date ? fmtDate(r.end_date) : t('exp_ongoing')}
                      </td>
                      <td className="money" style={{ textAlign: 'right' }}>{fmt.format(r.amount || 0)} {t('currency')}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn sm soft" onClick={() => openPay(r)}>
                              <I.Plus size={13}/> {t('exp_rec_create_expense')}
                            </button>
                            <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => {
                              e.stopPropagation();
                              if (recMenuId === r.id) setRecMenuId(null);
                              else { setMenuPos(menuPosition(e.currentTarget, 2)); setRecMenuId(r.id); }
                            }}><I.More size={16}/></button>
                            {recMenuId === r.id && (
                              <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                                <button className="menu-item" onClick={() => openRecEdit(r)}><I.Edit size={14}/> {t('edit')}</button>
                                <button className="menu-item danger" onClick={() => removeRecurring(r)}><I.Trash2 size={14}/> {t('delete')}</button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={recPage} totalPages={recTotalPages} onPage={setRecPage} total={recTotalCount} pageSize={PAGE_SIZE}/>
          </div>
          </>)}

          {tab === 'report' && (<>
          {summary && (
            <section className="summary-card">
              <div>
                <div className="s-label"><I.Coins size={15}/> {t('exp_total')}</div>
                <div className="s-big"><CountUp value={total} format={fmtMoneyRoll} duration={1800}/></div>
                <div className="s-note">{fmt.format(total)} {t('currency')} · {fmtDate(fromDate)} — {fmtDate(toDate)}</div>
              </div>
              <div className="dist">
                <div className="dist-bar">
                  {split.filter(p => p.value > 0).map((p, i) => (
                    <i key={p.key} style={{ flex: p.value / splitSum, background: p.color, animationDelay: `${250 + i * 140}ms` }} title={`${p.label}: ${fmt.format(p.value)}`}/>
                  ))}
                </div>
                <div className="dist-legend">
                  {split.map((p) => (
                    <div key={p.key}>
                      <i style={{ background: p.color }}/>
                      <span>{p.label}</span>
                      <b><CountUp value={p.value} format={fmtMoneyRoll} duration={1400}/></b>
                      <em>{Math.round((p.value / splitSum) * 100)}%</em>
                    </div>
                  ))}
                </div>
              </div>
              <div className="s-side">
                <div className="s-label"><I.Stack size={15}/> {t('exp_by_category')}</div>
                <div className="s-mid">{byCategory.length}</div>
                <div className="s-note">{byCategory.slice(0, 3).map(c => c.label).join(' · ') || '—'}</div>
              </div>
            </section>
          )}

          {summary && total > 0 && (
            <div className="chart-grid-2" style={{ marginBottom: 14 }}>
              <div className="chart-card">
                <div className="chart-card-head">
                  <div>
                    <div className="ch-title">{t('exp_monthly')}</div>
                    <div className="ch-sub">{t('exp_monthly_sub')}</div>
                  </div>
                  <div className="ch-right"><ChartLegend items={monthSeries} inline/></div>
                </div>
                <Columns
                  data={monthly.map(m => ({ label: monthShort(m.date.getMonth(), lang), full: `${monthShort(m.date.getMonth(), lang)} ${m.date.getFullYear()}`, parts: m.parts }))}
                  series={monthSeries} format={money} height={200}/>
              </div>
              <div className="chart-card">
                <div className="chart-card-head">
                  <div>
                    <div className="ch-title">{t('exp_by_category')}</div>
                    <div className="ch-sub">{fmtDate(fromDate)} — {fmtDate(toDate)}</div>
                  </div>
                </div>
                <Donut items={byCategory} format={money} centerValue={fmtMln(total, lang)} centerLabel={t('total')}/>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">
              <div>
                <div className="card-title">{t('exp_occ_title')}</div>
                <div className="card-sub">{t('exp_occ_sub')}</div>
              </div>
              <div className="chip">{fmt.format(occTotal)} {t('currency')}</div>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('exp_name')}</th>
                    <th>{t('exp_category')}</th>
                    <th>{t('exp_occ_due')}</th>
                    <th style={{ textAlign: 'right' }}>{t('exp_amount')}</th>
                    <th style={{ width: 150 }}/>
                  </tr>
                </thead>
                <tbody>
                  {occLoading && <tr className="static"><td colSpan={5} className="empty-cell">{t('loading')}</td></tr>}
                  {!occLoading && occ.length === 0 && <tr className="static"><td colSpan={5} className="empty-cell">{t('exp_occ_empty')}</td></tr>}
                  {occ.map((o, i) => (
                    <tr key={`${o.recurring_expense_id}-${o.due_date}-${i}`} className="static">
                      <td style={{ fontWeight: 800 }}>{o.name}</td>
                      <td>
                        <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <i style={{ width: 8, height: 8, borderRadius: 3, background: catColor(o.category) }}/>{catLabel(o.category)}
                        </span>
                      </td>
                      <td className="num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(o.due_date)}</td>
                      <td className="money" style={{ textAlign: 'right' }}>{fmt.format(o.amount || 0)} {t('currency')}</td>
                      <td>
                        {canEdit && (
                          <button className="btn sm soft" onClick={() => openPay(o, o.due_date)}>
                            <I.Check size={13}/> {t('exp_occ_pay')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>)}
        </>
      )}

      {recModal && (
        <Modal icon={I.Repeat} size="md"
          onClose={() => setRecModal(false)}
          title={recEditing ? t('exp_rec_edit') : t('exp_rec_new')}
          subtitle={t('exp_rec_sub')}
          footer={(
            <>
              <button className="btn ghost" onClick={() => setRecModal(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveRecurring} disabled={recSaving}><I.Check size={14}/> {recSaving ? t('saving') : t('save')}</button>
            </>
          )}>
          <div className="form-row">
            <div className="field col-span-2"><label>{t('exp_name')} <span className="req">*</span></label>
              <input value={recForm.name} onChange={e => setRecForm(p => ({ ...p, name: e.target.value }))} autoFocus/>
            </div>
            <div className="field"><label>{t('exp_amount')} ({t('currency')}) <span className="req">*</span></label>
              <input type="number" min="1" value={recForm.amount} onChange={e => setRecForm(p => ({ ...p, amount: e.target.value }))} placeholder="8000000"/>
            </div>
            <div className="field"><label>{t('exp_category')}</label>
              <SearchableSelect value={recForm.category} onChange={v => setRecForm(p => ({ ...p, category: v }))} options={formCategoryOptions}/>
            </div>
            <div className="field"><label>{t('exp_rec_freq')} <span className="req">*</span></label>
              <SearchableSelect value={recForm.frequency} onChange={v => setRecForm(p => ({ ...p, frequency: v }))}
                options={FREQUENCIES.map(f => ({ value: f, label: t(`exp_freq_${f}`) }))}/>
            </div>
            <div className="field"><label>{t('exp_rec_interval')} <span className="req">*</span></label>
              <input type="number" min="1" value={recForm.interval} onChange={e => setRecForm(p => ({ ...p, interval: e.target.value }))}/>
            </div>
            <div className="field"><label>{t('exp_start')} <span className="req">*</span></label>
              <DateInput value={recForm.start_date} onChange={v => setRecForm(p => ({ ...p, start_date: v, next_due_date: p.next_due_date && p.next_due_date >= v ? p.next_due_date : v }))}/>
            </div>
            <div className="field"><label>{t('exp_rec_next')}</label>
              <DateInput value={recForm.next_due_date} onChange={v => setRecForm(p => ({ ...p, next_due_date: v }))}/>
            </div>
            <div className="field col-span-2"><label>{t('exp_end')}</label>
              <DateInput value={recForm.end_date} onChange={v => setRecForm(p => ({ ...p, end_date: v }))} placeholder={t('exp_ongoing')}/>
            </div>
            <div className="col-span-2">
              <div className={'opt-card' + (recForm.is_active ? ' on' : '')}>
                <label className="switch">
                  <input type="checkbox" checked={!!recForm.is_active} onChange={e => setRecForm(p => ({ ...p, is_active: e.target.checked }))}/>
                  <i/>
                </label>
                <div className="opt-text">
                  <div className="opt-title">{recForm.is_active ? t('exp_active') : t('exp_inactive')}</div>
                  <div className="opt-desc">{t('exp_active_hint')}</div>
                </div>
              </div>
            </div>
            <div className="field col-span-2"><label>{t('field_comment')}</label>
              <textarea rows={2} value={recForm.comment} onChange={e => setRecForm(p => ({ ...p, comment: e.target.value }))}/>
            </div>
          </div>
          {recError && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{recError}</span></div>}
        </Modal>
      )}

      {payTarget && (
        <Modal icon={I.Coins} size="sm"
          onClose={() => setPayTarget(null)}
          title={t('exp_rec_create_title')}
          subtitle={payTarget.name}
          footer={(
            <>
              <button className="btn ghost" onClick={() => setPayTarget(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={savePay} disabled={paySaving}><I.Check size={14}/> {paySaving ? t('saving') : t('save')}</button>
            </>
          )}>
          <div className="form-row">
            <div className="field col-span-2"><label>{t('exp_date')} <span className="req">*</span></label>
              <DateInput value={payForm.expense_date} onChange={v => setPayForm(p => ({ ...p, expense_date: v }))}/>
            </div>
            <div className="field col-span-2"><label>{t('exp_amount')} ({t('currency')})</label>
              <input type="number" min="1" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder={String(payTarget.amount ?? '')}/>
            </div>
            <div className="field col-span-2"><label>{t('field_comment')}</label>
              <textarea rows={2} value={payForm.comment} onChange={e => setPayForm(p => ({ ...p, comment: e.target.value }))}/>
            </div>
          </div>
          {payError && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{payError}</span></div>}
        </Modal>
      )}

      {showModal && (
        <Modal icon={I.Coins} size="md"
          onClose={() => setShowModal(false)}
          title={editing ? t('exp_edit') : t('exp_new')}
          footer={(
            <>
              <button className="btn ghost" onClick={() => setShowModal(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={save} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
            </>
          )}>
          <div className="type-choice">
            {[
              { key: 'fixed', label: t('exp_type_fixed'), hint: t('exp_type_fixed_hint'), icon: I.Repeat },
              { key: 'additional', label: t('exp_type_additional'), hint: t('exp_type_additional_hint'), icon: I.Receipt },
            ].map(opt => (
              <button key={opt.key} type="button" className={'type-opt' + (form.expense_type === opt.key ? ' on' : '')}
                onClick={() => setForm(p => ({ ...p, expense_type: opt.key }))}>
                <opt.icon size={18}/>
                <span><b>{opt.label}</b><small>{opt.hint}</small></span>
              </button>
            ))}
          </div>
          <div className="form-row" style={{ marginTop: 14 }}>
            <div className="field col-span-2"><label>{t('exp_name')} <span className="req">*</span></label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus/>
            </div>
            <div className="field"><label>{form.expense_type === 'fixed' ? t('exp_amount_monthly') : t('exp_amount')} ({t('currency')}) <span className="req">*</span></label>
              <input type="number" min="1" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="1000000"/>
            </div>
            <div className="field"><label>{t('exp_category')}</label>
              <SearchableSelect value={form.category} onChange={v => setForm(p => ({ ...p, category: v }))} options={formCategoryOptions}/>
            </div>
            {form.expense_type === 'fixed' ? (
              <>
                <div className="field"><label>{t('exp_start')} <span className="req">*</span></label>
                  <DateInput value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))}/>
                </div>
                <div className="field"><label>{t('exp_end')}</label>
                  <DateInput value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} placeholder={t('exp_ongoing')}/>
                </div>
                <div className="col-span-2">
                  <div className={'opt-card' + (form.is_active ? ' on' : '')}>
                    <label className="switch">
                      <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}/>
                      <i/>
                    </label>
                    <div className="opt-text">
                      <div className="opt-title">{form.is_active ? t('exp_active') : t('exp_inactive')}</div>
                      <div className="opt-desc">{t('exp_active_hint')}</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="field"><label>{t('exp_date')} <span className="req">*</span></label>
                <DateInput value={form.expense_date} onChange={v => setForm(p => ({ ...p, expense_date: v }))}/>
              </div>
            )}
            <div className="field col-span-2"><label>{t('field_comment')}</label>
              <textarea rows={2} value={form.comment} onChange={e => setForm(p => ({ ...p, comment: e.target.value }))}/>
            </div>
          </div>
          {formError && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{formError}</span></div>}
        </Modal>
      )}
    </div>
  );
}
