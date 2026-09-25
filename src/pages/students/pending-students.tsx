// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Modal } from '@/shared/ui/modal';
import { Badge } from '@/shared/ui/status';
import { Pager, menuPosition } from '@/shared/ui/pager';
import { Stat } from '@/shared/ui/stat';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmt, fmtDate, todayISO, toLocalISO } from '@/shared/lib/format';
import {
  apiGetPendingStudents, apiCreatePendingStudent, apiUpdatePendingStudent,
  apiDeletePendingStudent, apiCompletePendingStudent, apiSupportsPendingProrated,
  apiGetGroupsForSelect,
} from '@/shared/api';
import { StudentsTabs } from './students-tabs';

const PAGE_SIZE = 20;

/** First day of the month after the given date — where a short first period naturally ends. */
function firstOfNextMonth(iso = todayISO()) {
  const [y, m] = String(iso).split('-').map(Number);
  if (!y || !m) return todayISO();
  return toLocalISO(new Date(y, m, 1));
}

const emptyPending = {
  first_name: '', last_name: '', phone: '', date_of_birth: '', document_due_date: '', note: '',
  initial_payment_amount: '',
  initial_payment_start_date: todayISO(),
  initial_payment_end_date: firstOfNextMonth(),
  initial_payment_source: 'cash',
  initial_payment_paid_at: '',
  initial_payment_comment: '',
};
const emptyComplete = {
  first_name: '', last_name: '', date_of_birth: '', height: '', weight: '',
  ampula: '', millati: '', pnfl: '', phone: '', address: '', group_id: '',
  customer_full_name: '', customer_passport_number: '', customer_address: '',
  monthly_fee_amount: '', uniform_fee_amount: '', contract_start_date: '', contract_end_date: '',
  photo: null, passport: null, extra_file: null,
};

/**
 * How close the deadline is. The backend sends days_until_due / is_overdue;
 * both are recomputed from the date when they are missing so the badge never
 * goes blank on an older response.
 */
