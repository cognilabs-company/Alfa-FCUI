// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { Badge, txStatusBadge } from '@/shared/ui/status';
import { Pager, menuPosition } from '@/shared/ui/pager';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmt, fmtDate, fmtDateTime, todayISO } from '@/shared/lib/format';
import { paymentSourceLabel } from '@/shared/lib/labels';
import { isPaid } from '@/shared/lib/analytics';
import {
  apiGetPendingStudents, apiCreatePendingStudent, apiUpdatePendingStudent,
  apiDeletePendingStudent, apiCompletePendingStudent, apiGetGroupsForSelect,
  apiGetTransactions, apiAddPendingStudentPayment,
} from '@/shared/api';
import { MoneyInput } from '@/widgets/expenses';
import { StudentsTabs } from './students-tabs';
import { PRE_CONTRACT_PRICE_PER_SESSION } from './pre-contract-training';

const PAGE_SIZE = 20;

const emptyPending = {
  first_name: '', last_name: '', phone: '', date_of_birth: '', group_id: '',
};
const emptyComplete = {
  first_name: '', last_name: '', date_of_birth: '', height: '', weight: '',
  ampula: '', millati: '', pnfl: '', phone: '', address: '', group_id: '',
  customer_full_name: '', customer_passport_number: '', customer_address: '',
  monthly_fee_amount: '', uniform_fee_amount: '', contract_start_date: '', contract_end_date: '',
  photo: null, passport: null, extra_file: null,
};
const emptyPayment = () => ({ session_count: '', amount: '', source: 'cash', paid_at: '', comment: '' });

/** Every payment taken from one pending student, newest first. */
async function loadPayments(id) {
  const res = await apiGetTransactions({ pending_student_id: id, page_size: 100 });
  return [...(res?.data || [])].sort((a, b) =>
    String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || '')));
}

function paidSummary(rows) {
  const paid = (rows || []).filter(isPaid);
  return { total: paid.reduce((s, tx) => s + (Number(tx.amount) || 0), 0), count: paid.length };
}

/**
 * One pending student: who they are, every payment taken from them, and a
 * form to take another — as many as needed, since they pay while the
 * documents are still on their way.
 */
