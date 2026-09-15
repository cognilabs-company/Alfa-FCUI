// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import {
  apiGetContracts,
  apiGetContract,
  apiGetContractPdf,
  apiRegenerateContractPdf,
  apiGetContractStats,
  apiTerminateContract,
  apiPatchContractMonthlyFee,
  apiPatchContractDates,
  apiPatchContractStatus,
  apiGetGateLogs,
  apiGetGroupsForSelect, apiGetGroups,
  apiGetUsers,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  apiUpdateUserRoles,
  apiGetRoles,
  apiCreateRole,
  apiUpdateRole,
  apiDeleteRole,
  apiGetPermissions,
  apiGetSettings,
  apiGetSettingsRaw,
  apiUpdateSettings,
  apiGetArchiveStats,
  apiArchiveYear,
  apiUnarchiveYear,
  apiTriggerManualBackup,
  apiGetBackupStatus,
  apiImportStudents,
  apiGetTransactions,
  apiGetTransactionsWithName,
  apiGetTransaction,
  apiGetUnassignedTransactions,
  apiGetTransactionStats,
  apiCreateManualTransaction,
  apiCancelTransaction,
  apiAssignTransaction,
  apiGetReportsSummary,
  apiGetAttendanceGroupsReport,
  apiGetReportsTerminatedSummary,
  apiGetDebtors,
  apiGetFinanceReport,
  apiGetPayers,
  apiDebtorsExportUrl,
  apiDownloadDebtors,
  apiDownloadPayers,
  apiPayersExportUrl,
  apiPaymentsExcelUrl,
  apiDownloadPaymentsExcel,
  apiGetWaitingList,
  apiCreateWaitingList,
  apiUpdateWaitingList,
  apiDeleteWaitingList,
  apiGetStudent,
  apiGetStudentTransactions,
  apiDeleteUsersBulk,
  apiGetTerminatedContracts,
  apiUpdateContract,
  apiDeleteTransaction,
  apiDeleteTransactionsBulk,
  apiCreateManualTransactionWithProof,
  apiGetWaitingListNext,
  apiGetAuditLogs,
} from '@/shared/api';

import { fmt, fmtDate } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { Pager } from '@/shared/ui/pager';

