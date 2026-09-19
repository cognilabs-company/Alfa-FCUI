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
import { apiGetExpenses, apiCreateExpense, apiUpdateExpense, apiDeleteExpense, apiGetExpensesSummary } from '@/shared/api';
import { fmt, fmtMln, fmtMoneyRoll, fmtDate, monthShort, toLocalISO, todayISO } from '@/shared/lib/format';
import { periodDate } from '@/shared/lib/analytics';

const PAGE_SIZE = 20;
const CATEGORIES = ['rent', 'salary', 'utilities', 'equipment', 'transport', 'marketing', 'other'];
const CATEGORY_COLOR = {
  rent: 'var(--viz-click)', salary: 'var(--viz-bank)', utilities: 'var(--viz-payme)',
  equipment: 'var(--viz-cash)', transport: '#0EA5E9', marketing: '#EC4899', other: 'var(--viz-other)',
};
const TYPE_COLOR = { fixed: 'var(--viz-click)', additional: 'var(--viz-cash)' };

const emptyForm = () => ({
  name: '', amount: '', expense_type: 'fixed', category: '', comment: '',
  expense_date: todayISO(), start_date: toLocalISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  end_date: '', is_active: true,
});

/** Expenses: recurring (fixed) and one-off (additional) costs, with a period summary. */
export function ExpensesScreen({ onToast, canEdit = true }) {
  const I = Icon;
  const { t, tp, lang } = useT();

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

  React.useEffect(() => { load(); }, [page, type, category, fromDate, toDate]);
  React.useEffect(() => {
    const close = () => setOpenMenuId(null);
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

  const categoryOptions = [{ value: '', label: t('exp_all_categories') }, ...CATEGORIES.map(c => ({ value: c, label: t(`exp_cat_${c}`) }))];
  const formCategoryOptions = [{ value: '', label: t('not_selected') }, ...CATEGORIES.map(c => ({ value: c, label: t(`exp_cat_${c}`) }))];

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Coins}/>
        <div>
          <h1 className="page-title">{t('nav_expenses')}</h1>
          <div className="page-sub">{unsupported ? t('exp_sub') : `${totalCount} ${tp('exp_count_sfx', totalCount)} · ${t('exp_sub')}`}</div>
        </div>
        {canEdit && !unsupported && (
          <div className="page-actions">
            <button className="btn primary" onClick={openCreate}><I.Plus size={15}/> {t('exp_new')}</button>
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
          <div className="toolbar" style={{ marginBottom: 14 }}>
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
            <SearchableSelect value={category} onChange={(v) => { setPage(1); setCategory(v); }} options={categoryOptions}/>
            <DateInput value={fromDate} onChange={(v) => { setPage(1); setFromDate(v || fromDate); }} placeholder={t('cal_from')}/>
            <DateInput value={toDate} onChange={(v) => { setPage(1); setToDate(v || toDate); }} placeholder={t('cal_to')}/>
          </div>

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
                              <button className="icon-btn plain" aria-label="Actions" onClick={(e) => {
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
        </>
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
