// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
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

import { fmt, fmtDate, fmtDateTime, monthLabel } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';
import { Modal, DetailGrid } from '@/shared/ui/modal';

import { statusChip } from './status-chip';

export function ContractView({ contractId, onBack, onToast, onNavigateToStudent }) {
  const I = Icon;
  const { t, tp } = useT();
  const [contract, setContract] = React.useState(null);
  const [student, setStudent] = React.useState(null);
  const [transactions, setTransactions] = React.useState([]);
  const [txLoading, setTxLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [regenerating, setRegenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // modals
  const [terminateModal, setTerminateModal] = React.useState(false);
  const [terminateReason, setTerminateReason] = React.useState('');
  const [terminateAt, setTerminateAt] = React.useState('');
  const [feeModal, setFeeModal] = React.useState(false);
  const [newFee, setNewFee] = React.useState('');
  const [datesModal, setDatesModal] = React.useState(false);
  const [datesForm, setDatesForm] = React.useState({ start_date: '', end_date: '' });
  const [editModal, setEditModal] = React.useState(false);
  const [editForm, setEditForm] = React.useState({ monthly_fee: '', customer_full_name: '', customer_passport_number: '', customer_address: '' });
  const [statusModal, setStatusModal] = React.useState(false);
  const [newStatus, setNewStatus] = React.useState('');
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef(null);

  React.useEffect(() => {
    if (!moreOpen) return;
    const close = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  async function load() {
    if (!contractId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiGetContract(contractId);
      const c = res?.data || null;
      setContract(c);
      if (c?.student_id) {
        apiGetStudent(c.student_id).then(sr => setStudent(sr?.data || null)).catch(() => {});
        setTxLoading(true);
        apiGetStudentTransactions(c.student_id)
          .then(tr => { const list = tr?.data || (Array.isArray(tr) ? tr : []); setTransactions(list); })
          .catch(() => setTransactions([]))
          .finally(() => setTxLoading(false));
      }
    } catch { }
    finally { setLoading(false); }
  }

  React.useEffect(() => { load(); }, [contractId]);

  async function openPdf() {
    try {
      const blob = await apiGetContractPdf(contractId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      notify.error(`${t('err_pdf_open')}: ${e.message}`);
    }
  }

  async function regenerate() {
    try {
      setRegenerating(true);
      await apiRegenerateContractPdf(contractId);
      await openPdf();
    } catch (e) {
      notify.error(e.message);
    } finally {
      setRegenerating(false);
    }
  }

  async function confirmTerminate() {
    if (!terminateReason.trim()) return;
    setSaving(true);
    try {
      await apiTerminateContract(contractId, {
        termination_reason: terminateReason,
        terminated_at: terminateAt ? new Date(terminateAt).toISOString() : new Date().toISOString(),
      });
      setTerminateModal(false);
      onToast?.(t('toast_contract_terminated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally { setSaving(false); }
  }

  async function saveFee() {
    if (!newFee) return;
    setSaving(true);
    try {
      await apiPatchContractMonthlyFee(contractId, { monthly_fee_amount: Number(newFee) });
      setFeeModal(false);
      onToast?.(t('toast_monthly_updated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally { setSaving(false); }
  }

  async function saveDates() {
    if (!datesForm.start_date || !datesForm.end_date) return;
    setSaving(true);
    try {
      await apiPatchContractDates(contractId, { start_date: datesForm.start_date, end_date: datesForm.end_date });
      setDatesModal(false);
      onToast?.(t('toast_dates_updated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally { setSaving(false); }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const body = {
        monthly_fee_amount: Number(editForm.monthly_fee),
        customer_full_name: editForm.customer_full_name,
        customer_passport_number: editForm.customer_passport_number,
        customer_address: editForm.customer_address,
      };
      await apiUpdateContract(contractId, body);
      setEditModal(false);
      onToast?.(t('toast_contract_updated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally { setSaving(false); }
  }

  async function saveStatus() {
    if (!newStatus) return;
    setSaving(true);
    try {
      await apiPatchContractStatus(contractId, { status: newStatus });
      setStatusModal(false);
      onToast?.(t('toast_status_updated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally { setSaving(false); }
  }

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!contract) return <div className="empty" style={{ padding: 48 }}>{t('contracts_not_found')}</div>;

  const cf = contract.custom_fields || {};
  const cust = cf.customer || {};
  const studentName = student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() : `#${contract.student_id || '—'}`;

  const openEdit = () => {
    setMoreOpen(false);
    setEditForm({
      monthly_fee: String(contract.monthly_fee_amount ?? contract.monthly_fee ?? ''),
      customer_full_name: contract.customer_full_name ?? cust.full_name ?? '',
      customer_passport_number: contract.customer_passport_number ?? cust.passport_number ?? '',
      customer_address: contract.customer_address ?? cust.address ?? '',
    });
    setEditModal(true);
  };
  const openDates = () => {
    setMoreOpen(false);
    setDatesForm({
      start_date: contract.contract_start_date ?? contract.start_date ?? '',
      end_date: contract.contract_end_date ?? contract.end_date ?? '',
    });
    setDatesModal(true);
  };
  const openStatus = () => { setMoreOpen(false); setNewStatus(contract.status); setStatusModal(true); };
  const openTerminateModal = () => {
    setMoreOpen(false);
    setTerminateReason('');
    const _n = new Date();
    _n.setMinutes(_n.getMinutes() - _n.getTimezoneOffset());
    setTerminateAt(_n.toISOString().slice(0, 16));
    setTerminateModal(true);
  };

  return (
    <div>
      <button className="btn ghost sm back-link" onClick={onBack}><I.ArrowLeft size={15} /> {t('contracts_title')}</button>
      <div className="page-head">
        <PageIcon icon={I.Scroll}/>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="page-title">{contract.contract_number}</h1>
            {statusChip(contract.status, t)}
          </div>
          <div className="page-sub">{t('contracts_detail_subtitle')}</div>
        </div>
        <div className="page-actions">
          {contract.student_id && onNavigateToStudent && (
            <button className="btn ghost" onClick={() => onNavigateToStudent(contract.student_id)}>
              <I.User size={15} /> {studentName}
            </button>
          )}
          <button className="btn" onClick={openEdit}>
            <I.Edit size={15} /> {t('edit')}
          </button>
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button className="btn" aria-haspopup="menu" aria-expanded={moreOpen} aria-label="More actions" onClick={() => setMoreOpen(o => !o)}>
              <I.More size={16} /> <I.ChevronDown size={14} />
            </button>
            {moreOpen && (
              <div className="popover" role="menu" style={{ minWidth: 240 }}>
                <button type="button" className="menu-item" onClick={openDates}>
                  <I.Calendar size={15} /> {t('contracts_change_dates_btn')}
                </button>
                {contract.status !== 'TERMINATED' && (
                  <button type="button" className="menu-item" onClick={openStatus}>
                    <I.ShieldOff size={15} /> {t('contracts_change_status_title')}
                  </button>
                )}
                <button type="button" className="menu-item" onClick={() => { setMoreOpen(false); openPdf(); }}>
                  <I.FileText size={15} /> {t('contracts_pdf_open_btn')}
                </button>
                {contract.status === 'ACTIVE' && (
                  <>
                    <div className="menu-sep" />
                    <button type="button" className="menu-item danger" onClick={openTerminateModal}>
                      <I.XCircle size={15} /> {t('contracts_cancel_modal_title')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <button className="btn primary" onClick={regenerate} disabled={regenerating}>
            <I.RefreshCw size={15} /> {regenerating ? t('loading') : t('contracts_pdf_regen_btn')}
          </button>
        </div>
      </div>

      <div className="split">
        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>{t('contracts_info_card')}</div>
          <DetailGrid items={[
            { label: t('contracts_contract_number_label'), value: contract.contract_number },
            { label: t('contracts_status'), value: statusChip(contract.status, t) },
            { label: t('contracts_student'), value: studentName },
            { label: t('contracts_client_label'), value: cust.full_name || '—' },
            { label: t('contracts_start_date'), value: fmtDate(contract.start_date) },
            { label: t('contracts_end_date'), value: fmtDate(contract.end_date) },
            { label: t('contracts_monthly_fee'), value: `${fmt.format(contract.monthly_fee || 0)} ${t('currency')}` },
            { label: t('contracts_contract_year_label'), value: contract.contract_year || '—' },
          ]} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>{t('contracts_extra_card')}</div>
          <div className="list-stack">
            {[
              [t('contracts_passport_label'), cust.passport_number || '—'],
              [t('profile_address'), cust.address || '—'],
              [t('contracts_birth_year_label'), contract.birth_year || '—'],
              [t('contracts_created'), fmtDateTime(contract.created_at)],
            ].map(([l, v]) => (
              <div key={l} className="detail-item">
                <div className="label">{l}</div>
                <div className="value">{v}</div>
              </div>
            ))}
          </div>
          {contract.termination_reason && (
            <div className="alert danger" style={{ marginTop: 10, display: 'block' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('contracts_termination_reason_label')}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', marginTop: 4 }}>{contract.termination_reason}</div>
            </div>
          )}
        </div>
      </div>

      {/* Payments & Debt section */}
      {(() => {
        // student transactions come back as SETTLED / UNASSIGNED / CANCELLED; older rows use success / completed
        const isPaid = st => ['success', 'completed', 'settled'].includes(String(st || '').toLowerCase());
        const successTx = transactions.filter(tx => isPaid(tx.status));
        const totalPaid = successTx.reduce((s, tx) => s + (tx.amount || 0), 0);
        const months = contract.start_date && contract.end_date
          ? Math.max(1, Math.round((new Date(contract.end_date) - new Date(contract.start_date)) / (1000 * 60 * 60 * 24 * 30.4)))
          : 0;
        const totalExpected = (contract.monthly_fee || 0) * months;
        const debt = Math.max(0, totalExpected - totalPaid);

        const srcLabel = s => ({ cash: t('tx_src_cash'), bank: t('tx_src_bank'), click: 'Click', payme: 'Payme' }[s] || s || '—');
        const stChip = st => {
          const s = String(st || '').toLowerCase();
          return txStatusBadge(isPaid(s) ? 'success' : s, t);
        };

        return (
          <div style={{ marginTop: 16 }}>
            <div className="grid-3" style={{ marginBottom: 16 }}>
              <Stat label={t('tx_st_success')} tone="success" icon={I.CheckCircle}
                value={totalPaid} unit={t('currency')}
                sub={`${successTx.length} ${tp('contract_payments_sfx', successTx.length)}`} />
              <Stat label={`${t('contracts_monthly_fee')} × ${months} ${t('contract_months_sfx')}`} icon={I.Wallet}
                value={totalExpected} unit={t('currency')}
                sub={t('contract_total_by')} />
              <Stat label={t('rpt_debtors_col_debt')} tone={debt > 0 ? 'danger' : 'success'} icon={debt > 0 ? I.AlertCircle : I.CheckCircle}
                value={debt} unit={t('currency')}
                sub={debt > 0 ? t('contract_debt_unpaid') : t('contract_debt_none')} />
            </div>

            <div className="table-wrap">
              <div className="table-title">
                {t('nav_transactions')} <small>({transactions.length})</small>
              </div>
              {txLoading ? (
                <div className="empty loading">{t('loading')}</div>
              ) : transactions.length === 0 ? (
                <div className="empty">{t('contract_no_payments')}</div>
              ) : (
                <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{t('tx_amount_col')}</th>
                      <th>{t('transactions_col_source')}</th>
                      <th>{t('tx_pd_label')}</th>
                      <th>{t('audit_col_created')}</th>
                      <th>{t('contracts_col_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} className="static">
                        <td className="muted num" style={{ fontWeight: 700, fontSize: 12.5 }}>#{tx.id}</td>
                        <td className="money">{fmt.format(tx.amount || 0)} {t('currency')}</td>
                        <td><span className="chip">{srcLabel(tx.source)}</span></td>
                        <td className="num" style={{ fontSize: 12.5 }}>{tx.payment_month ? `${monthLabel(Number(tx.payment_month) - 1)} ${tx.payment_year || ''}` : '—'}</td>
                        <td className="num" style={{ fontSize: 12.5 }}>{fmtDate(tx.created_at)}</td>
                        <td>{stChip(tx.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Terminate modal */}
      {terminateModal && (
        <Modal icon={I.XCircle} tone="danger"
          size="sm"
          onClose={() => setTerminateModal(false)}
          title={t('contracts_cancel_modal_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setTerminateModal(false)}>{t('cancel')}</button>
            <button className="btn danger" onClick={confirmTerminate} disabled={saving || !terminateReason.trim()}>
              {saving ? t('loading') : t('contracts_cancel_modal_title')}
            </button>
          </>}
        >
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t('contracts_cancel_reason_field')}</label>
            <textarea rows={3} value={terminateReason} onChange={e => setTerminateReason(e.target.value)} placeholder="" />
          </div>
          <div className="field">
            <label>{t('contracts_cancel_date_field')}</label>
            <DateTimeInput value={terminateAt} onChange={setTerminateAt} />
          </div>
        </Modal>
      )}

      {/* Fee modal */}
      {feeModal && (
        <Modal icon={I.Money}
          size="sm"
          onClose={() => setFeeModal(false)}
          title={t('contracts_edit_fee')}
          footer={<>
            <button className="btn ghost" onClick={() => setFeeModal(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveFee} disabled={saving || !newFee}>
              {saving ? t('saving') : t('save')}
            </button>
          </>}
        >
          <div className="field">
            <label>{t('contracts_new_fee_label')}</label>
            <input type="number" value={newFee} onChange={e => setNewFee(e.target.value)} placeholder="500000" />
          </div>
        </Modal>
      )}

      {/* Dates modal */}
      {datesModal && (
        <Modal icon={I.Calendar}
          size="sm"
          onClose={() => setDatesModal(false)}
          title={t('contracts_change_dates_btn')}
          footer={<>
            <button className="btn ghost" onClick={() => setDatesModal(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveDates} disabled={saving || !datesForm.start_date || !datesForm.end_date}>
              {saving ? t('saving') : t('save')}
            </button>
          </>}
        >
          <div className="field" style={{ marginBottom: 10 }}>
            <label>{t('contracts_start_date')} *</label>
            <DateInput value={datesForm.start_date} onChange={v => setDatesForm(f => ({ ...f, start_date: v }))} />
          </div>
          <div className="field">
            <label>{t('contracts_end_date')} *</label>
            <DateInput value={datesForm.end_date} onChange={v => setDatesForm(f => ({ ...f, end_date: v }))} />
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editModal && (
        <Modal icon={I.Edit}
          onClose={() => setEditModal(false)}
          title={t('contracts_edit_modal_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setEditModal(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveEdit} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </button>
          </>}
        >
          {[
            [t('contracts_new_fee_label'), 'monthly_fee', 'number', '500000'],
            [t('contracts_client_name_label'), 'customer_full_name', 'text', ''],
            [t('contracts_passport_no_label'), 'customer_passport_number', 'text', 'AA1234567'],
            [t('profile_address'), 'customer_address', 'text', ''],
          ].map(([label, key, type, ph]) => (
            <div className="field" key={key} style={{ marginBottom: 10 }}>
              <label>{label}</label>
              <input type={type} value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} />
            </div>
          ))}
        </Modal>
      )}

      {/* Status modal */}
      {statusModal && (
        <Modal icon={I.Sealed}
          size="sm"
          onClose={() => setStatusModal(false)}
          title={t('contracts_change_status_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setStatusModal(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveStatus} disabled={saving || !newStatus}>
              {saving ? t('saving') : t('save')}
            </button>
          </>}
        >
          <div className="field">
            <label>{t('contracts_new_status_label')}</label>
            <SearchableSelect
              value={newStatus}
              onChange={v => setNewStatus(v)}
              options={[
                { value: 'ACTIVE', label: `${t('status_active')} (ACTIVE)` },
                { value: 'EXPIRED', label: `${t('status_cancelled')} (EXPIRED)` },
                { value: 'ARCHIVED', label: `${t('status_archived')} (ARCHIVED)` },
              ]}
              style={{ width: '100%' }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Gate ────────────────────────────────────────────────────────────────────