export function WaitingListScreen({ onToast } = {}) {
  const I = Icon;
  const { t } = useT();
  const [rows, setRows] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);

  // filters
  const [groupFilter, setGroupFilter] = React.useState('');
  const [birthYearFilter, setBirthYearFilter] = React.useState('');

  // add/edit modal
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    student_first_name: '', student_last_name: '', birth_year: '',
    father_name: '', father_phone: '', mother_name: '', mother_phone: '',
    group_id: '', priority: 0, notes: '',
  });

  // next in queue
  const [nextLoading, setNextLoading] = React.useState(false);
  const [nextEntry, setNextEntry] = React.useState(null);
  const [showNextModal, setShowNextModal] = React.useState(false);

  async function loadList(overrides = {}) {
    setLoading(true);
    try {
      const params = { page_size: 50, page, ...overrides };
      if (groupFilter) params.group_id = groupFilter;
      if (birthYearFilter) params.birth_year = birthYearFilter;
      const res = await apiGetWaitingList(params);
      setRows(res?.data || []);
      setTotalPages(res?.meta?.total_pages || 1);
      setTotalCount(res?.meta?.total || 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    apiGetGroupsForSelect().then(r => setGroups(r?.data || [])).catch(() => {});
  }, []);

  React.useEffect(() => { loadList(); }, [groupFilter, birthYearFilter, page]);

  async function loadNext() {
    if (!groupFilter) { alert(t('group_required_alert')); return; }
    setNextLoading(true);
    try {
      const res = await apiGetWaitingListNext(Number(groupFilter));
      setNextEntry(res?.data || null);
      setShowNextModal(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setNextLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setForm({ student_first_name: '', student_last_name: '', birth_year: '', father_name: '', father_phone: '', mother_name: '', mother_phone: '', group_id: groupFilter || '', priority: 0, notes: '' });
    setShowModal(true);
  }

  function openEdit(r) {
    setEditing(r);
    setForm({
      student_first_name: r.student_first_name || '', student_last_name: r.student_last_name || '',
      birth_year: r.birth_year || '', father_name: r.father_name || '', father_phone: r.father_phone || '',
      mother_name: r.mother_name || '', mother_phone: r.mother_phone || '',
      group_id: String(r.group_id || ''), priority: r.priority ?? 0, notes: r.notes || '',
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.student_first_name.trim() || !form.student_last_name.trim() || !form.birth_year) {
      onToast?.(t('toast_required'), 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        student_first_name: form.student_first_name.trim(),
        student_last_name: form.student_last_name.trim(),
        birth_year: Number(form.birth_year),
        father_name: form.father_name || undefined,
        father_phone: form.father_phone || undefined,
        mother_name: form.mother_name || undefined,
        mother_phone: form.mother_phone || undefined,
        group_id: form.group_id ? Number(form.group_id) : undefined,
        priority: Number(form.priority || 0),
        notes: form.notes || undefined,
      };
      if (editing) await apiUpdateWaitingList(editing.id, payload);
      else await apiCreateWaitingList(payload);
      onToast?.(editing ? t('toast_candidate_updated') : t('toast_candidate_added'));
      setShowModal(false);
      loadList();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm(t('delete') + '?')) return;
    try {
      await apiDeleteWaitingList(id);
      onToast?.(t('toast_candidate_deleted'));
      loadList();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  const groupMap = React.useMemo(() => {
    const m = {};
    groups.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [groups]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('waiting_title')}</h1>
          <div className="page-sub">{totalCount} {t('wl_candidates_sfx')}</div>
        </div>
        <div className="page-actions">
          {groupFilter && (
            <button className="btn ghost" onClick={loadNext} disabled={nextLoading}>
              <I.Users size={15}/> {nextLoading ? t('loading') : t('wl_next')}
            </button>
          )}
          <button className="btn primary" onClick={openNew}><I.UserPlus size={15} /> {t('waiting_new')}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="toolbar">
        <SearchableGroupSelect value={groupFilter} onChange={v => { setGroupFilter(v); setPage(1); }} groups={groups} />
        <input
          className="input"
          type="number" placeholder={t('wl_birth_year')} value={birthYearFilter}
          onChange={e => { setBirthYearFilter(e.target.value); setPage(1); }}
          style={{ width: 140 }}
        />
        {(groupFilter || birthYearFilter) && (
          <button className="btn ghost" onClick={() => { setGroupFilter(''); setBirthYearFilter(''); setPage(1); }}>
            <I.X size={14}/> {t('wl_clear')}
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>
      ) : (
        <div className={'table-wrap' + (loading ? ' is-loading' : '')}>
          <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('waiting_col_name')}</th>
                <th>{t('wl_parent')}</th>
                <th>{t('wl_birth_year')}</th>
                <th>{t('waiting_col_group')}</th>
                <th>{t('wl_priority')}</th>
                <th>{t('waiting_col_date')}</th>
                <th>{t('wl_notes')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr className="static"><td colSpan={8} className="empty-cell">{t('waiting_not_found')}</td></tr>}
              {rows.map((r) => {
                const p = Number(r.priority || 0);
                return (
                  <tr key={r.id} className="static">
                    <td style={{ fontWeight: 750 }}>{r.student_first_name} {r.student_last_name}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {(r.father_name || r.father_phone) && (
                        <div><span style={{ color: 'var(--muted)' }}>{t('wl_father_name')}:</span> {r.father_name || '—'} {r.father_phone ? `· ${r.father_phone}` : ''}</div>
                      )}
                      {(r.mother_name || r.mother_phone) && (
                        <div><span style={{ color: 'var(--muted)' }}>{t('wl_mother_name')}:</span> {r.mother_name || '—'} {r.mother_phone ? `· ${r.mother_phone}` : ''}</div>
                      )}
                      {!r.father_name && !r.father_phone && !r.mother_name && !r.mother_phone && <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.birth_year || '—'}</td>
                    <td>{groupMap[r.group_id] || (r.group_id ? `#${r.group_id}` : '—')}</td>
                    <td>
                      <span className={'chip' + (p >= 8 ? ' danger' : p >= 4 ? ' warning' : ' success')} style={{ minWidth: 30, justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                        {p}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12.5, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="icon-btn plain" title={t('edit')} aria-label={t('edit')} onClick={() => openEdit(r)}><I.Edit size={15} /></button>
                        <button className="icon-btn plain danger" title={t('delete')} aria-label={t('delete')} onClick={() => remove(r.id)}><I.Trash size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onPage={setPage} total={totalCount} pageSize={50}/>}
        </div>
      )}

      {/* Next in queue modal */}
      {showNextModal && (
        <Modal
          onClose={() => setShowNextModal(false)}
          title={`${t('wl_next_modal_title')} — ${groupMap[groupFilter] || `${t('nav_groups')} #${groupFilter}`}`}
          footer={nextEntry ? (
            <>
              <button className="btn ghost" onClick={() => { setShowNextModal(false); openEdit(nextEntry); }}>
                <I.Edit size={13}/> {t('edit')}
              </button>
              <button className="btn danger-ghost" onClick={() => { setShowNextModal(false); remove(nextEntry.id); }}>
                <I.Trash size={13}/> {t('delete')}
              </button>
            </>
          ) : undefined}
        >
          {nextEntry ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="stat feature">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--accent)', letterSpacing: '-0.02em' }}>{nextEntry.student_first_name} {nextEntry.student_last_name}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(238,242,236,0.72)' }}>{t('wl_birth_year')}: {nextEntry.birth_year || '—'} · {t('wl_priority')}: <strong>{nextEntry.priority ?? 0}</strong></div>
              </div>
              <DetailGrid items={[
                nextEntry.father_name && {
                  label: t('wl_father_name'),
                  value: <>{nextEntry.father_name}{nextEntry.father_phone && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>{nextEntry.father_phone}</div>}</>,
                },
                nextEntry.mother_name && {
                  label: t('wl_mother_name'),
                  value: <>{nextEntry.mother_name}{nextEntry.mother_phone && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>{nextEntry.mother_phone}</div>}</>,
                },
                nextEntry.notes && { label: t('wl_notes'), value: nextEntry.notes },
                { label: t('wl_added_date'), value: fmtDate(nextEntry.created_at) },
              ]} />
            </div>
          ) : (
            <div className="empty" style={{ padding: 24 }}>{t('wl_empty_queue')}</div>
          )}
        </Modal>
      )}

      {/* Add/edit modal */}
      {showModal && (
        <Modal
          onClose={() => setShowModal(false)}
          title={editing ? t('wl_edit_candidate') : t('wl_new_candidate')}
          size="lg"
          footer={(
            <>
              <button className="btn ghost" onClick={() => setShowModal(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={save} disabled={saving}><I.Check size={14} /> {saving ? t('saving') : t('save')}</button>
            </>
          )}
        >
          <div className="form-row">
            <div className="field"><label>{t('wl_first_name_req')}</label><input value={form.student_first_name} onChange={(e) => setForm((p) => ({ ...p, student_first_name: e.target.value }))} /></div>
            <div className="field"><label>{t('wl_last_name_req')}</label><input value={form.student_last_name} onChange={(e) => setForm((p) => ({ ...p, student_last_name: e.target.value }))} /></div>
            <div className="field"><label>{t('wl_birth_year_req')}</label><input type="number" min={2000} max={2020} value={form.birth_year} onChange={(e) => setForm((p) => ({ ...p, birth_year: e.target.value }))} placeholder="2010" /></div>
            <div className="field"><label>{t('nav_groups')}</label>
              <SearchableGroupSelect value={form.group_id} onChange={v => setForm(p => ({ ...p, group_id: v }))} groups={groups} placeholder={t('all')} />
            </div>
            <div className="field"><label>{t('wl_father_name')}</label><input value={form.father_name} onChange={(e) => setForm((p) => ({ ...p, father_name: e.target.value }))} /></div>
            <div className="field"><label>{t('wl_father_phone')}</label><input value={form.father_phone} onChange={(e) => setForm((p) => ({ ...p, father_phone: e.target.value }))} placeholder="+998..." /></div>
            <div className="field"><label>{t('wl_mother_name')}</label><input value={form.mother_name} onChange={(e) => setForm((p) => ({ ...p, mother_name: e.target.value }))} /></div>
            <div className="field"><label>{t('wl_mother_phone')}</label><input value={form.mother_phone} onChange={(e) => setForm((p) => ({ ...p, mother_phone: e.target.value }))} placeholder="+998..." /></div>
            <div className="field"><label>{t('wl_priority_label')}</label><input type="number" min={0} max={100} value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} /></div>
            <div className="field col-span-2"><label>{t('wl_notes_label')}</label><textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

