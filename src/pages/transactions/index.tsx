// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { txStatusBadge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
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
  apiGetGroups,
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

import { fmt, fmtDateTime, fmtMln, fmtMoneyRoll, monthLabel } from '@/shared/lib/format';
import { Pager } from '@/shared/ui/pager';
import { CountUp } from '@/shared/ui/count-up';
import { Stat } from '@/shared/ui/stat';


// 1-based month number → localized label
function monthName(n) { return monthLabel((Number(n) - 1) % 12) || String(n); }
function todayDateTimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function TransactionsScreen({ onToast } = {}) {
  const I = Icon;
  const { t, tp } = useT();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [source, setSource] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [scope, setScope] = React.useState('all');
  // Other pages can open this one pre-filtered (e.g. Reports → "today's revenue")
  const [intent] = React.useState(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem('alpha_tx_intent') || 'null');
      sessionStorage.removeItem('alpha_tx_intent');
      return v || {};
    } catch { return {}; }
  });
  const [fromDate, setFromDate] = React.useState(intent.from || '');
  const [toDate, setToDate] = React.useState(intent.to || '');
  const [paymentYear, setPaymentYear] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [stats, setStats] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [deleting, setDeleting] = React.useState(false);

  const [showManual, setShowManual] = React.useState(false);
  const [manualWithProof, setManualWithProof] = React.useState(false);
  const [manualForm, setManualForm] = React.useState({
    contract_number: '', amount: '', payment_months: [], source: 'cash',
    comment: '', payment_year: new Date().getFullYear(), paid_at: todayDateTimeLocal(), proof_file: null,
  });
  const [manualSaving, setManualSaving] = React.useState(false);
  const [manualContractMatches, setManualContractMatches] = React.useState([]);
  const [manualContractLoading, setManualContractLoading] = React.useState(false);
  const [manualContractError, setManualContractError] = React.useState('');

  const [assignTxId, setAssignTxId] = React.useState(null);
  const [assignForm, setAssignForm] = React.useState({ student_id: '', contract_id: '' });
  const [assigning, setAssigning] = React.useState(false);
  const loadedOnce = React.useRef(false);

  async function loadData() {
    setLoading(true);
    setLoadError('');
    try {
      let res;
      if (scope === 'unassigned') {
        res = await apiGetUnassignedTransactions({ page, page_size: 50 });
      } else {
        const params = { page, page_size: 50 };
        if (source) params.source = source;
        if (statusFilter) params.status = statusFilter;
        if (fromDate) params.from_date = fromDate + 'T00:00:00';
        if (toDate) params.to_date = toDate + 'T23:59:59';
        if (paymentYear) params.payment_year = Number(paymentYear);
        res = await apiGetTransactionsWithName(params);
      }
      const meta = res?.meta;
      setRows(res?.data || []);
      setTotalPages(meta?.total_pages || 1);
      setTotalCount(meta?.total || 0);
      setSelectedIds([]);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
    apiGetTransactionStats().then(r => setStats(r?.data || null)).catch(() => {});
  }

  React.useEffect(() => { loadData(); }, [scope, source, statusFilter, fromDate, toDate, paymentYear, page]);

  React.useEffect(() => {
    const query = manualForm.contract_number.trim();
    if (!showManual || query.length < 2) {
      setManualContractMatches([]);
      setManualContractError('');
      setManualContractLoading(false);
      return;
    }

    let active = true;
    setManualContractLoading(true);
    setManualContractError('');
    const timer = setTimeout(async () => {
      try {
        const res = await apiGetContracts({ search: query, page_size: 8 });
        if (!active) return;
        const contracts = res?.data || [];
        setManualContractMatches(contracts);
        const exactContract = contracts.find((contract) => String(contract.contract_number || '').toLowerCase() === query.toLowerCase());
        if (exactContract?.monthly_fee) {
          setManualForm((p) => (
            p.contract_number.trim().toLowerCase() === query.toLowerCase()
              ? { ...p, amount: String(exactContract.monthly_fee), paid_at: p.paid_at || todayDateTimeLocal() }
              : p
          ));
        }
      } catch (e) {
        if (!active) return;
        setManualContractMatches([]);
        setManualContractError(e.message || t('contracts_not_found'));
      } finally {
        if (active) setManualContractLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [showManual, manualForm.contract_number]);

  async function handleExport() {
    try {
      const blob = await apiDownloadPaymentsExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `transactions-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { onToast?.(e.message, 'error'); }
  }

  async function openDetail(id, rowData = null) {
    setDetailLoading(true);
    setDetail(rowData ? { ...rowData } : { id });
    try {
      const res = await apiGetTransaction(id);
      const tx = res?.data || null;
      if (!tx) { setDetail(null); return; }
      const merged = { ...rowData, ...tx };
      if (tx.contract_id && !merged.contract_number) {
        try {
          const cr = await apiGetContract(tx.contract_id);
          merged.contract_number = cr?.data?.contract_number || null;
        } catch {}
      }
      setDetail(merged);
    } catch (e) { setDetail(null); notify.error(`${t('err_tx_open')}: ${e.message}`); }
    finally { setDetailLoading(false); }
  }

  async function handleCancel(id) {
    if (!await confirmDialog(t('tx_cancel_action') + '?')) return;
    try {
      await apiCancelTransaction(id);
      setDetail(null); onToast?.(t('toast_tx_cancelled')); loadData();
    } catch (e) { notify.error(e.message); }
  }

  async function handleDelete(id) {
    if (!await confirmDialog(t('delete') + '?')) return;
    try {
      await apiDeleteTransaction(id);
      setDetail(null); onToast?.(t('toast_tx_deleted')); loadData();
    } catch (e) { notify.error(e.message); }
  }

  async function handleBulkDelete() {
    if (!selectedIds.length) return;
    if (!await confirmDialog(selectedIds.length + ' ' + t('delete') + '?')) return;
    setDeleting(true);
    try {
      await apiDeleteTransactionsBulk(selectedIds);
      setSelectedIds([]); onToast?.(t('toast_tx_deleted')); loadData();
    } catch (e) { notify.error(e.message); }
    finally { setDeleting(false); }
  }

  async function handleAssign() {
    if (!assignTxId || !assignForm.student_id || !assignForm.contract_id) return;
    setAssigning(true);
    try {
      await apiAssignTransaction(assignTxId, {
        student_id: Number(assignForm.student_id), contract_id: Number(assignForm.contract_id),
      });
      setAssignTxId(null); setAssignForm({ student_id: '', contract_id: '' });
      onToast?.(t('toast_tx_assigned')); loadData();
    } catch (e) { notify.error(e.message); }
    finally { setAssigning(false); }
  }

  async function submitManual() {
    if (!manualForm.contract_number || !manualForm.amount || manualForm.payment_months.length === 0) {
      onToast?.(t('toast_tx_required'), 'error'); return;
    }
    setManualSaving(true);
    try {
      if (manualWithProof && manualForm.proof_file) {
        const fd = new FormData();
        fd.append('contract_number', manualForm.contract_number);
        fd.append('source', manualForm.source);
        fd.append('amount', String(Number(manualForm.amount)));
        fd.append('payment_year', String(manualForm.payment_year));
        fd.append('payment_months', manualForm.payment_months.join(','));
        if (manualForm.comment) fd.append('comment', manualForm.comment);
        if (manualForm.paid_at) fd.append('paid_at', new Date(manualForm.paid_at).toISOString());
        fd.append('proof_file', manualForm.proof_file);
        await apiCreateManualTransactionWithProof(fd);
      } else {
        await apiCreateManualTransaction({
          contract_number: manualForm.contract_number,
          amount: Number(manualForm.amount),
          source: manualForm.source,
          payment_year: manualForm.payment_year,
          payment_months: manualForm.payment_months,
          comment: manualForm.comment || undefined,
          paid_at: manualForm.paid_at ? new Date(manualForm.paid_at).toISOString() : undefined,
        });
      }
      setShowManual(false); setManualWithProof(false);
      setManualForm({ contract_number: '', amount: '', payment_months: [], source: 'cash', comment: '', payment_year: new Date().getFullYear(), paid_at: todayDateTimeLocal(), proof_file: null });
      onToast?.(t('toast_tx_added')); loadData();
    } catch (e) { onToast?.(e.message, 'error'); }
    finally { setManualSaving(false); }
  }

  function sourceLabel(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'cash') return t('tx_src_cash');
    if (s === 'click') return 'Click';
    if (s === 'payme') return 'Payme';
    if (s === 'bank') return t('tx_src_bank');
    return String(v || '—');
  }

  function statusLabel(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'success') return { cls: 'success', text: t('tx_st_success') };
    if (s === 'pending') return { cls: 'warning', text: t('tx_st_pending') };
    if (s === 'cancelled' || s === 'failed') return { cls: 'danger', text: t('tx_st_cancelled') };
    return { cls: '', text: v || '—' };
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const pageTotal = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const colCount = scope === 'unassigned' ? 8 : 7;

  // Full-page loader only for the first fetch; filter changes keep the
  // filter bar (and any open date picker) mounted and dim the table instead.
  if (loading && !loadedOnce.current) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!loading) loadedOnce.current = true;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Wallet}/>
        <div>
          <h1 className="page-title">{t('transactions_title')}</h1>
          <div className="page-sub">{totalCount} {tp('tx_count_sfx', totalCount)} · {fmt.format(pageTotal)} {t('currency')}</div>
        </div>
        <div className="page-actions">
          {selectedIds.length > 0 && (
            <button className="btn danger-ghost" onClick={handleBulkDelete} disabled={deleting}>
              <I.Trash2 size={15} /> {t('delete')} ({selectedIds.length})
            </button>
          )}
          <button className="btn" onClick={handleExport}><I.Download size={15} /> {t('export')}</button>
          <button className="btn primary" onClick={() => { setManualForm(p => ({ ...p, paid_at: p.paid_at || todayDateTimeLocal() })); setShowManual(true); }}><I.Plus size={15} /> {t('add')}</button>
        </div>
      </div>

      {stats && (
        (() => {
          const success = Number(stats.successful_transactions) || 0;
          const click = Number(stats.click_transactions) || 0;
          const payme = Number(stats.payme_transactions) || 0;
          const other = Math.max(0, success - click - payme);
          const parts = [
            { key: 'payme', label: 'Payme', value: payme, color: '#35C4BE' },
            { key: 'click', label: 'Click', value: click, color: '#5B83FF' },
            { key: 'other', label: t('dash_other'), value: other, color: '#FBBF24' },
          ];
          const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
          return (
            <section className="summary-card">
              <div>
                <div className="s-label"><I.HandCoins size={15}/> {t('tx_stat_total_paid')}</div>
                <div className="s-big"><CountUp value={Number(stats.total_paid) || 0} format={fmtMoneyRoll} duration={1900}/></div>
                <div className="s-note">{fmt.format(stats.total_paid || 0)} {t('currency')}</div>
              </div>
              <div className="dist">
                <div className="dist-bar">
                  {parts.filter(p => p.value > 0).map((p, i) => (
                    <i key={p.key} style={{ flex: p.value / sum, background: p.color, animationDelay: `${250 + i * 140}ms` }} title={`${p.label}: ${p.value}`}/>
                  ))}
                </div>
                <div className="dist-legend">
                  {parts.map((p) => (
                    <div key={p.key}>
                      <span><i style={{ background: p.color }}/> {p.label}</span>
                      <b><CountUp value={p.value} duration={1400}/></b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="s-side">
                <div className="s-label"><I.CheckCircle size={15}/> {t('tx_stat_success_count')}</div>
                <div className="s-mid"><CountUp value={success} duration={1500}/></div>
                <div className="s-note">{t('nav_transactions')}</div>
              </div>
            </section>
          );
        })()
      )}

      <div className="toolbar filter-buttons">
        <SearchableSelect
          value={scope}
          onChange={v => { setScope(v); setPage(1); }}
          options={[{ value: 'all', label: t('tx_scope_all') }, { value: 'unassigned', label: t('tx_scope_unassigned') }]}
        />
        <SearchableSelect
          value={source}
          onChange={v => { setSource(v); setPage(1); }}
          options={[
            { value: '', label: t('tx_src_all') },
            { value: 'cash', label: t('tx_src_cash') },
            { value: 'click', label: 'Click' },
            { value: 'payme', label: 'Payme' },
            { value: 'bank', label: t('tx_src_bank') },
          ]}
        />
        <SearchableSelect
          value={statusFilter}
          onChange={v => { setStatusFilter(v); setPage(1); }}
          options={[
            { value: '', label: t('tx_st_all') },
            { value: 'success', label: t('tx_st_success') },
            { value: 'pending', label: t('tx_st_pending') },
            { value: 'cancelled', label: t('tx_st_cancelled') },
          ]}
        />
        <input className="input" type="number" placeholder={t('year_label')} value={paymentYear} onChange={e => { setPaymentYear(e.target.value); setPage(1); }} style={{ width: 96 }} />
        <DateInput value={fromDate} onChange={v => { setFromDate(v); setPage(1); }} placeholder={t('cal_from')} />
        <DateInput value={toDate} onChange={v => { setToDate(v); setPage(1); }} placeholder={t('cal_to')} />
        {(source || statusFilter || fromDate || toDate || paymentYear) && (
          <button className="btn ghost" onClick={() => { setSource(''); setStatusFilter(''); setFromDate(''); setToDate(''); setPaymentYear(''); setPage(1); }}>
            <I.X size={14} /> {t('clear_filters')}
          </button>
        )}
      </div>

      <div className={'table-wrap' + (loading ? ' is-loading' : '')}>
        <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={e => setSelectedIds(e.target.checked ? rows.map(r => r.id) : [])} />
              </th>
              <th>{t('transactions_col_date')}</th><th>{t('transactions_col_student')}</th><th>{t('transactions_col_source')}</th><th>{t('tx_months_col')}</th>
              <th style={{ textAlign: 'right' }}>{t('tx_amount_col')}</th><th>{t('transactions_col_status')}</th>
              {scope === 'unassigned' && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="static"><td colSpan={colCount} className="empty-cell" style={loadError ? { color: 'var(--danger)' } : undefined}>{loadError || t('tx_not_found_msg')}</td></tr>
            )}
            {rows.map(tx => {
              const st = statusLabel(tx.status);
              const checked = selectedIds.includes(tx.id);
              return (
                <tr key={tx.id} className={checked ? 'selected' : undefined} onClick={() => openDetail(tx.id, tx)}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={checked} onChange={e => setSelectedIds(p => e.target.checked ? [...p, tx.id] : p.filter(x => x !== tx.id))} />
                  </td>
                  <td className="num" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDateTime(tx.paid_at || tx.created_at)}</td>
                  <td style={{ fontWeight: 700 }}>{tx.student_full_name || `#${tx.student_id || '—'}`}</td>
                  <td><span className="chip">{sourceLabel(tx.source)}</span></td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{(tx.payment_months || []).map(m => monthName(m)).join(', ') || '—'}</td>
                  <td className="money" style={{ textAlign: 'right' }}>{fmt.format(tx.amount || 0)} {t('currency')}</td>
                  <td>{txStatusBadge(tx.status, t)}</td>
                  {scope === 'unassigned' && (
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn sm soft" onClick={() => setAssignTxId(tx.id)}>{t('tx_assign_btn')}</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <Pager page={page} totalPages={totalPages} onPage={setPage} total={totalCount} pageSize={50}/>
      </div>

      {/* Detail modal */}
      {detail && (
        <Modal icon={I.Receipt}
          size="lg"
          onClose={() => setDetail(null)}
          title={`${t('transactions_title')} #${detail.id}`}
          footer={!detailLoading ? (
            <>
              {detail.status !== 'cancelled' && detail.status !== 'failed' && (
                <button className="btn warning-ghost" onClick={() => handleCancel(detail.id)}>
                  <I.XCircle size={14} /> {t('tx_cancel_action')}
                </button>
              )}
              <button className="btn danger-ghost" onClick={() => handleDelete(detail.id)}>
                <I.Trash2 size={14} /> {t('delete')}
              </button>
            </>
          ) : undefined}
        >
          {detailLoading ? (
            <div className="empty loading" style={{ padding: 24 }}>{t('loading')}</div>
          ) : (
            <>
              <DetailGrid items={[
                { label: t('tx_amount_col'), value: `${fmt.format(detail.amount || 0)} ${t('currency')}` },
                { label: t('transactions_col_source'), value: sourceLabel(detail.source) },
                { label: t('transactions_col_status'), value: (
                  txStatusBadge(detail.status, t)
                ) },
                { label: t('transactions_col_date'), value: fmtDateTime(detail.paid_at || detail.created_at) },
                { label: t('tx_months_col'), value: (detail.payment_months || []).map(m => monthName(m)).join(', ') || '—' },
                { label: t('transactions_col_student'), value: detail.student_full_name || (detail.student_id ? `#${detail.student_id}` : '—') },
                { label: t('transactions_col_contract'), value: detail.contract_number || (detail.contract_id ? `#${detail.contract_id}` : '—') },
                { label: t('tx_py_label'), value: detail.payment_year || '—' },
                { label: 'External ID', value: detail.external_id || '—' },
                { label: t('tx_note_label'), value: detail.comment || '—' },
              ]} />
              {detail.settlement_document_url && (
                <div style={{ marginTop: 12 }}>
                  <a href={detail.settlement_document_url} target="_blank" rel="noopener noreferrer" className="btn soft sm">
                    <I.File size={13} /> {t('tx_view_document')}
                  </a>
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Assign modal */}
      {assignTxId && (
        <Modal icon={I.Link}
          size="sm"
          onClose={() => setAssignTxId(null)}
          title={t('tx_assign_modal')}
          footer={
            <>
              <button className="btn ghost" onClick={() => setAssignTxId(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={handleAssign} disabled={assigning}>
                {assigning ? t('tx_doing_assign') : t('tx_assign_btn')}
              </button>
            </>
          }
        >
          <div className="form-stack">
            <div className="field">
              <label>{t('tx_st_id')}</label>
              <input type="number" value={assignForm.student_id} onChange={e => setAssignForm(p => ({ ...p, student_id: e.target.value }))} placeholder={t('tx_st_id')} />
            </div>
            <div className="field">
              <label>{t('tx_ct_id')}</label>
              <input type="number" value={assignForm.contract_id} onChange={e => setAssignForm(p => ({ ...p, contract_id: e.target.value }))} placeholder={t('tx_ct_id')} />
            </div>
          </div>
        </Modal>
      )}

      {/* Manual transaction modal */}
      {showManual && (
        <Modal icon={I.HandCoins}
          onClose={() => { setShowManual(false); setManualWithProof(false); }}
          title={t('tx_manual_modal')}
          footer={
            <>
              <button className="btn ghost" onClick={() => { setShowManual(false); setManualWithProof(false); }}>{t('cancel')}</button>
              <button className="btn primary" onClick={submitManual} disabled={manualSaving}>
                {manualSaving ? t('saving') : t('tx_submit_btn')}
              </button>
            </>
          }
        >
          <label className="check-line" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={manualWithProof} onChange={e => setManualWithProof(e.target.checked)} />
            {t('tx_proof_toggle')}
          </label>
          <div className="form-row">
              <div className="field col-span-2">
                <label>{t('tx_ct_no_label')}</label>
                <input value={manualForm.contract_number} onChange={e => setManualForm(p => ({ ...p, contract_number: e.target.value }))} placeholder="1-2026" />
                {(manualContractLoading || manualContractError || manualContractMatches.length > 0 || manualForm.contract_number.trim().length >= 2) && (
                  <div className="suggest">
                    {manualContractLoading && (
                      <div className="suggest-msg">{t('tx_contract_searching')}</div>
                    )}
                    {!manualContractLoading && manualContractError && (
                      <div className="suggest-msg" style={{ color: 'var(--danger)' }}>{manualContractError}</div>
                    )}
                    {!manualContractLoading && !manualContractError && manualContractMatches.length === 0 && manualForm.contract_number.trim().length >= 2 && (
                      <div className="suggest-msg">{t('tx_contract_not_found')}</div>
                    )}
                    {!manualContractLoading && manualContractMatches.map((contract) => {
                      const customerName = contract.custom_fields?.customer?.full_name || contract.customer_full_name || '';
                      const studentName = contract.custom_fields?.student?.full_name
                        || (contract.student
                          ? `${contract.student.first_name || ''} ${contract.student.last_name || ''}`.trim()
                          : (contract.student_name || contract.full_name || ''));
                      const displayName = studentName || customerName || `${t('student_num_prefix')}${contract.student_id || '-'}`;
                      return (
                        <button
                          key={contract.id}
                          type="button"
                          onClick={() => setManualForm(p => ({
                            ...p,
                            contract_number: contract.contract_number || p.contract_number,
                            amount: String(contract.monthly_fee || ''),
                            paid_at: p.paid_at || todayDateTimeLocal(),
                          }))}
                          className="suggest-item"
                        >
                          <div className="row1">
                            <strong>{displayName}</strong>
                            <span className="chip">{contract.contract_number || '-'}</span>
                          </div>
                          <div className="row2">
                            {customerName && studentName && <span>{t('contracts_client_label')}: {customerName}</span>}
                            <span>{t('transactions_col_student')} ID: #{contract.student_id || '-'}</span>
                            <span>{fmt.format(contract.monthly_fee || 0)} {t('currency')}</span>
                            <span>{contract.status || '-'}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="field">
                <label>{t('tx_sum_label')}</label>
                <input type="number" value={manualForm.amount} onChange={e => setManualForm(p => ({ ...p, amount: e.target.value }))} placeholder="500000" />
              </div>
              <div className="field">
                <label>{t('tx_src_label')}</label>
                <SearchableSelect
                  value={manualForm.source}
                  onChange={v => setManualForm(p => ({ ...p, source: v }))}
                  options={[
                    { value: 'cash', label: t('tx_src_cash') },
                    { value: 'click', label: 'Click' },
                    { value: 'payme', label: 'Payme' },
                    { value: 'bank', label: t('tx_src_bank') },
                  ]}
                />
              </div>
              <div className="field">
                <label>{t('tx_py_label')}</label>
                <input type="number" value={manualForm.payment_year} onChange={e => setManualForm(p => ({ ...p, payment_year: Number(e.target.value) }))} />
              </div>
              <div className="field">
                <label>{t('tx_pd_label')}</label>
                <DateTimeInput value={manualForm.paid_at} onChange={v => setManualForm(p => ({ ...p, paid_at: v }))} />
              </div>
              <div className="field col-span-2">
                <label>{t('tx_months_select_label')}</label>
                <div className="choice-grid months">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                    const on = manualForm.payment_months.includes(m);
                    return (
                      <label key={m} className={'choice' + (on ? ' on' : '')} style={{ position: 'relative' }}>
                        <input type="checkbox" checked={on} onChange={e => setManualForm(p => ({ ...p, payment_months: e.target.checked ? [...p.payment_months, m] : p.payment_months.filter(x => x !== m) }))} />
                        {on && <I.Check size={13} strokeWidth={2.6}/>}
                        {monthName(m)}
                      </label>
                    );
                  })}
                </div>
                {manualForm.payment_months.length > 0 && (
                  <div className="hint">{t('tx_selected_months')}: {manualForm.payment_months.map(m => monthName(m)).join(', ')}</div>
                )}
              </div>
              <div className="field col-span-2">
                <label>{t('tx_note_label')}</label>
                <input value={manualForm.comment} onChange={e => setManualForm(p => ({ ...p, comment: e.target.value }))} placeholder={t('tx_note_label')} />
              </div>
              {manualWithProof && (
                <div className="field col-span-2">
                  <label>{t('tx_proof_label')}</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setManualForm(p => ({ ...p, proof_file: e.target.files?.[0] || null }))} />
                </div>
              )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