function dueState(row) {
  if (row.converted_at || row.converted_student_id) return { key: 'done', tone: 'success' };
  let days = row.days_until_due;
  if (days == null && row.document_due_date) {
    const due = new Date(row.document_due_date + 'T00:00:00');
    const now = new Date();
    days = Math.round((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  }
  if (days == null) return { key: 'ontime', tone: 'neutral', days: null };
  if (days < 0 || row.is_overdue) return { key: 'overdue', tone: 'danger', days };
  if (days === 0) return { key: 'today', tone: 'warning', days };
  if (days <= 2) return { key: 'soon', tone: days === 1 ? 'warning' : 'info', days };
  return { key: 'ontime', tone: 'neutral', days };
}

function StateBadge({ row, t, tp }) {
  const I = Icon;
  const s = dueState(row);
  if (s.key === 'done') return <Badge tone="success" icon={I.CheckCircle}>{t('ps_state_done')}</Badge>;
  if (s.key === 'overdue') return <Badge tone="danger" icon={I.AlertCircle}>{t('ps_state_overdue')}</Badge>;
  if (s.key === 'today') return <Badge tone="warning" icon={I.Clock}>{t('ps_state_today')}</Badge>;
  if (s.key === 'soon') return <Badge tone={s.tone} icon={I.Clock}>{tp('ps_state_days_left', s.days)}</Badge>;
  return <Badge tone="neutral" icon={I.Calendar}>{t('ps_state_ontime')}</Badge>;
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
  const [fromDue, setFromDue] = React.useState('');
  const [toDue, setToDue] = React.useState('');
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [withDone, setWithDone] = React.useState(false);

  // create / edit
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(emptyPending);
  const [saving, setSaving] = React.useState(false);
  // Short first payment: a child joining mid-month pays for the part-month at
  // the door, long before the documents (and so the contract) exist.
  const [proratedSupported, setProratedSupported] = React.useState(false);
  // the payment is simply left empty when there is none — no switch to remember
  const usingProrated = proratedSupported && Number(form.initial_payment_amount) > 0;

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
      if (fromDue) params.from_due_date = fromDue;
      if (toDue) params.to_due_date = toDue;
      if (overdueOnly) params.overdue_only = true;
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
    apiSupportsPendingProrated().then(setProratedSupported).catch(() => setProratedSupported(false));
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => { setPage(1); load({ page: 1 }); }, q ? 400 : 0);
    return () => clearTimeout(timer);
  }, [q, fromDue, toDue, overdueOnly, withDone]);

  React.useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Counted from the page in hand; the guide leaves a stats endpoint for later.
  const summary = React.useMemo(() => {
    const s = { today: 0, soon: 0, overdue: 0 };
    for (const r of rows) {
      const d = dueState(r);
      if (d.key === 'today') s.today++;
      else if (d.key === 'soon') s.soon++;
      else if (d.key === 'overdue') s.overdue++;
    }
    return s;
  }, [rows]);

  const nameOf = (r) => `${r.first_name || ''} ${r.last_name || ''}`.trim() || `#${r.id}`;
  const isDone = (r) => !!(r.converted_at || r.converted_student_id);

  function openNew() {
    setEditing(null);
    setForm(emptyPending);
    setShowForm(true);
  }

  function openEdit(r) {
    setEditing(r);
    setForm({
      ...emptyPending,
      first_name: r.first_name || '', last_name: r.last_name || '', phone: r.phone || '',
      date_of_birth: r.date_of_birth || '', document_due_date: r.document_due_date || '', note: r.note || '',
    });
    // the payment is taken once, when the record is opened
    setShowForm(true);
    setOpenMenuId(null);
  }

  async function savePending() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.document_due_date) {
      notify.error(t('toast_required'));
      return;
    }
    // an amount that is filled in but not a real one would go out as nothing
    const typedAmount = String(form.initial_payment_amount ?? '').trim();
    if (typedAmount && !(Number(typedAmount) > 0)) { notify.error(t('prorated_err_amount')); return; }
    if (usingProrated && (!form.initial_payment_end_date || form.initial_payment_end_date <= form.initial_payment_start_date)) {
      notify.error(t('prorated_err_dates')); return;
    }
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || undefined,
        date_of_birth: form.date_of_birth || undefined,
        document_due_date: form.document_due_date,
        note: form.note.trim() || undefined,
      };
      if (usingProrated) {
        payload.initial_payment_amount = Number(form.initial_payment_amount);
        payload.initial_payment_start_date = form.initial_payment_start_date;
        payload.initial_payment_end_date = form.initial_payment_end_date;
        payload.initial_payment_source = form.initial_payment_source || 'cash';
        if (form.initial_payment_paid_at) payload.initial_payment_paid_at = form.initial_payment_paid_at;
        if (form.initial_payment_comment) payload.initial_payment_comment = form.initial_payment_comment;
      }
      if (editing) await apiUpdatePendingStudent(editing.id, payload);
      else await apiCreatePendingStudent(payload);
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
      onToast?.(t('ps_deleted'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  function openComplete(r) {
    setCompleting(r);
    setCStep(1);
    setOpenMenuId(null);
    const year = new Date().getFullYear();
    setCForm({
      ...emptyComplete,
      // the pending record already knows these; the form starts from them
      first_name: r.first_name || '', last_name: r.last_name || '',
      date_of_birth: r.date_of_birth || '', phone: r.phone || '',
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

  const hasFilters = q || fromDue || toDue || overdueOnly || withDone;

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
        <>
          <div className="grid-4" style={{ marginBottom: 14 }}>
            <Stat feature label={t('total')} value={totalCount} icon={I.Clipboard}/>
            <Stat label={t('ps_sum_today')} value={summary.today} tone="warning" icon={I.Clock}/>
            <Stat label={t('ps_sum_soon')} value={summary.soon} tone="info" icon={I.Calendar}/>
            <Stat label={t('ps_sum_overdue')} value={summary.overdue} tone="danger" icon={I.AlertCircle}/>
          </div>

          <div className="table-wrap">
            <div className="table-toolbar">
              <div className="search">
                <span className="icon-l"><I.Search size={15}/></span>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('students_search')}/>
              </div>
              <DateInput value={fromDue} onChange={setFromDue} placeholder={t('cal_from')}/>
              <DateInput value={toDue} onChange={setToDue} placeholder={t('cal_to')}/>
              <label className="check-line">
                <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)}/>
                {t('ps_only_overdue')}
              </label>
              <label className="check-line">
                <input type="checkbox" checked={withDone} onChange={e => setWithDone(e.target.checked)}/>
                {t('ps_with_done')}
              </label>
              {hasFilters && (
                <button className="btn ghost sm" onClick={() => { setQ(''); setFromDue(''); setToDue(''); setOverdueOnly(false); setWithDone(false); }}>
                  <I.X size={14}/> {t('clear_filters')}
                </button>
              )}
              <div className="toolbar-meta">{totalCount} {tp('ps_count_sfx', totalCount)}</div>
            </div>

            {loading && rows.length === 0 ? (
              <div className="empty loading" style={{ padding: 40 }}>{t('loading')}</div>
            ) : (
              <div className="table-scroll"><table className="table">
                <thead>
                  <tr>
                    <th>{t('students_col_name')}</th>
                    <th>{t('students_col_birth')}</th>
                    <th>{t('ps_col_due')}</th>
                    <th>{t('ps_col_initial')}</th>
                    <th>{t('students_col_status')}</th>
                    <th>{t('field_comment')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr className="static"><td colSpan={7} className="empty-cell">{t('ps_empty')}</td></tr>
                  )}
                  {rows.map(r => {
                    const done = isDone(r);
                    return (
                      <tr key={r.id} className="static">
                        <td>
                          <div className="row-name">
                            <div className="avatar" style={{ background: avatarColor(r.id) }}>
                              {(r.first_name || '?')[0]}{(r.last_name || '')[0]}
                            </div>
                            <div className="meta">
                              <span className="name">{nameOf(r)}</span>
                              {/* the phone rides under the name; a column of its own pushed
                                  the "complete" button past the edge of the card */}
                              <span className="sub">{r.phone || '—'}</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{r.date_of_birth ? fmtDate(r.date_of_birth) : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 700 }}>{fmtDate(r.document_due_date)}</td>
                        <td>
                          {Number(r.initial_payment_amount) > 0 ? (
                            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.35 }}>
                              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt.format(Number(r.initial_payment_amount))} {t('currency')}</b>
                              {r.initial_payment_end_date && (
                                <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                                  {fmtDate(r.initial_payment_start_date)} → {fmtDate(r.initial_payment_end_date)}
                                </span>
                              )}
                            </span>
                          ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        <td><StateBadge row={r} t={t} tp={tp}/></td>
                        <td className="cell-note" title={r.note || ''}>{r.note || '—'}</td>
                        <td>
                          {canEdit && !done && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                              <button className="btn sm primary" onClick={() => openComplete(r)}>
                                <I.Check size={13}/> {t('ps_complete')}
                              </button>
                              <div style={{ position: 'relative' }}>
                                <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => {
                                  e.stopPropagation();
                                  if (openMenuId === r.id) { setOpenMenuId(null); return; }
                                  setMenuPos(menuPosition(e.currentTarget, 2));
                                  setOpenMenuId(r.id);
                                }}>
                                  <I.More size={16}/>
                                </button>
                                {openMenuId === r.id && (
                                  <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                                    <button className="menu-item" onClick={() => openEdit(r)}><I.Edit size={14}/> {t('edit')}</button>
                                    <button className="menu-item danger" onClick={() => remove(r)}><I.Trash2 size={14}/> {t('delete')}</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {done && r.converted_student_id && onOpenStudent && (
                            <button className="btn sm ghost" onClick={() => onOpenStudent(r.converted_student_id)}>
                              <I.ArrowUpRight size={13}/> {t('view')}
                            </button>
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
        </>
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
              <label>{t('ps_due_label')} <span className="req">*</span></label>
              <DateInput value={form.document_due_date} onChange={v => setF('document_due_date', v)}/>
            </div>
            <div className="field col-span-2">
              <label>{t('field_comment')}</label>
              <textarea rows={2} value={form.note} onChange={e => setF('note', e.target.value)} placeholder={t('ps_note_ph')}/>
            </div>

            {!editing && proratedSupported && (
              <div className="col-span-2">
                <div className="card-title" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <I.HandCoins size={16}/> {t('prorated_toggle')}
                </div>
                <div className="hint" style={{ marginBottom: 12 }}>{t('prorated_hint_pending')}</div>

                {(
                  <div className="grid-2" style={{ gap: 14 }}>
                    <div className="field">
                      <label>{t('prorated_amount')}</label>
                      <input type="number" min="1" value={form.initial_payment_amount}
                        onChange={e => setF('initial_payment_amount', e.target.value)} placeholder="150000"/>
                    </div>
                    <div className="field">
                      <label>{t('prorated_source')}</label>
                      <SearchableSelect value={form.initial_payment_source} onChange={v => setF('initial_payment_source', v)}
                        options={[
                          { value: 'cash', label: t('tx_src_cash') },
                          { value: 'payme', label: 'Payme' },
                          { value: 'click', label: 'Click' },
                          { value: 'bank', label: t('tx_src_bank') },
                        ]}/>
                    </div>
                    <div className="field">
                      <label>{t('prorated_start')}</label>
                      <DateInput value={form.initial_payment_start_date} onChange={v => {
                        setF('initial_payment_start_date', v);
                        if (!form.initial_payment_end_date || form.initial_payment_end_date <= v) setF('initial_payment_end_date', firstOfNextMonth(v));
                      }}/>
                    </div>
                    <div className="field">
                      <label>{t('prorated_end')} <span className="req">*</span></label>
                      <DateInput value={form.initial_payment_end_date} onChange={v => setF('initial_payment_end_date', v)}/>
                    </div>
                    <div className="field">
                      <label>{t('prorated_paid_at')}</label>
                      <DateTimeInput value={form.initial_payment_paid_at} onChange={v => setF('initial_payment_paid_at', v)}/>
                    </div>
                    <div className="field">
                      <label>{t('field_comment')}</label>
                      <input value={form.initial_payment_comment} onChange={e => setF('initial_payment_comment', e.target.value)}/>
                    </div>
                    {Number(form.initial_payment_amount) > 0 && (
                      <div className="alert info col-span-2" style={{ margin: 0 }}>
                        <I.Calendar size={16}/>
                        <span>{t('prorated_contract_auto').replace('{date}', fmtDate(form.initial_payment_end_date))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
