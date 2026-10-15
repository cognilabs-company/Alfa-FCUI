// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { SearchableSelect } from '@/shared/ui/controls';
import { Pager, menuPosition } from '@/shared/ui/pager';
import { PageIcon } from '@/shared/ui/page-head';
import { Badge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import {
  apiGetPayrollEmployees, apiGetPayrollProfiles, apiGetPayrollSummary, apiGetPayrollPayments, apiGetPayrollAdjustments,
  apiDeletePayrollPayment, apiDeletePayrollAdjustment, apiClosePayrollMonth, apiReopenPayrollMonth,
} from '@/shared/api';
import { avatarColor } from '@/shared/lib/avatar';
import { fmt, fmtDate, monthLabel, toLocalISO } from '@/shared/lib/format';
import { ExpenseStatusBadge, ExpenseTotals, PeriodNav, useMoney, usePeriod } from '@/widgets/expenses';
import { PayrollPayDialog, AdjustmentDialog, ProfileDialog } from './dialogs';

const PAGE_SIZE = 20;
const num = (v) => Number(v) || 0;

function rangeOf(period) {
  const from = period.wholeYear ? new Date(period.year, 0, 1) : new Date(period.year, period.month - 1, 1);
  const to = period.wholeYear ? new Date(period.year, 11, 31) : new Date(period.year, period.month, 0);
  return { from_date: toLocalISO(from), to_date: toLocalISO(to) };
}

/** Every employee, with or without a rate — the pickers need them all, the tables need their names. */
async function loadAllEmployees() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const res = await apiGetPayrollEmployees({ include_without_profile: true, page, page_size: 100 });
    const rows = res?.data || [];
    out.push(...rows);
    if (page >= (num(res?.meta?.total_pages) || 1) || rows.length === 0) break;
  }
  return out;
}

