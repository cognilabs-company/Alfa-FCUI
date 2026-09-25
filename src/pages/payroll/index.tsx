// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { DateInput } from '@/shared/ui/date-picker';
import { SearchableSelect } from '@/shared/ui/controls';
import { menuPosition } from '@/shared/ui/pager';
import { CountUp } from '@/shared/ui/count-up';
import { Badge } from '@/shared/ui/status';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import {
  apiGetPayrollSummary, apiGetPayrollEmployees, apiUpsertSalaryProfile, apiGetSalaryProfiles,
  apiGetPayrollAdjustments, apiCreatePayrollAdjustment, apiUpdatePayrollAdjustment, apiDeletePayrollAdjustment,
  apiGetPayrollPayments, apiCreatePayrollPayment, apiUpdatePayrollPayment, apiDeletePayrollPayment,
  apiClosePayrollMonth, apiReopenPayrollMonth,
} from '@/shared/api';
import { fmt, fmtMoneyRoll, fmtDate, monthLabel, toLocalISO, todayISO } from '@/shared/lib/format';

const monthStart = (d) => toLocalISO(new Date(d.getFullYear(), d.getMonth(), 1));
const monthEnd = (d) => toLocalISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** Payroll: who earns what this month, what was paid, what is still owed. */
export function PayrollScreen({ onToast, canManage = true }) {
  const I = Icon;
  const { t, tp, lang } = useT();

  const [month, setMonth] = React.useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [summary, setSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [unsupported, setUnsupported] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [search, setSearch] = React.useState('');

  // row menu
  const [openMenuId, setOpenMenuId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });

  // employee detail
  const [detailUser, setDetailUser] = React.useState(null);
  const [detailAdj, setDetailAdj] = React.useState([]);
  const [detailPay, setDetailPay] = React.useState([]);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // modals
  const [profileModal, setProfileModal] = React.useState(null);   // { user?, profile? }
  const [adjModal, setAdjModal] = React.useState(null);           // { user, editing? , type }
  const [payModal, setPayModal] = React.useState(null);           // { user, editing? }
  const [employees, setEmployees] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [form, setForm] = React.useState({});

  const fromDate = monthStart(month);
  const toDate = monthEnd(month);
  const monthName = `${monthLabel(month.getMonth(), lang)} ${month.getFullYear()}`;
  const money = (v) => `${fmt.format(Math.round(Number(v) || 0))} ${t('currency')}`;
  const typeLabel = (v) => (v === 'daily' ? t('pr_type_daily') : t('pr_type_monthly'));

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiGetPayrollSummary({ from_date: fromDate, to_date: toDate, include_inactive_profiles: includeInactive || undefined });
      setSummary(res?.data || null);
      setUnsupported(false);
      return res?.data || null;
    } catch (e) {
      if (e?.status === 404) { setUnsupported(true); return null; }
      setLoadError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => { load(); }, [fromDate, toDate, includeInactive]);
  React.useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  async function loadDetail(user) {
    setDetailUser(user);
    setDetailLoading(true);
    try {
      const [a, p] = await Promise.all([
        apiGetPayrollAdjustments({ user_id: user.user_id, from_date: fromDate, to_date: toDate, page_size: 100 }),
        apiGetPayrollPayments({ user_id: user.user_id, from_date: fromDate, to_date: toDate, page_size: 100 }),
      ]);
      setDetailAdj(a?.data || []);
      setDetailPay(p?.data || []);
    } catch (e) {
      notify.error(e.message);
    } finally {
      setDetailLoading(false);
    }
  }
  // Re-read the month; an open detail follows the fresh numbers.
  const refreshAll = async () => {
    const data = await load();
    if (detailUser) {
      const fresh = (data?.items || []).find(i => i.user_id === detailUser.user_id);
      loadDetail(fresh || detailUser);
    }
  };

  // ── salary profile ────────────────────────────────────────────────────────
  async function openProfile(user) {
    setFormError('');
    let profile = null;
    if (user) {
      try {
        const res = await apiGetSalaryProfiles({ user_id: user.user_id, page_size: 5 });
        profile = (res?.data || []).find(p => p.is_active) || (res?.data || [])[0] || null;
      } catch { /* a missing profile is fine */ }
    } else {
      try {
        const res = await apiGetPayrollEmployees({ include_without_profile: true, page_size: 200 });
        setEmployees(res?.data || []);
      } catch (e) { notify.error(e.message); }
    }
    setForm({
      user_id: user ? String(user.user_id) : '',
      salary_type: profile?.salary_type || user?.salary_type || 'monthly',
      amount: String(profile?.amount ?? user?.salary_amount ?? ''),
      effective_from: profile?.effective_from || fromDate,
      is_active: profile ? profile.is_active !== false : true,
      note: profile?.note || '',
    });
    setProfileModal({ user, profile });
    setOpenMenuId(null);
  }
  async function saveProfile() {
    setFormError('');
    if (!form.user_id) return setFormError(t('pr_err_employee'));
    if (!(Number(form.amount) > 0)) return setFormError(t('pr_err_amount'));
    setSaving(true);
    try {
      await apiUpsertSalaryProfile(form.user_id, {
        salary_type: form.salary_type,
        amount: Number(form.amount),
        effective_from: form.effective_from || null,
        is_active: !!form.is_active,
        note: form.note?.trim() || null,
      });
      setProfileModal(null);
      onToast?.(t('pr_saved'));
      refreshAll();
    } catch (e) { setFormError(e.message); } finally { setSaving(false); }
  }

  // ── bonus / penalty ───────────────────────────────────────────────────────
  function openAdjustment(user, type = 'bonus', editing = null) {
    setFormError('');
    setForm({
      adjustment_type: editing?.adjustment_type || type,
      amount: String(editing?.amount ?? ''),
      adjustment_date: editing?.adjustment_date || todayISO(),
      note: editing?.note || '',
    });
    setAdjModal({ user, editing });
    setOpenMenuId(null);
  }
  async function saveAdjustment() {
    setFormError('');
    if (!(Number(form.amount) > 0)) return setFormError(t('pr_err_amount'));
    if (!form.adjustment_date) return setFormError(t('pr_err_date'));
    setSaving(true);
    try {
      const body = { adjustment_type: form.adjustment_type, amount: Number(form.amount), adjustment_date: form.adjustment_date, note: form.note?.trim() || null };
      if (adjModal.editing) await apiUpdatePayrollAdjustment(adjModal.editing.id, body);
      else await apiCreatePayrollAdjustment({ user_id: adjModal.user.user_id, ...body });
      setAdjModal(null);
      onToast?.(t('pr_saved'));
      refreshAll();
    } catch (e) { setFormError(e.message); } finally { setSaving(false); }
  }
  async function removeAdjustment(a) {
    if (!await confirmDialog(t('pr_delete_adjustment_confirm'))) return;
    try { await apiDeletePayrollAdjustment(a.id); onToast?.(t('pr_deleted')); refreshAll(); } catch (e) { notify.error(e.message); }
  }

  // ── payouts ───────────────────────────────────────────────────────────────
  function openPayment(user, editing = null) {
    setFormError('');
    setForm({
      amount: String(editing?.amount ?? (user?.remaining_amount > 0 ? user.remaining_amount : '')),
      payment_date: editing?.payment_date || todayISO(),
      note: editing?.note || '',
    });
    setPayModal({ user, editing });
    setOpenMenuId(null);
  }
  async function savePayment() {
    setFormError('');
    if (!(Number(form.amount) > 0)) return setFormError(t('pr_err_amount'));
    if (!form.payment_date) return setFormError(t('pr_err_date'));
    setSaving(true);
    try {
      const body = { amount: Number(form.amount), payment_date: form.payment_date, note: form.note?.trim() || null };
      if (payModal.editing) await apiUpdatePayrollPayment(payModal.editing.id, body);
      else await apiCreatePayrollPayment({ user_id: payModal.user.user_id, ...body });
      setPayModal(null);
      onToast?.(t('pr_saved'));
      refreshAll();
    } catch (e) { setFormError(e.message); } finally { setSaving(false); }
  }
  async function removePayment(p) {
    if (!await confirmDialog(t('pr_delete_payment_confirm'))) return;
    try { await apiDeletePayrollPayment(p.id); onToast?.(t('pr_deleted')); refreshAll(); } catch (e) { notify.error(e.message); }
  }

  // ── month closure ─────────────────────────────────────────────────────────
  async function closeMonth(user) {
    setOpenMenuId(null);
    const msg = user
      ? t('pr_close_confirm_one').replace('{name}', user.user_full_name).replace('{month}', monthName)
      : t('pr_close_confirm').replace('{month}', monthName);
    if (!await confirmDialog(msg)) return;
    try {
      await apiClosePayrollMonth({ user_ids: user ? [user.user_id] : [], year: month.getFullYear(), month: month.getMonth() + 1, note: null });
      onToast?.(t('pr_month_closed'));
      refreshAll();
    } catch (e) { notify.error(e.message); }
  }
  async function reopenMonth(user) {
    setOpenMenuId(null);
    if (!await confirmDialog(t('pr_reopen_confirm').replace('{name}', user.user_full_name).replace('{month}', monthName))) return;
    try {
      await apiReopenPayrollMonth(month.getFullYear(), month.getMonth() + 1, user.user_id);
      onToast?.(t('pr_month_reopened'));
      refreshAll();
    } catch (e) { notify.error(e.message); }
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const totals = summary?.totals || {};
  const items = (summary?.items || []).filter(i => !search || String(i.user_full_name || '').toLowerCase().includes(search.toLowerCase()));
  const earned = Number(totals.total_earned_amount) || 0;
  const paid = Number(totals.total_paid_amount) || 0;
  const remaining = Number(totals.total_remaining_amount) || 0;
  const split = [
    { key: 'paid', label: t('pr_paid'), value: paid, color: 'var(--success)' },
    { key: 'remaining', label: t('pr_remaining'), value: Math.max(remaining, 0), color: 'var(--viz-cash)' },
  ];
  const splitSum = split.reduce((s, p) => s + p.value, 0) || 1;
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const menuFor = (u) => {
    const list = [
      { label: t('pr_details'), icon: I.Eye, action: () => { setOpenMenuId(null); loadDetail(u); } },
    ];
    if (canManage) {
      list.push(
        { label: t('pr_add_payment'), icon: I.HandCoins, action: () => openPayment(u) },
        { label: t('pr_add_bonus'), icon: I.PlusCircle, action: () => openAdjustment(u, 'bonus') },
        { label: t('pr_add_penalty'), icon: I.MinusCircle, action: () => openAdjustment(u, 'penalty') },
        { label: t('pr_edit_salary'), icon: I.Edit, action: () => openProfile(u) },
        u.is_closed
          ? { label: t('pr_reopen'), icon: I.RefreshCw, action: () => reopenMonth(u) }
          : { label: t('pr_close_month'), icon: I.Sealed, action: () => closeMonth(u) },
      );
    }
    return list;
  };

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.HandCoins}/>
        <div>
          <h1 className="page-title">{t('nav_payroll')}</h1>
          <div className="page-sub">{unsupported ? t('pr_sub') : `${Number(totals.employees_count) || 0} ${tp('pr_employees_sfx', Number(totals.employees_count) || 0)} · ${t('pr_sub')}`}</div>
        </div>
        {canManage && !unsupported && (
          <div className="page-actions">
            <button className="btn" onClick={() => closeMonth(null)} disabled={!items.length}><I.Sealed size={15}/> {t('pr_close_month')}</button>
            <button className="btn primary" onClick={() => openProfile(null)}><I.UserPlus size={15}/> {t('pr_add_employee')}</button>
          </div>
        )}
      </div>

      {unsupported && (
        <div className="card empty" style={{ padding: 48, display: 'grid', gap: 10, placeItems: 'center' }}>
          <I.Wrench size={28} color="var(--muted)"/>
          <div style={{ fontWeight: 700 }}>{t('pr_unsupported')}</div>
        </div>
      )}

      {!unsupported && (
        <>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="week-nav" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="icon-btn" aria-label={t('prev')} onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><I.ChevronLeft size={16}/></button>
              <span style={{ minWidth: 150, textAlign: 'center', fontWeight: 800, fontSize: 14 }}>{monthName}</span>
              <button type="button" className="icon-btn" aria-label={t('next')} onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><I.ChevronRight size={16}/></button>
              <button type="button" className="btn sm ghost" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{t('cal_today')}</button>
            </div>
            <div className="search">
              <span className="icon-l"><I.Search size={15}/></span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('pr_search_ph')}/>
            </div>
            <label className="check-line" style={{ marginLeft: 'auto' }}>
              <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)}/> {t('pr_include_inactive')}
            </label>
          </div>

          {summary && (
            <section className="summary-card">
              <div>
                <div className="s-label"><I.HandCoins size={15}/> {t('pr_total_earned')}</div>
                <div className="s-big"><CountUp value={earned} format={fmtMoneyRoll} duration={1800}/></div>
                <div className="s-note">{fmt.format(earned)} {t('currency')} · {monthName}</div>
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
                  <div>
                    <i style={{ background: 'var(--viz-payme)' }}/>
                    <span>{t('pr_bonuses')} / {t('pr_penalties')}</span>
                    <b>+{fmtMoneyRoll(Number(totals.total_bonus_amount) || 0)} · −{fmtMoneyRoll(Number(totals.total_penalty_amount) || 0)}</b>
                    <em/>
                  </div>
                </div>
              </div>
              <div className="s-side">
                <div className="s-label"><I.Users size={15}/> {t('pr_employee')}</div>
                <div className="s-mid"><CountUp value={Number(totals.employees_count) || 0} duration={1200}/></div>
                <div className="s-note">{t('pr_open')}: {Number(totals.open_employees_count) || 0} · {t('pr_closed')}: {Number(totals.closed_employees_count) || 0}</div>
              </div>
            </section>
          )}

          {loadError && <div className="alert danger" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{loadError}</span></div>}

          <div className={'table-wrap' + (loading ? ' is-loading' : '')}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('pr_employee')}</th>
                    <th>{t('pr_salary')}</th>
                    <th style={{ textAlign: 'right' }} title={t('pr_workdays_hint')}>{t('pr_workdays')}</th>
                    <th style={{ textAlign: 'right' }}>{t('pr_earned')}</th>
                    <th style={{ textAlign: 'right' }}>{t('pr_paid')}</th>
                    <th style={{ textAlign: 'right' }}>{t('pr_remaining')}</th>
                    <th>{t('sessions_col_status')}</th>
                    <th style={{ width: 48 }}/>
                  </tr>
                </thead>
                <tbody>
                  {!loading && items.length === 0 && (
                    <tr className="static"><td colSpan={8} className="empty-cell">{t('pr_empty')}</td></tr>
                  )}
                  {items.map((u) => {
                    const adj = (Number(u.bonus_amount) || 0) - (Number(u.penalty_amount) || 0);
                    return (
                      <tr key={u.user_id} onClick={() => loadDetail(u)}>
                        <td>
                          <div className="row-name">
                            <div className="avatar" style={{ background: avatarColor(u.user_id) }}>{initials(u.user_full_name)}</div>
                            <div className="meta">
                              <span className="name">{u.user_full_name}</span>
                              <span className="sub">{u.user_phone || '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{fmt.format(u.salary_amount || 0)} {t('currency')}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{typeLabel(u.salary_type)} · {u.salary_type === 'daily' ? t('pr_per_day') : t('pr_per_month')}</div>
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>{u.workdays ?? '—'}</td>
                        <td className="money" style={{ textAlign: 'right' }}>
                          {money(u.earned_amount)}
                          {adj !== 0 && (
                            <small style={{ display: 'block', fontSize: 11, fontWeight: 700, color: adj > 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {adj > 0 ? '+' : '−'}{fmt.format(Math.abs(adj))} {t('currency')}
                            </small>
                          )}
                        </td>
                        <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(u.paid_amount)}</td>
                        <td className="money" style={{ textAlign: 'right', color: Number(u.remaining_amount) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{money(u.remaining_amount)}</td>
                        <td>
                          {u.is_closed
                            ? <Badge tone="neutral" icon={I.Sealed}>{t('pr_closed')}</Badge>
                            : <Badge tone="success" icon={I.Dashed}>{t('pr_open')}</Badge>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === u.user_id) setOpenMenuId(null);
                            else { setMenuPos(menuPosition(e.currentTarget, menuFor(u).length)); setOpenMenuId(u.user_id); }
                          }}><I.More size={16}/></button>
                          {openMenuId === u.user_id && (
                            <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                              {menuFor(u).map(item => (
                                <button key={item.label} className="menu-item" onClick={item.action}><item.icon size={14}/> {item.label}</button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── employee detail ─────────────────────────────────────────────── */}
      {detailUser && (
        <Modal icon={I.HandCoins} size="lg" onClose={() => setDetailUser(null)}
          title={detailUser.user_full_name}
          subtitle={`${monthName} · ${typeLabel(detailUser.salary_type)} · ${fmt.format(detailUser.salary_amount || 0)} ${t('currency')}`}
          headerExtra={detailUser.is_closed ? <Badge tone="neutral" icon={I.Sealed}>{t('pr_closed')}</Badge> : <Badge tone="success" icon={I.Dashed}>{t('pr_open')}</Badge>}
          footer={canManage ? (
            <>
              <button className="btn ghost" onClick={() => openProfile(detailUser)}><I.Edit size={14}/> {t('pr_edit_salary')}</button>
              <button className="btn" onClick={() => openAdjustment(detailUser, 'bonus')}><I.PlusCircle size={14}/> {t('pr_add_adjustment')}</button>
              <button className="btn primary" onClick={() => openPayment(detailUser)} disabled={detailUser.is_closed}><I.HandCoins size={14}/> {t('pr_add_payment')}</button>
            </>
          ) : undefined}>
          <DetailGrid cols={3} items={[
            { label: t('pr_workdays'), value: detailUser.workdays ?? '—', icon: I.Calendar },
            { label: t('pr_base'), value: money(detailUser.base_amount), icon: I.Money },
            { label: t('pr_earned'), value: money(detailUser.earned_amount), icon: I.TrendUp },
            { label: t('pr_bonus'), value: `+${money(detailUser.bonus_amount)}`, icon: I.PlusCircle },
            { label: t('pr_penalty'), value: `−${money(detailUser.penalty_amount)}`, icon: I.MinusCircle },
            { label: t('pr_paid'), value: money(detailUser.paid_amount), icon: I.CheckCircle },
            { label: t('pr_remaining'), value: <span style={{ color: Number(detailUser.remaining_amount) > 0 ? 'var(--danger)' : 'var(--success)' }}>{money(detailUser.remaining_amount)}</span>, icon: I.AlertCircle },
            { label: t('profile_phone'), value: detailUser.user_phone || '—', icon: I.Phone },
          ]}/>

          <div className="card-title" style={{ margin: '18px 0 8px' }}>{t('pr_payments')} <span className="chip">{detailPay.length}</span></div>
          {detailLoading ? <div className="empty loading" style={{ padding: 16 }}>{t('loading')}</div> : detailPay.length === 0
            ? <div className="empty" style={{ padding: 14 }}>{t('pr_no_records')}</div>
            : (
              <div className="table-wrap"><table className="table">
                <tbody>
                  {detailPay.map(p => (
                    <tr key={p.id} className="static">
                      <td className="num" style={{ fontSize: 12.5, width: 150 }}>{fmtDate(p.payment_date)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{p.note || '—'}</td>
                      <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{money(p.amount)}</td>
                      {canManage && !detailUser.is_closed && (
                        <td style={{ width: 80, whiteSpace: 'nowrap' }}>
                          <button className="icon-btn plain" aria-label={t('edit')} onClick={() => openPayment(detailUser, p)}><I.Edit size={14}/></button>
                          <button className="icon-btn plain danger" aria-label={t('delete')} onClick={() => removePayment(p)}><I.Trash2 size={14}/></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

          <div className="card-title" style={{ margin: '18px 0 8px' }}>{t('pr_adjustments')} <span className="chip">{detailAdj.length}</span></div>
          {detailLoading ? null : detailAdj.length === 0
            ? <div className="empty" style={{ padding: 14 }}>{t('pr_no_records')}</div>
            : (
              <div className="table-wrap"><table className="table">
                <tbody>
                  {detailAdj.map(a => (
                    <tr key={a.id} className="static">
                      <td className="num" style={{ fontSize: 12.5, width: 150 }}>{fmtDate(a.adjustment_date)}</td>
                      <td>
                        {a.adjustment_type === 'penalty'
                          ? <Badge tone="danger" icon={I.MinusCircle}>{t('pr_penalty')}</Badge>
                          : <Badge tone="success" icon={I.PlusCircle}>{t('pr_bonus')}</Badge>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{a.note || '—'}</td>
                      <td className="money" style={{ textAlign: 'right', color: a.adjustment_type === 'penalty' ? 'var(--danger)' : 'var(--success)' }}>
                        {a.adjustment_type === 'penalty' ? '−' : '+'}{money(a.amount)}
                      </td>
                      {canManage && !detailUser.is_closed && (
                        <td style={{ width: 80, whiteSpace: 'nowrap' }}>
                          <button className="icon-btn plain" aria-label={t('edit')} onClick={() => openAdjustment(detailUser, a.adjustment_type, a)}><I.Edit size={14}/></button>
                          <button className="icon-btn plain danger" aria-label={t('delete')} onClick={() => removeAdjustment(a)}><I.Trash2 size={14}/></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
        </Modal>
      )}

      {/* ── salary profile ──────────────────────────────────────────────── */}
      {profileModal && (
        <Modal icon={I.Money} size="md" onClose={() => setProfileModal(null)}
          title={profileModal.user ? t('pr_edit_salary') : t('pr_add_employee')}
          subtitle={profileModal.user?.user_full_name}
          footer={<>
            <button className="btn ghost" onClick={() => setProfileModal(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveProfile} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
          </>}>
          <div className="form-row">
            {!profileModal.user && (
              <div className="field col-span-2"><label>{t('pr_employee')} <span className="req">*</span></label>
                <SearchableSelect value={form.user_id} onChange={v => setF('user_id', v)} placeholder={t('pr_pick_employee')}
                  options={employees.map(e => ({ value: String(e.id), label: `${e.full_name}${e.phone ? ' · ' + e.phone : ''}` }))}/>
              </div>
            )}
            <div className="col-span-2">
              <div className="type-choice">
                {[
                  { key: 'monthly', label: t('pr_type_monthly'), hint: t('pr_type_monthly_hint'), icon: I.Calendar },
                  { key: 'daily', label: t('pr_type_daily'), hint: t('pr_type_daily_hint'), icon: I.CalendarCheck },
                ].map(opt => (
                  <button key={opt.key} type="button" className={'type-opt' + (form.salary_type === opt.key ? ' on' : '')} onClick={() => setF('salary_type', opt.key)}>
                    <opt.icon size={18}/>
                    <span><b>{opt.label}</b><small>{opt.hint}</small></span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field"><label>{t('pr_amount')} ({t('currency')} · {form.salary_type === 'daily' ? t('pr_per_day') : t('pr_per_month')}) <span className="req">*</span></label>
              <input type="number" min="1" value={form.amount} onChange={e => setF('amount', e.target.value)} placeholder={form.salary_type === 'daily' ? '200000' : '5000000'} autoFocus/>
            </div>
            <div className="field"><label>{t('pr_effective_from')}</label>
              <DateInput value={form.effective_from} onChange={v => setF('effective_from', v)}/>
            </div>
            <div className="col-span-2">
              <div className={'opt-card' + (form.is_active ? ' on' : '')}>
                <label className="switch">
                  <input type="checkbox" checked={!!form.is_active} onChange={e => setF('is_active', e.target.checked)}/>
                  <i/>
                </label>
                <div className="opt-text">
                  <div className="opt-title">{t('pr_profile_active')}</div>
                  <div className="opt-desc">{t('pr_profile_active_hint')}</div>
                </div>
              </div>
            </div>
            <div className="field col-span-2"><label>{t('pr_note')}</label>
              <input value={form.note || ''} onChange={e => setF('note', e.target.value)}/>
            </div>
          </div>
          {formError && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{formError}</span></div>}
        </Modal>
      )}

      {/* ── bonus / penalty ─────────────────────────────────────────────── */}
      {adjModal && (
        <Modal icon={form.adjustment_type === 'penalty' ? I.MinusCircle : I.PlusCircle} size="sm" onClose={() => setAdjModal(null)}
          title={adjModal.editing ? t('pr_edit_adjustment') : t('pr_add_adjustment')}
          subtitle={adjModal.user.user_full_name}
          footer={<>
            <button className="btn ghost" onClick={() => setAdjModal(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveAdjustment} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
          </>}>
          <div className="seg" style={{ marginBottom: 14 }}>
            <button type="button" className={form.adjustment_type === 'bonus' ? 'active' : ''} onClick={() => setF('adjustment_type', 'bonus')}><I.PlusCircle size={14}/> {t('pr_bonus')}</button>
            <button type="button" className={form.adjustment_type === 'penalty' ? 'active' : ''} onClick={() => setF('adjustment_type', 'penalty')}><I.MinusCircle size={14}/> {t('pr_penalty')}</button>
          </div>
          <div className="form-row">
            <div className="field"><label>{t('pr_amount')} ({t('currency')}) <span className="req">*</span></label>
              <input type="number" min="1" value={form.amount} onChange={e => setF('amount', e.target.value)} autoFocus/>
            </div>
            <div className="field"><label>{t('pr_date')} <span className="req">*</span></label>
              <DateInput value={form.adjustment_date} onChange={v => setF('adjustment_date', v)}/>
            </div>
            <div className="field col-span-2"><label>{t('pr_note')}</label>
              <input value={form.note || ''} onChange={e => setF('note', e.target.value)}/>
            </div>
          </div>
          {formError && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{formError}</span></div>}
        </Modal>
      )}

      {/* ── payout ──────────────────────────────────────────────────────── */}
      {payModal && (
        <Modal icon={I.HandCoins} size="sm" onClose={() => setPayModal(null)}
          title={payModal.editing ? t('pr_edit_payment') : t('pr_add_payment')}
          subtitle={`${payModal.user.user_full_name} · ${t('pr_remaining')}: ${money(payModal.user.remaining_amount)}`}
          footer={<>
            <button className="btn ghost" onClick={() => setPayModal(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={savePayment} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
          </>}>
          <div className="form-row">
            <div className="field"><label>{t('pr_amount')} ({t('currency')}) <span className="req">*</span></label>
              <input type="number" min="1" value={form.amount} onChange={e => setF('amount', e.target.value)} autoFocus/>
            </div>
            <div className="field"><label>{t('pr_date')} <span className="req">*</span></label>
              <DateInput value={form.payment_date} onChange={v => setF('payment_date', v)}/>
            </div>
            <div className="field col-span-2"><label>{t('pr_note')}</label>
              <input value={form.note || ''} onChange={e => setF('note', e.target.value)} placeholder={t('pr_advance_note')}/>
            </div>
          </div>
          {formError && <div className="alert danger" style={{ marginTop: 12 }}><I.AlertTriangle size={16}/> <span>{formError}</span></div>}
        </Modal>
      )}
    </div>
  );
}