function PendingDetail({ row, groupName, canEdit, onClose, onChanged, onEdit, onComplete, onDelete }) {
  const I = Icon;
  const { t, tp } = useT();
  const [payments, setPayments] = React.useState(null);
  const [error, setError] = React.useState('');
  const [form, setForm] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const done = !!(row.converted_at || row.converted_student_id);

  async function reload() {
    setError('');
    try { setPayments(await loadPayments(row.id)); }
    catch (e) { setPayments([]); setError(e.message); }
  }
  React.useEffect(() => { reload(); }, [row.id]);

  const setP = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function addPayment() {
    const count = Number(form.session_count);
    const amount = Number(form.amount);
    // either is enough: sessions alone are billed count × price by the server
    if (!(amount > 0) && !(count > 0)) { notify.error(t('ps_err_amount_or_sessions')); return; }
    setSaving(true);
    try {
      await apiAddPendingStudentPayment(row.id, {
        session_count: count > 0 ? count : undefined,
        amount: amount > 0 ? amount : undefined,
        source: form.source || 'cash',
        paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : undefined,
        comment: form.comment.trim() || undefined,
      });
      notify.success(t('ps_pay_added'));
      setForm(null);
      await reload();
      onChanged?.(row.id);
    } catch (e) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || `#${row.id}`;
  const sum = paidSummary(payments);

  return (
    <Modal icon={I.User} size="lg" onClose={onClose} title={name}
      subtitle={done ? t('ps_state_done') : t('ps_title')}
      headerExtra={canEdit && !done ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn ghost sm" onClick={() => onEdit(row)}><I.Edit size={13}/> {t('edit')}</button>
        </div>
      ) : null}
      footer={canEdit && !done ? (
        <>
          <button className="btn danger-ghost" style={{ marginRight: 'auto' }} onClick={() => onDelete(row)}><I.Trash2 size={14}/> {t('delete')}</button>
          <button className="btn primary" onClick={() => onComplete(row)}><I.Check size={14}/> {t('ps_complete')}</button>
        </>
      ) : undefined}>
      <DetailGrid items={[
        { label: t('field_phone'), value: row.phone || '—', icon: I.Phone },
        { label: t('field_birth_date'), value: row.date_of_birth ? fmtDate(row.date_of_birth) : '—', icon: I.Calendar },
        { label: t('field_group2'), value: groupName || '—', icon: I.UsersFour },
        { label: t('ps_added_at'), value: fmtDate(row.created_at), icon: I.UserPlus },
      ]}/>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '20px 0 10px' }}>
        <div className="card-title">{t('ps_payments_title')}</div>
        {payments && <span className="chip">{sum.count} {tp('contract_payments_sfx', sum.count)}</span>}
        {payments && sum.total > 0 && <span className="chip success">{t('ps_paid_total')}: {fmt.format(sum.total)} {t('currency')}</span>}
        {canEdit && !done && !form && (
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setForm(emptyPayment())}>
            <I.Plus size={14}/> {t('ps_pay_add')}
          </button>
        )}
      </div>

      {form && (
        <div className="opt-card on" style={{ display: 'block', marginBottom: 14 }}>
          <div className="form-row">
            <div className="field">
              <label>{t('ps_pay_sessions')}</label>
              {/* the count fills the amount at the per-session price; the amount stays editable */}
              <input type="number" min="1" inputMode="numeric" value={form.session_count} placeholder="12" autoFocus
                onChange={e => {
                  const n = Number(e.target.value);
                  setForm(p => ({ ...p, session_count: e.target.value, amount: n > 0 ? String(n * PRE_CONTRACT_PRICE_PER_SESSION) : '' }));
                }}/>
            </div>
            <div className="field">
              <label>{t('exp_amount')}</label>
              <MoneyInput value={form.amount} onChange={v => setP('amount', v)} placeholder="300 000"/>
              {Number(form.session_count) > 0 && (
                <div className="hint">
                  {t('pct_calc')
                    .replace('{n}', String(Number(form.session_count)))
                    .replace('{price}', fmt.format(PRE_CONTRACT_PRICE_PER_SESSION))
                    .replace('{total}', fmt.format(Number(form.session_count) * PRE_CONTRACT_PRICE_PER_SESSION))}
                </div>
              )}
            </div>
            <div className="field">
              <label>{t('prorated_source')}</label>
              <SearchableSelect value={form.source} onChange={v => setP('source', v)}
                options={[
                  { value: 'cash', label: t('tx_src_cash') },
                  { value: 'click', label: 'Click' },
                  { value: 'payme', label: 'Payme' },
                  { value: 'bank', label: t('tx_src_bank') },
                ]}/>
            </div>
            <div className="field">
              <label>{t('prorated_paid_at')}</label>
              <DateTimeInput value={form.paid_at} onChange={v => setP('paid_at', v)} placeholder={t('pct_paid_now')}/>
            </div>
            <div className="field">
              <label>{t('ps_pay_comment')}</label>
              <input value={form.comment} onChange={e => setP('comment', e.target.value)}/>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn ghost sm" onClick={() => setForm(null)} disabled={saving}>{t('cancel')}</button>
            <button className="btn primary sm" onClick={addPayment} disabled={saving}>
              <I.Check size={14}/> {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}

      {error && <div className="alert danger" style={{ marginBottom: 10 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
      {payments === null ? (
        <div className="empty loading" style={{ padding: 20 }}>{t('loading')}</div>
      ) : payments.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>{t('ps_pay_empty')}</div>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('transactions_col_date')}</th>
                  <th style={{ textAlign: 'right' }}>{t('exp_amount')}</th>
                  <th>{t('prorated_source')}</th>
                  <th>{t('ps_pay_comment')}</th>
                  <th>{t('transactions_col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(tx => (
                  <tr key={tx.id} className="static">
                    <td className="num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDateTime(tx.paid_at || tx.created_at)}</td>
                    <td className="money" style={{ textAlign: 'right' }}>
                      <div>{fmt.format(tx.amount || 0)} {t('currency')}</div>
                      {Number(tx.training_session_count) > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                          {tx.training_session_count} {tp('ps_sessions_sfx', Number(tx.training_session_count))}
                          {Number(tx.training_price_per_session) > 0 ? ` × ${fmt.format(tx.training_price_per_session)}` : ''}
                        </div>
                      )}
                    </td>
                    <td><span className="chip">{paymentSourceLabel(tx.source, t)}</span></td>
                    <td className="cell-note" title={tx.comment || ''}>{tx.comment || '—'}</td>
                    <td>{txStatusBadge(tx.status, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Students who train already but have not handed in their documents yet. */
export function PendingStudents({ onTab, onToast, onOpenStudent, canEdit = true }) {
  const I = Icon;
  const { t, tp } = useT();

  const [rows, setRows] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [unsupported, setUnsupported] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // filters
  const [q, setQ] = React.useState('');
  const [withDone, setWithDone] = React.useState(false);

  // create / edit
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(emptyPending);
  const [saving, setSaving] = React.useState(false);
  // what each row has paid so far: id → { total, count }
  const [paid, setPaid] = React.useState({});
  // the record whose card is open
  const [detail, setDetail] = React.useState(null);
  // complete
  const [completing, setCompleting] = React.useState(null);
  const [cForm, setCForm] = React.useState(emptyComplete);
  const [cStep, setCStep] = React.useState(1);
  const [completeSaving, setCompleteSaving] = React.useState(false);

  // A step earns its tick only once everything required inside it is filled —
  // the same rule the new-student wizard uses.
  const cStepValid = {
    1: !!(cForm.date_of_birth && cForm.height && cForm.weight && String(cForm.pnfl).trim() && cForm.group_id),
    2: !!(cForm.customer_full_name.trim() && cForm.customer_passport_number.trim() && cForm.customer_address.trim() && cForm.monthly_fee_amount),
    3: true,
  };

  const [openMenuId, setOpenMenuId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setC = (k, v) => setCForm(p => ({ ...p, [k]: v }));

  async function load(overrides = {}) {
    setLoading(true);
    try {
      const params = { page: overrides.page ?? page, page_size: PAGE_SIZE };
      const query = overrides.search ?? q;
      if (query) params.search = query;
      if (withDone) params.include_converted = true;
      const res = await apiGetPendingStudents(params);
      setRows(res?.data || []);
      setTotalPages(res?.meta?.total_pages || 1);
      setTotalCount(res?.meta?.total || 0);
      setUnsupported(false);
    } catch (e) {
      // the endpoint is not on this server yet — say so instead of showing an error
      if (e.status === 404 || e.status === 422) { setUnsupported(true); setRows([]); setTotalCount(0); }
      else notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    apiGetGroupsForSelect().then(r => setGroups(r?.data || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load({ page: 1 }); }, q ? 400 : 0);
    return () => clearTimeout(timer);
  }, [q, withDone]);

  // payment totals for the rows in view; a row whose total is known is not asked again
  function refreshPaid(ids) {
    if (!ids.length) return;
    Promise.all(ids.map(id => loadPayments(id).then(list => [id, paidSummary(list)]).catch(() => [id, null])))
      .then(pairs => setPaid(p => ({ ...p, ...Object.fromEntries(pairs) })));
  }
  React.useEffect(() => {
    refreshPaid(rows.map(r => r.id).filter(id => !(id in paid)));
  }, [rows]);

  React.useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const groupMap = React.useMemo(() => {
    const m = {};
    groups.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [groups]);

  const nameOf = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || `#${r.id}`;
  const isDone = (r) => !!(r.converted_at || r.converted_student_id);

  function openNew() {
    setEditing(null);
    setForm(emptyPending);
    setShowForm(true);
  }

  function openEdit(r) {
    setDetail(null);
    setEditing(r);
    setForm({
      ...emptyPending,
      first_name: r.first_name || '', last_name: r.last_name || '', phone: r.phone || '',
      date_of_birth: r.date_of_birth || '',
      group_id: r.group_id ? String(r.group_id) : '',
    });
    setShowForm(true);
    setOpenMenuId(null);
  }

  async function savePending() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      notify.error(t('toast_required'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || undefined,
        date_of_birth: form.date_of_birth || undefined,
      };
      const groupId = form.group_id ? Number(form.group_id) : null;
      // on an edit, null takes the record out of its group
      if (editing) await apiUpdatePendingStudent(editing.id, { ...payload, group_id: groupId });
      else await apiCreatePendingStudent({ ...payload, group_id: groupId ?? undefined });
      onToast?.(t(editing ? 'ps_updated' : 'ps_created'));
      setShowForm(false);
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r) {
    setOpenMenuId(null);
    if (!await confirmDialog(t('ps_delete_confirm').replace('{name}', nameOf(r)))) return;
    try {
      await apiDeletePendingStudent(r.id);
      setDetail(null);
      onToast?.(t('ps_deleted'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  function openComplete(r) {
    setDetail(null);
    setCompleting(r);
    setCStep(1);
    setOpenMenuId(null);
    const year = new Date().getFullYear();
    setCForm({
      ...emptyComplete,
      // the pending record already knows these; the form starts from them
      first_name: r.first_name || '', last_name: r.last_name || '',
      date_of_birth: r.date_of_birth || '', phone: r.phone || '',
      group_id: String(r.group_id || ''),
      // a short first payment fixes where the monthly contract starts — the
      // server uses initial_payment_end_date whatever the form sends
      contract_start_date: r.initial_payment_end_date || todayISO(),
      contract_end_date: `${year}-12-31`,
    });
  }

  async function saveComplete() {
    const need = ['date_of_birth', 'height', 'weight', 'pnfl', 'group_id',
      'customer_full_name', 'customer_passport_number', 'customer_address', 'monthly_fee_amount'];
    if (need.some(k => !String(cForm[k] ?? '').trim())) {
      setCStep(cStepValid[1] ? 2 : 1);
      notify.error(t('toast_required'));
      return;
    }
    setCompleteSaving(true);
    try {
      const fd = new FormData();
      const text = ['first_name', 'last_name', 'date_of_birth', 'ampula', 'millati', 'pnfl', 'phone', 'address',
        'customer_full_name', 'customer_passport_number', 'customer_address', 'contract_start_date', 'contract_end_date'];
      for (const k of text) if (String(cForm[k] ?? '').trim()) fd.append(k, String(cForm[k]).trim());
      for (const k of ['height', 'weight', 'group_id', 'monthly_fee_amount', 'uniform_fee_amount']) {
        if (String(cForm[k] ?? '').trim()) fd.append(k, String(Number(cForm[k])));
      }
      for (const k of ['photo', 'passport', 'extra_file']) if (cForm[k]) fd.append(k, cForm[k]);
      await apiCompletePendingStudent(completing.id, fd);
      setCompleting(null);
      onToast?.(t('ps_completed'));
      // stay in the queue: whoever is processing documents usually has several
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setCompleteSaving(false);
    }
  }

  const hasFilters = q || withDone;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Clipboard}/>
        <div>
          <h1 className="page-title">{t('ps_title')}</h1>
          <div className="page-sub">
            {unsupported ? t('ps_sub') : `${totalCount} ${tp('ps_count_sfx', totalCount)} · ${t('ps_sub')}`}
          </div>
        </div>
        {canEdit && !unsupported && (
          <div className="page-actions">
            <button className="btn primary" onClick={openNew}><I.UserPlus size={15}/> {t('ps_new')}</button>
          </div>
        )}
      </div>

      <StudentsTabs active="pending" onChange={onTab}/>

      {unsupported ? (
        <div className="card empty" style={{ padding: 48, display: 'grid', gap: 10, placeItems: 'center' }}>
          <I.Wrench size={28} color="var(--muted)"/>
          <div style={{ fontWeight: 700 }}>{t('ps_unsupported')}</div>
        </div>
      ) : (
        <div className="table-wrap">
          <div className="table-toolbar">
            <div className="search">
              <span className="icon-l"><I.Search size={15}/></span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('students_search')}/>
            </div>
            <label className="check-line">
              <input type="checkbox" checked={withDone} onChange={e => setWithDone(e.target.checked)}/>
              {t('ps_with_done')}
            </label>
            {hasFilters && (
              <button className="btn ghost sm" onClick={() => { setQ(''); setWithDone(false); }}>
                <I.X size={14}/> {t('clear_filters')}
              </button>
            )}
            <div className="toolbar-meta">{rows.length > 0 ? t('ps_open_hint') : `${totalCount} ${tp('ps_count_sfx', totalCount)}`}</div>
          </div>

          {loading && rows.length === 0 ? (
            <div className="empty loading" style={{ padding: 40 }}>{t('loading')}</div>
          ) : (
            <div className="table-scroll"><table className="table">
              <thead>
                <tr>
                  <th>{t('students_col_name')}</th>
                  <th>{t('field_group2')}</th>
                  <th>{t('ps_col_payments')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr className="static"><td colSpan={4} className="empty-cell">{t('ps_empty')}</td></tr>
                )}
                {rows.map(r => {
                  const done = isDone(r);
                  const pay = paid[r.id];
                  return (
                    <tr key={r.id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="row-name">
                          <div className="avatar" style={{ background: avatarColor(r.id) }}>
                            {(r.first_name || '?')[0]}{(r.last_name || '')[0]}
                          </div>
                          <div className="meta">
                            <span className="name">{nameOf(r)}</span>
                            <span className="sub">{r.phone || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>{r.group_id ? <span className="chip navy">{groupMap[r.group_id] || `#${r.group_id}`}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td>
                        {pay === undefined ? <span style={{ color: 'var(--muted)' }}>…</span>
                          : !pay || pay.count === 0 ? <span style={{ color: 'var(--muted)' }}>—</span>
                          : (
                            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.35 }}>
                              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt.format(pay.total)} {t('currency')}</b>
                              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{pay.count} {tp('contract_payments_sfx', pay.count)}</span>
                            </span>
                          )}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {canEdit && !done && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <button className="btn sm primary" onClick={() => openComplete(r)}>
                              <I.Check size={13}/> {t('ps_complete')}
                            </button>
                            <div style={{ position: 'relative' }}>
                              <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => {
                                e.stopPropagation();
                                if (openMenuId === r.id) { setOpenMenuId(null); return; }
                                setMenuPos(menuPosition(e.currentTarget, 3));
                                setOpenMenuId(r.id);
                              }}>
                                <I.More size={16}/>
                              </button>
                              {openMenuId === r.id && (
                                <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                                  <button className="menu-item" onClick={() => { setOpenMenuId(null); setDetail(r); }}><I.HandCoins size={14}/> {t('ps_pay_add')}</button>
                                  <button className="menu-item" onClick={() => openEdit(r)}><I.Edit size={14}/> {t('edit')}</button>
                                  <button className="menu-item danger" onClick={() => remove(r)}><I.Trash2 size={14}/> {t('delete')}</button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {done && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <Badge tone="success" icon={I.CheckCircle}>{t('ps_state_done')}</Badge>
                            {r.converted_student_id && onOpenStudent && (
                              <button className="btn sm ghost" onClick={() => onOpenStudent(r.converted_student_id)}>
                                <I.ArrowUpRight size={13}/> {t('view')}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}

          <Pager page={page} totalPages={totalPages} total={totalCount} pageSize={PAGE_SIZE}
            onPage={(p) => { setPage(p); load({ page: p }); }}/>
        </div>
      )}

      {detail && (
        <PendingDetail row={detail} groupName={detail.group_id ? (groupMap[detail.group_id] || `#${detail.group_id}`) : ''}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onChanged={(id) => refreshPaid([id])}
          onEdit={openEdit}
          onComplete={openComplete}
          onDelete={remove}/>
      )}

      {showForm && (
        <Modal icon={I.UserPlus}
          onClose={() => setShowForm(false)}
          title={t(editing ? 'ps_edit_title' : 'ps_new_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setShowForm(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={savePending} disabled={saving}>
              <I.Check size={14}/> {saving ? t('saving') : t('save')}
            </button>
          </>}
        >
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="field">
              <label>{t('field_first_name')} <span className="req">*</span></label>
              <input value={form.first_name} onChange={e => setF('first_name', e.target.value)} placeholder="Ali"/>
            </div>
            <div className="field">
              <label>{t('field_last_name')} <span className="req">*</span></label>
              <input value={form.last_name} onChange={e => setF('last_name', e.target.value)} placeholder="Karimov"/>
            </div>
            <div className="field">
              <label>{t('field_phone')}</label>
              <input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+998901234567"/>
            </div>
            <div className="field">
              <label>{t('field_birth_date')}</label>
              <DateInput value={form.date_of_birth} onChange={v => setF('date_of_birth', v)}/>
            </div>
            <div className="field col-span-2">
              <label>{t('field_group2')}</label>
              <SearchableGroupSelect value={form.group_id} onChange={v => setF('group_id', v)} groups={groups} placeholder={t('not_selected')}/>
            </div>
          </div>
        </Modal>
      )}

      {completing && (
        <Modal icon={I.Check} size="lg"
          onClose={() => setCompleting(null)}
          title={t('ps_complete_title')}
          subtitle={<>{nameOf(completing)} · {t('ps_complete_sub')}</>}
          footer={<>
            <button className="btn ghost" onClick={() => setCompleting(null)}>{t('cancel')}</button>
            <div style={{ flex: 1 }}/>
            {cStep > 1 && <button className="btn" onClick={() => setCStep(cStep - 1)}><I.ArrowLeft size={14}/> {t('prev')}</button>}
            {cStep < 3 && <button className="btn primary" onClick={() => setCStep(cStep + 1)}>{t('next')} <I.ArrowRight size={14}/></button>}
            {cStep === 3 && (
              <button className="btn primary" onClick={saveComplete} disabled={completeSaving}>
                <I.Check size={14}/> {completeSaving ? t('saving') : t('ps_complete_btn')}
              </button>
            )}
          </>}
        >
          <div className="stepper">
            {[t('step1_label'), t('step2_label'), t('step3_label')].map((label, i) => {
              const n = i + 1;
              const active = cStep === n;
              const done = cStep > n && cStepValid[n];
              const incomplete = cStep > n && !cStepValid[n];
              return (
                <button key={n} type="button"
                  className={'stepper-step' + (active ? ' active' : '') + (done ? ' done' : '') + (incomplete ? ' incomplete' : '')}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => setCStep(n)}>
                  <span className="step-num">{done ? <I.Check size={15} strokeWidth={2.6}/> : incomplete ? '!' : n}</span>
                  <span className="step-meta">
                    <small>{t('step_label')} {n}</small>
                    <span>{label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid-2" style={{ gap: 14, marginBottom: 18, display: cStep === 1 ? 'grid' : 'none' }}>
            <div className="field">
              <label>{t('field_first_name')}</label>
              <input value={cForm.first_name} onChange={e => setC('first_name', e.target.value)}/>
            </div>
            <div className="field">
              <label>{t('field_last_name')}</label>
              <input value={cForm.last_name} onChange={e => setC('last_name', e.target.value)}/>
            </div>
            <div className="field">
              <label>{t('field_birth_date')} <span className="req">*</span></label>
              <DateInput value={cForm.date_of_birth} onChange={v => setC('date_of_birth', v)}/>
            </div>
            <div className="field">
              <label>{t('field_group2')} <span className="req">*</span></label>
              <SearchableGroupSelect value={cForm.group_id} onChange={v => setC('group_id', v)} groups={groups} placeholder={t('not_selected')}/>
            </div>
            <div className="field">
              <label>{t('field_height')} <span className="req">*</span></label>
              <input type="number" value={cForm.height} onChange={e => setC('height', e.target.value)}/>
            </div>
            <div className="field">
              <label>{t('field_weight')} <span className="req">*</span></label>
              <input type="number" value={cForm.weight} onChange={e => setC('weight', e.target.value)}/>
            </div>
            <div className="field">
              <label>{t('field_pnfl')} <span className="req">*</span></label>
              <input value={cForm.pnfl} onChange={e => setC('pnfl', e.target.value)} placeholder={t('pnfl_placeholder')} maxLength={14}/>
            </div>
            <div className="field">
              <label>{t('field_phone')}</label>
              <input value={cForm.phone} onChange={e => setC('phone', e.target.value)} placeholder="+998901234567"/>
            </div>
            <div className="field">
              <label>{t('field_blood')}</label>
              <SearchableSelect value={cForm.ampula} onChange={v => setC('ampula', v)}
                placeholder={t('not_selected')}
                options={['O(+)', 'O(-)', 'A(+)', 'A(-)', 'B(+)', 'B(-)', 'AB(+)', 'AB(-)'].map(v => ({ value: v, label: v }))}/>
            </div>
            <div className="field">
              <label>{t('field_nationality')}</label>
              <input value={cForm.millati} onChange={e => setC('millati', e.target.value)} placeholder={t('ph_nationality')}/>
            </div>
            <div className="field col-span-2">
              <label>{t('field_address')}</label>
              <input value={cForm.address} onChange={e => setC('address', e.target.value)} placeholder={t('ph_address')}/>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 14, marginBottom: 18, display: cStep === 2 ? 'grid' : 'none' }}>
            <div className="field col-span-2">
              <label>{t('field_customer_name')} <span className="req">*</span></label>
              <input value={cForm.customer_full_name} onChange={e => setC('customer_full_name', e.target.value)} placeholder="Karimov Ravshan Akmalovich"/>
            </div>
            <div className="field">
              <label>{t('field_passport_num')} <span className="req">*</span></label>
              <input value={cForm.customer_passport_number} onChange={e => setC('customer_passport_number', e.target.value)} placeholder="AB 1234567"/>
            </div>
            <div className="field">
              <label>{t('field_address')} <span className="req">*</span></label>
              <input value={cForm.customer_address} onChange={e => setC('customer_address', e.target.value)} placeholder={t('ph_address')}/>
            </div>
            <div className="field">
              <label>{t('field_monthly_fee')} <span className="req">*</span></label>
              <input type="number" value={cForm.monthly_fee_amount} onChange={e => setC('monthly_fee_amount', e.target.value)} placeholder="500000"/>
            </div>
            <div className="field">
              <label>{t('field_uniform_fee')}</label>
              <input type="number" value={cForm.uniform_fee_amount} onChange={e => setC('uniform_fee_amount', e.target.value)} placeholder="0"/>
            </div>
            <div className="field">
              <label>{t('field_contract_start')}</label>
              {completing.initial_payment_end_date ? (
                <>
                  <input value={fmtDate(completing.initial_payment_end_date)} readOnly/>
                  <div className="hint">{t('ps_start_locked')}</div>
                </>
              ) : (
                <DateInput value={cForm.contract_start_date} onChange={v => setC('contract_start_date', v)}/>
              )}
            </div>
            <div className="field">
              <label>{t('field_contract_end')}</label>
              <DateInput value={cForm.contract_end_date} onChange={v => setC('contract_end_date', v)}/>
            </div>
          </div>

          <div style={{ display: cStep === 3 ? 'block' : 'none' }}>
            <div className="grid-3" style={{ gap: 14 }}>
              {[
                { key: 'photo', label: t('file_photo_label'), desc: t('file_photo_desc'), icon: 'Camera', accept: 'image/*' },
                { key: 'passport', label: t('file_passport_label'), desc: t('file_passport_desc'), icon: 'File', accept: '.pdf,image/*' },
                { key: 'extra_file', label: t('file_extra_label'), desc: t('file_extra_desc'), icon: 'FileText', accept: '' },
              ].map(f => {
                const Ic = I[f.icon];
                const picked = cForm[f.key];
                return (
                  <div key={f.key} className={'dropzone' + (picked ? ' filled' : '')} style={{ minHeight: 170 }}>
                    <span className="dropzone-icon">{picked ? <I.Check size={22}/> : <Ic size={22}/>}</span>
                    <div style={{ fontWeight: 750, color: 'var(--text)', fontSize: 13.5 }}>{f.label}</div>
                    <div>{picked ? picked.name : f.desc}</div>
                    <label className="btn sm" style={{ marginTop: 6, cursor: 'pointer' }}>
                      <I.Upload size={14}/> {t('upload_btn')}
                      <input type="file" style={{ display: 'none' }} accept={f.accept || undefined}
                        onChange={e => setC(f.key, e.target.files?.[0] || null)}/>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="alert success" style={{ marginTop: 14, alignItems: 'center' }}>
              <I.Check size={18}/>
              <div>
                <div style={{ fontWeight: 800 }}>{t('new_student_ready_title')}</div>
                <div style={{ fontWeight: 600, opacity: 0.85 }}>{t('ps_complete_ready')}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