function Initials({ id, name }) {
  return (
    <div className="avatar" style={{ background: avatarColor(num(id)) }}>
      {String(name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('')}
    </div>
  );
}

function RowMenu({ items }) {
  const I = Icon;
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => { setPos(menuPosition(e.currentTarget, items.length)); setOpen(o => !o); }}>
        <I.More size={16}/>
      </button>
      {open && (
        <div className="menu" style={{ position: 'fixed', top: pos.y, left: pos.x }}>
          {items.map(it => (
            <button key={it.label} className={'menu-item' + (it.danger ? ' danger' : '')} onClick={() => { setOpen(false); it.action(); }}>
              <it.icon size={14}/> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Oyliklar (FRONTEND_FINANCE_API.md §3): salaries live in /payroll/* — a rate
 * per employee, what they earned in the period (rate, plus bonuses, minus
 * penalties), what was paid against it and what is left, and closing a month.
 */
export function PayrollScreen({ onToast, canManage = true }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const money = useMoney();
  const period = usePeriod();
  const range = rangeOf(period);

  const [tab, setTab] = React.useState('summary');
  const [employees, setEmployees] = React.useState([]);
  const [profiles, setProfiles] = React.useState([]);
  const [summary, setSummary] = React.useState(null);
  const [list, setList] = React.useState({ rows: [], total: 0, pages: 1 });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [unsupported, setUnsupported] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [userFilter, setUserFilter] = React.useState('');
  const [adjType, setAdjType] = React.useState('');
  const [status, setStatus] = React.useState('all');

  const [payFor, setPayFor] = React.useState(null);      // { item } | { payment } | {}
  const [adjFor, setAdjFor] = React.useState(null);      // { adjustment } | { userId } | {}
  const [rateFor, setRateFor] = React.useState(null);    // { userId } | {}
  const [closing, setClosing] = React.useState(false);

  const refresh = () => setReloadKey(k => k + 1);
  const done = (msg) => { setPayFor(null); setAdjFor(null); setRateFor(null); if (msg) onToast?.(msg); refresh(); };

  // names and rates — shared by every tab
  React.useEffect(() => {
    let alive = true;
    loadAllEmployees().then(rows => alive && setEmployees(rows)).catch(() => {});
    apiGetPayrollProfiles({ page_size: 200 }).then(res => alive && setProfiles(res?.data || [])).catch(() => {});
    return () => { alive = false; };
  }, [reloadKey]);

  React.useEffect(() => { setPage(1); }, [tab, period.year, period.month, period.wholeYear, userFilter, adjType]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const fail = (e) => {
      if (!alive) return;
      if (e.status === 404) setUnsupported(true);
      else setError(e.message);
    };
    const userId = userFilter || undefined;
    let req;
    if (tab === 'summary') {
      req = apiGetPayrollSummary({ ...range, include_inactive_profiles: false })
        .then(res => { if (alive) { setSummary(res?.data || null); setUnsupported(false); } });
    } else if (tab === 'payments') {
      req = apiGetPayrollPayments({ ...range, user_id: userId, page, page_size: PAGE_SIZE })
        .then(res => alive && setList({ rows: res?.data || [], total: num(res?.meta?.total), pages: num(res?.meta?.total_pages) || 1 }));
    } else if (tab === 'adjustments') {
      req = apiGetPayrollAdjustments({ ...range, user_id: userId, adjustment_type: adjType || undefined, page, page_size: PAGE_SIZE })
        .then(res => alive && setList({ rows: res?.data || [], total: num(res?.meta?.total), pages: num(res?.meta?.total_pages) || 1 }));
    } else {
      req = apiGetPayrollProfiles({ page, page_size: PAGE_SIZE })
        .then(res => alive && setList({ rows: res?.data || [], total: num(res?.meta?.total), pages: num(res?.meta?.total_pages) || 1 }));
    }
    req.catch(fail).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [tab, range.from_date, range.to_date, page, userFilter, adjType, reloadKey]);

  const nameMap = React.useMemo(() => {
    const m = new Map();
    employees.forEach(e => m.set(Number(e.id), e.full_name));
    (summary?.items || []).forEach(i => { if (!m.has(Number(i.user_id))) m.set(Number(i.user_id), i.user_full_name); });
    return m;
  }, [employees, summary]);
  const nameOf = (id) => nameMap.get(Number(id)) || (id != null ? `#${id}` : '—');

  const totals = summary?.totals || {};
  const items = summary?.items || [];
  const itemStatus = (it) => (it.is_closed ? 'closed' : num(it.remaining_amount) <= 0 ? 'paid' : num(it.paid_amount) > 0 ? 'partial' : 'unpaid');
  const shown = status === 'all' ? items : items.filter(it => itemStatus(it) === status);
  const caption = period.wholeYear ? String(period.year) : `${monthLabel(period.month - 1, lang)} ${period.year}`;
  const monthMode = !period.wholeYear;

  async function closeMonth() {
    if (!await confirmDialog(t('py_close_confirm').replace('{period}', caption), { title: t('py_close'), tone: 'primary', icon: I.Lock, confirmText: t('py_close') })) return;
    setClosing(true);
    try {
      await apiClosePayrollMonth({ user_ids: [], year: period.year, month: period.month, note: null });
      done(t('py_closed_toast').replace('{period}', caption));
    } catch (e) { notify.error(e.message); } finally { setClosing(false); }
  }

  async function reopenMonth() {
    if (!await confirmDialog(t('py_reopen_confirm').replace('{period}', caption), { title: t('py_reopen'), tone: 'primary', icon: I.Key, confirmText: t('py_reopen') })) return;
    setClosing(true);
    try {
      await apiReopenPayrollMonth(period.year, period.month);
      done(t('py_reopened_toast').replace('{period}', caption));
    } catch (e) { notify.error(e.message); } finally { setClosing(false); }
  }

  async function removePayment(p) {
    if (!await confirmDialog(t('py_payment_delete_confirm').replace('{amount}', money(p.amount)).replace('{name}', nameOf(p.user_id)))) return;
    try { await apiDeletePayrollPayment(p.id); done(t('py_payment_deleted')); } catch (e) { notify.error(e.message); }
  }

  async function removeAdjustment(a) {
    if (!await confirmDialog(t('py_adj_delete_confirm').replace('{name}', nameOf(a.user_id)))) return;
    try { await apiDeletePayrollAdjustment(a.id); done(t('py_adj_deleted')); } catch (e) { notify.error(e.message); }
  }

  if (unsupported) {
    return (
      <div>
        <div className="page-head">
          <PageIcon icon={I.HandCoins}/>
          <div><h1 className="page-title">{t('nav_payroll')}</h1><div className="page-sub">{t('py_sub')}</div></div>
        </div>
        <div className="card empty" style={{ padding: 48, display: 'grid', gap: 10, placeItems: 'center' }}>
          <I.Wrench size={28} color="var(--muted)"/>
          <div style={{ fontWeight: 700 }}>{t('ps_unsupported')}</div>
        </div>
      </div>
    );
  }

  const employeeOptions = [{ value: '', label: t('pr_all_employees') }, ...employees.map(e => ({ value: String(e.id), label: e.full_name || `#${e.id}` }))];
  const tabs = [
    { id: 'summary', label: t('py_tab_summary'), icon: I.Stack },
    { id: 'payments', label: t('py_tab_payments'), icon: I.HandCoins },
    { id: 'adjustments', label: t('py_tab_adjustments'), icon: I.PlusCircle },
    { id: 'profiles', label: t('py_tab_rates'), icon: I.Coins },
  ];

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.HandCoins}/>
        <div>
          <h1 className="page-title">{t('nav_payroll')}</h1>
          <div className="page-sub">{tab === 'summary' && summary ? `${num(totals.employees_count)} ${tp('py_employees_sfx', num(totals.employees_count))} · ${t('py_sub')}` : t('py_sub')}</div>
        </div>
        {canManage && (
          <div className="page-actions">
            {monthMode && tab === 'summary' && num(totals.closed_employees_count) > 0 && (
              <button className="btn" onClick={reopenMonth} disabled={closing}><I.Key size={15}/> {t('py_reopen')}</button>
            )}
            {monthMode && tab === 'summary' && num(totals.open_employees_count) > 0 && (
              <button className="btn" onClick={closeMonth} disabled={closing}><I.Lock size={15}/> {t('py_close')}</button>
            )}
            {tab === 'adjustments' && <button className="btn primary" onClick={() => setAdjFor({})}><I.Plus size={15}/> {t('py_adj_title')}</button>}
            {tab === 'profiles' && <button className="btn primary" onClick={() => setRateFor({})}><I.Plus size={15}/> {t('py_rate_title')}</button>}
            {(tab === 'summary' || tab === 'payments') && <button className="btn primary" onClick={() => setPayFor({})}><I.Plus size={15}/> {t('py_pay_title')}</button>}
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map(tb => (
          <button key={tb.id} type="button" className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>
            <tb.icon size={14}/> {tb.label}
          </button>
        ))}
      </div>

      {tab !== 'profiles' && (
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <PeriodNav period={period}/>
          {(tab === 'payments' || tab === 'adjustments') && <SearchableSelect value={userFilter} onChange={setUserFilter} options={employeeOptions}/>}
          {tab === 'adjustments' && (
            <div className="seg">
              {[['', t('all')], ['bonus', t('py_type_bonus')], ['penalty', t('py_type_penalty')]].map(([k, l]) => (
                <button key={k || 'all'} type="button" className={adjType === k ? 'active' : ''} onClick={() => setAdjType(k)}>{l}</button>
              ))}
            </div>
          )}
          {loading && <span className="toolbar-meta">{t('loading')}</span>}
        </div>
      )}

      {error && <div className="alert danger" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}

      {tab === 'summary' && (
        <>
          <ExpenseTotals
            payable={num(totals.total_earned_amount)}
            paid={num(totals.total_paid_amount)}
            unpaid={num(totals.total_remaining_amount)}
            total={num(totals.employees_count)}
            countKey="py_employees_sfx"
            unpaidCount={items.filter(it => num(it.remaining_amount) > 0).length}
            loading={loading && !summary}
            caption={caption}/>

          {summary && (num(totals.total_bonus_amount) > 0 || num(totals.total_penalty_amount) > 0 || num(totals.closed_employees_count) > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="chip">{t('py_base')}: {money(totals.total_base_amount)}</span>
              {num(totals.total_bonus_amount) > 0 && <span className="chip success">+ {t('py_type_bonus')}: {money(totals.total_bonus_amount)}</span>}
              {num(totals.total_penalty_amount) > 0 && <span className="chip danger">− {t('py_type_penalty')}: {money(totals.total_penalty_amount)}</span>}
              {num(totals.closed_employees_count) > 0 && <span className="chip"><I.Lock size={12}/> {t('py_closed_count').replace('{n}', String(num(totals.closed_employees_count)))}</span>}
            </div>
          )}

          <div className="seg" style={{ marginBottom: 12 }}>
            {[['all', t('all'), I.Stack], ['unpaid', t('exp_status_unpaid'), I.AlertCircle], ['partial', t('exp_status_partial'), I.Hourglass], ['paid', t('exp_status_paid'), I.CheckCircle], ['closed', t('py_closed'), I.Lock]].map(([k, l, Ic]) => (
              <button key={k} type="button" className={status === k ? 'active' : ''} onClick={() => setStatus(k)}><Ic size={14}/> {l}</button>
            ))}
          </div>

          <div className="table-wrap">
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('lg_employee')}</th>
                    <th>{t('py_rate')}</th>
                    <th style={{ textAlign: 'right' }}>{t('pf_pay_earned')}</th>
                    <th style={{ textAlign: 'right' }}>{t('pf_pay_paid')}</th>
                    <th style={{ textAlign: 'right' }}>{t('pf_pay_remaining')}</th>
                    <th>{t('students_col_status')}</th>
                    {canManage && <th/>}
                  </tr>
                </thead>
                <tbody>
                  {loading && !summary && <tr className="static"><td colSpan={7} className="empty-cell">{t('loading')}</td></tr>}
                  {summary && shown.length === 0 && <tr className="static"><td colSpan={7} className="empty-cell">{t(items.length ? 'py_filter_empty' : 'py_empty')}</td></tr>}
                  {shown.map(it => {
                    const st = itemStatus(it);
                    const payable = canManage && !it.is_closed && num(it.remaining_amount) > 0;
                    return (
                      <tr key={it.user_id} className={payable ? '' : 'static'} onClick={payable ? () => setPayFor({ item: it }) : undefined}>
                        <td>
                          <div className="row-name">
                            <Initials id={it.user_id} name={it.user_full_name}/>
                            <div className="meta">
                              <span className="name">{it.user_full_name || nameOf(it.user_id)}</span>
                              {(num(it.bonus_amount) > 0 || num(it.penalty_amount) > 0) && (
                                <span className="sub">
                                  {num(it.bonus_amount) > 0 && <span style={{ color: 'var(--success)' }}>+{fmt.format(Math.round(num(it.bonus_amount)))}</span>}
                                  {num(it.bonus_amount) > 0 && num(it.penalty_amount) > 0 && ' · '}
                                  {num(it.penalty_amount) > 0 && <span style={{ color: 'var(--danger)' }}>−{fmt.format(Math.round(num(it.penalty_amount)))}</span>}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          <div style={{ fontWeight: 750 }}>{fmt.format(Math.round(num(it.salary_amount)))} {t('currency')}</div>
                          <div style={{ color: 'var(--muted)', fontWeight: 600 }}>
                            {t(it.salary_type === 'daily' ? 'py_per_day' : 'py_per_month')}
                            {it.salary_type === 'daily' && it.workdays != null ? ` · ${it.workdays} ${t('py_days')}` : ''}
                          </div>
                        </td>
                        <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(it.earned_amount)))}</td>
                        <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.format(Math.round(num(it.paid_amount)))}</td>
                        <td className="money" style={{ textAlign: 'right', color: num(it.remaining_amount) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt.format(Math.round(num(it.remaining_amount)))}</td>
                        <td>{st === 'closed' ? <Badge tone="neutral" icon={I.Lock}>{t('py_closed')}</Badge> : <ExpenseStatusBadge status={st}/>}</td>
                        {canManage && (
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                              {payable && <button className="btn sm primary" onClick={() => setPayFor({ item: it })}><I.HandCoins size={13}/> {t('py_pay')}</button>}
                              <RowMenu items={[
                                { icon: I.PlusCircle, label: t('py_adj_title'), action: () => setAdjFor({ userId: it.user_id }) },
                                { icon: I.Coins, label: t('py_rate_edit'), action: () => setRateFor({ userId: it.user_id }) },
                                { icon: I.Receipt, label: t('py_tab_payments'), action: () => { setUserFilter(String(it.user_id)); setTab('payments'); } },
                              ]}/>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'payments' && (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('exp_paid_at')}</th>
                  <th>{t('lg_employee')}</th>
                  <th style={{ textAlign: 'right' }}>{t('exp_amount')}</th>
                  <th>{t('exp_note')}</th>
                  {canManage && <th/>}
                </tr>
              </thead>
              <tbody>
                {!loading && list.rows.length === 0 && <tr className="static"><td colSpan={5} className="empty-cell">{t('py_payments_empty')}</td></tr>}
                {list.rows.map(p => (
                  <tr key={p.id} className="static">
                    <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 700 }}>{fmtDate(p.payment_date)}</td>
                    <td><div className="row-name"><Initials id={p.user_id} name={p.user_full_name || nameOf(p.user_id)}/><div className="meta"><span className="name">{p.user_full_name || nameOf(p.user_id)}</span></div></div></td>
                    <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.format(Math.round(num(p.amount)))}</td>
                    <td className="cell-note" title={p.note || ''}>{p.note || '—'}</td>
                    {canManage && (
                      <td>
                        <RowMenu items={[
                          { icon: I.Edit, label: t('edit'), action: () => setPayFor({ payment: p }) },
                          { icon: I.Trash2, label: t('delete'), danger: true, action: () => removePayment(p) },
                        ]}/>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={list.pages} total={list.total} pageSize={PAGE_SIZE} onPage={setPage}/>
        </div>
      )}

      {tab === 'adjustments' && (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('py_date')}</th>
                  <th>{t('lg_employee')}</th>
                  <th>{t('py_type')}</th>
                  <th style={{ textAlign: 'right' }}>{t('exp_amount')}</th>
                  <th>{t('exp_note')}</th>
                  {canManage && <th/>}
                </tr>
              </thead>
              <tbody>
                {!loading && list.rows.length === 0 && <tr className="static"><td colSpan={6} className="empty-cell">{t('py_adj_empty')}</td></tr>}
                {list.rows.map(a => {
                  const bonus = a.adjustment_type !== 'penalty';
                  return (
                    <tr key={a.id} className="static">
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 700 }}>{fmtDate(a.adjustment_date)}</td>
                      <td><div className="row-name"><Initials id={a.user_id} name={a.user_full_name || nameOf(a.user_id)}/><div className="meta"><span className="name">{a.user_full_name || nameOf(a.user_id)}</span></div></div></td>
                      <td><Badge tone={bonus ? 'success' : 'danger'} icon={bonus ? I.PlusCircle : I.MinusCircle}>{t(bonus ? 'py_type_bonus' : 'py_type_penalty')}</Badge></td>
                      <td className="money" style={{ textAlign: 'right', color: bonus ? 'var(--success)' : 'var(--danger)' }}>{bonus ? '+' : '−'}{fmt.format(Math.round(num(a.amount)))}</td>
                      <td className="cell-note" title={a.note || ''}>{a.note || '—'}</td>
                      {canManage && (
                        <td>
                          <RowMenu items={[
                            { icon: I.Edit, label: t('edit'), action: () => setAdjFor({ adjustment: a }) },
                            { icon: I.Trash2, label: t('delete'), danger: true, action: () => removeAdjustment(a) },
                          ]}/>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={list.pages} total={list.total} pageSize={PAGE_SIZE} onPage={setPage}/>
        </div>
      )}

      {tab === 'profiles' && (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('lg_employee')}</th>
                  <th>{t('py_salary_type')}</th>
                  <th style={{ textAlign: 'right' }}>{t('py_rate')}</th>
                  <th>{t('py_effective_from')}</th>
                  <th>{t('students_col_status')}</th>
                  <th>{t('exp_note')}</th>
                  {canManage && <th/>}
                </tr>
              </thead>
              <tbody>
                {!loading && list.rows.length === 0 && <tr className="static"><td colSpan={7} className="empty-cell">{t('py_rates_empty')}</td></tr>}
                {list.rows.map(p => (
                  <tr key={p.user_id} className={canManage ? '' : 'static'} onClick={canManage ? () => setRateFor({ userId: p.user_id }) : undefined}>
                    <td><div className="row-name"><Initials id={p.user_id} name={p.user_full_name || nameOf(p.user_id)}/><div className="meta"><span className="name">{p.user_full_name || nameOf(p.user_id)}</span></div></div></td>
                    <td>{t(p.salary_type === 'daily' ? 'py_type_daily' : 'py_type_monthly')}</td>
                    <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(p.amount)))}</td>
                    <td style={{ fontSize: 12.5, fontWeight: 700 }}>{fmtDate(p.effective_from)}</td>
                    <td>{p.is_active !== false
                      ? <Badge tone="success" icon={I.CheckCircle}>{t('status_active')}</Badge>
                      : <Badge tone="neutral" icon={I.Pause}>{t('status_inactive')}</Badge>}</td>
                    <td className="cell-note" title={p.note || ''}>{p.note || '—'}</td>
                    {canManage && <td><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setRateFor({ userId: p.user_id }); }}><I.Edit size={13}/> {t('edit')}</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={list.pages} total={list.total} pageSize={PAGE_SIZE} onPage={setPage}/>
        </div>
      )}

      {payFor && (
        <PayrollPayDialog item={payFor.item} payment={payFor.payment} employees={employees} nameOf={nameOf}
          onClose={() => setPayFor(null)} onDone={done}/>
      )}
      {adjFor && (
        <AdjustmentDialog adjustment={adjFor.adjustment} presetUserId={adjFor.userId} employees={employees} nameOf={nameOf}
          onClose={() => setAdjFor(null)} onDone={done}/>
      )}
      {rateFor && (
        <ProfileDialog presetUserId={rateFor.userId} employees={employees} profiles={profiles} nameOf={nameOf}
          onClose={() => setRateFor(null)} onDone={done}/>
      )}
    </div>
  );
}
