// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Modal } from '@/shared/ui/modal';
import { Badge } from '@/shared/ui/status';
import { Pager, menuPosition } from '@/shared/ui/pager';
import { Stat } from '@/shared/ui/stat';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate, todayISO } from '@/shared/lib/format';
import {
  apiGetPendingStudents, apiCreatePendingStudent, apiUpdatePendingStudent,
  apiDeletePendingStudent, apiCompletePendingStudent, apiGetGroupsForSelect,
} from '@/shared/api';
import { StudentsTabs } from './students-tabs';

const PAGE_SIZE = 20;

const emptyPending = { first_name: '', last_name: '', phone: '', date_of_birth: '', document_due_date: '', note: '' };
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

  // complete
  const [completing, setCompleting] = React.useState(null);
  const [cForm, setCForm] = React.useState(emptyComplete);
  const [completeSaving, setCompleteSaving] = React.useState(false);

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
      first_name: r.first_name || '', last_name: r.last_name || '', phone: r.phone || '',
      date_of_birth: r.date_of_birth || '', document_due_date: r.document_due_date || '', note: r.note || '',
    });
    setShowForm(true);
    setOpenMenuId(null);
  }

  async function savePending() {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.document_due_date) {
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
        document_due_date: form.document_due_date,
        note: form.note.trim() || undefined,
      };
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
    setOpenMenuId(null);
    const year = new Date().getFullYear();
    setCForm({
      ...emptyComplete,
      // the pending record already knows these; the form starts from them
      first_name: r.first_name || '', last_name: r.last_name || '',
      date_of_birth: r.date_of_birth || '', phone: r.phone || '',
      contract_start_date: todayISO(), contract_end_date: `${year}-12-31`,
    });
  }

  async function saveComplete() {
    const need = ['date_of_birth', 'height', 'weight', 'pnfl', 'group_id',
      'customer_full_name', 'customer_passport_number', 'customer_address', 'monthly_fee_amount'];
    if (need.some(k => !String(cForm[k] ?? '').trim())) {
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
                    <th>{t('students_col_phone')}</th>
                    <th>{t('students_col_birth')}</th>
                    <th>{t('ps_due_label')}</th>
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
                              <span className="sub">#{String(r.id).padStart(4, '0')}</span>
                            </div>
                          </div>
                        </td>
                        <td>{r.phone || '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{r.date_of_birth ? fmtDate(r.date_of_birth) : '—'}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 700 }}>{fmtDate(r.document_due_date)}</td>
                        <td><StateBadge row={r} t={t} tp={tp}/></td>
                        <td style={{ color: 'var(--muted)', fontSize: 12.5, maxWidth: 200 }}>{r.note || '—'}</td>
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
            <button className="btn primary" onClick={saveComplete} disabled={completeSaving}>
              <I.Check size={14}/> {completeSaving ? t('saving') : t('ps_complete_btn')}
            </button>
          </>}
        >
          <div className="card-title" style={{ marginBottom: 10 }}>{t('ps_section_student')}</div>
          <div className="grid-2" style={{ gap: 14, marginBottom: 18 }}>
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

          <div className="card-title" style={{ marginBottom: 10 }}>{t('ps_section_contract')}</div>
          <div className="grid-2" style={{ gap: 14, marginBottom: 18 }}>
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
              <DateInput value={cForm.contract_start_date} onChange={v => setC('contract_start_date', v)}/>
            </div>
            <div className="field">
              <label>{t('field_contract_end')}</label>
              <DateInput value={cForm.contract_end_date} onChange={v => setC('contract_end_date', v)}/>
            </div>
          </div>

          <div className="card-title" style={{ marginBottom: 10 }}>{t('ps_section_files')}</div>
          <div className="form-row">
            <div className="field">
              <label>{t('file_photo_label')}</label>
              <input type="file" accept="image/*" onChange={e => setC('photo', e.target.files?.[0] || null)}/>
            </div>
            <div className="field">
              <label>{t('file_passport_label')}</label>
              <input type="file" accept=".pdf,image/*" onChange={e => setC('passport', e.target.files?.[0] || null)}/>
            </div>
            <div className="field">
              <label>{t('file_extra_label')}</label>
              <input type="file" onChange={e => setC('extra_file', e.target.files?.[0] || null)}/>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
