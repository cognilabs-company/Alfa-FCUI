// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
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

import { fmt, fmtDate, fmtMln, fmtMoneyRoll } from '@/shared/lib/format';
import { Pager } from '@/shared/ui/pager';
import { CountUp } from '@/shared/ui/count-up';
import { Stat } from '@/shared/ui/stat';
import { Modal } from '@/shared/ui/modal';

import { statusChip } from './status-chip';

// ─── Contracts ───────────────────────────────────────────────────────────────

export function ContractsScreen({ onOpenContract, onNavigateToStudent, onToast }) {
  const I = Icon;
  const { t, tp } = useT();
  const [contracts, setContracts] = React.useState([]);
  const [terminated, setTerminated] = React.useState([]);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [tab, setTab] = React.useState('active');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [terminating, setTerminating] = React.useState(null);
  const [terminateReason, setTerminateReason] = React.useState('');
  const [terminateAt, setTerminateAt] = React.useState('');
  const [terminateModal, setTerminateModal] = React.useState(false);
  const PAGE_SIZE = 10;

  async function loadActive(overrides = {}) {
    setLoading(true);
    try {
      const params = { page: overrides.page ?? page, page_size: PAGE_SIZE };
      if (overrides.query !== undefined ? overrides.query : query) params.search = overrides.query !== undefined ? overrides.query : query;
      if ((overrides.status !== undefined ? overrides.status : statusFilter) !== 'all') params.status = overrides.status !== undefined ? overrides.status : statusFilter;
      const [cRes, sRes] = await Promise.allSettled([
        apiGetContracts(params),
        apiGetContractStats(),
      ]);
      const cData = cRes.status === 'fulfilled' ? cRes.value : null;
      setContracts(cData?.data || []);
      setTotalPages(cData?.meta?.total_pages || 1);
      setTotalCount(cData?.meta?.total || 0);
      setStats(sRes.status === 'fulfilled' ? (sRes.value?.data || null) : null);
    } finally {
      setLoading(false);
    }
  }

  async function loadTerminated(overrides = {}) {
    setLoading(true);
    try {
      const res = await apiGetTerminatedContracts({ page: overrides.page ?? page, page_size: PAGE_SIZE });
      setTerminated(res?.data || []);
      setTotalPages(res?.meta?.total_pages || 1);
      setTotalCount(res?.meta?.total || 0);
    } catch {
      setTerminated([]);
      setTotalPages(1);
      setTotalCount(0);
    } finally { setLoading(false); }
  }

  React.useEffect(() => {
    apiGetContractStats().then(r => setStats(r?.data || null)).catch(() => {});
  }, []);

  React.useEffect(() => {
    setPage(1);
    if (tab === 'terminated') { loadTerminated({ page: 1 }); return; }
    const timer = setTimeout(() => {
      loadActive({ page: 1, query, status: statusFilter });
    }, query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [query, statusFilter, tab]);

  function openTerminate(contract) {
    setTerminating(contract);
    setTerminateReason('');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setTerminateAt(now.toISOString().slice(0, 16));
    setTerminateModal(true);
  }

  async function confirmTerminate() {
    if (!terminating || !terminateReason.trim()) return;
    try {
      await apiTerminateContract(terminating.id, {
        termination_reason: terminateReason,
        terminated_at: terminateAt ? new Date(terminateAt).toISOString() : new Date().toISOString(),
      });
      setTerminateModal(false);
      onToast?.(t('toast_contract_terminated'));
      loadActive({ page: 1 });
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  const rows = tab === 'terminated' ? terminated : contracts;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.FileText}/>
        <div>
          <h1 className="page-title">{t('contracts_title')}</h1>
          <div className="page-sub">{totalCount} {tp('contracts_count_sfx', totalCount)}</div>
        </div>
      </div>

      {stats && (
        (() => {
          const parts = [
            { key: 'active', label: t('status_active'), value: Number(stats.active) || 0, color: '#4ADE80', icon: I.Sealed },
            { key: 'expired', label: t('status_cancelled'), value: Number(stats.expired) || 0, color: '#FBBF24', icon: I.Hourglass },
            { key: 'terminated', label: t('status_terminated'), value: Number(stats.terminated) || 0, color: '#FF6B5E', icon: I.XCircle },
          ];
          const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
          return (
            <section className="summary-card">
              <div>
                <div className="s-label"><I.FileText size={15}/> {t('all')}</div>
                <div className="s-big"><CountUp value={Number(stats.total) || 0} duration={1400}/></div>
                <div className="s-note">{t('nav_contracts')}</div>
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
                <div className="s-label"><I.Wallet size={15}/> {t('contracts_total_monthly')}</div>
                <div className="s-mid"><CountUp value={Number(stats.total_monthly_fee) || 0} format={fmtMoneyRoll} duration={1800}/> <span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', color: 'rgba(238,242,236,0.55)' }}>{t('currency')}</span></div>
                <div className="s-note">{fmt.format(stats.total_monthly_fee || 0)} {t('currency')}</div>
              </div>
            </section>
          );
        })()
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        {[
          { key: 'active', labelKey: 'status_active' },
          { key: 'terminated', labelKey: 'status_terminated' },
        ].map(tb => (
          <button
            key={tb.key}
            className={tab === tb.key ? 'active' : ''}
            onClick={() => { setPage(1); setTab(tb.key); }}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-toolbar">
          <div className="search">
            <span className="icon-l"><I.Search size={15} /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('contracts_search')} />
          </div>
          {tab === 'active' && (
            <SearchableSelect
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              options={[
                { value: 'all', label: t('contracts_all_statuses') },
                { value: 'ACTIVE', label: t('status_active') },
                { value: 'EXPIRED', label: t('status_cancelled') },
                { value: 'ARCHIVED', label: t('status_archived') },
              ]}
            />
          )}
          <div className="toolbar-meta">{totalCount} {tp('students_results', totalCount)}</div>
        </div>

        {loading ? (
          <div className="empty loading" style={{ padding: 40 }}>{t('loading')}</div>
        ) : (
          <div className="table-scroll"><table className="table">
            <thead>
              <tr>
                <th>{t('contracts_col_number')}</th>
                <th>{t('contracts_col_student')}</th>
                <th>{t('contracts_col_start')} / {t('contracts_col_end')}</th>
                <th>{t('contracts_col_fee')}</th>
                <th>{t('contracts_col_status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="static"><td colSpan={6} className="empty-cell">{t('contracts_not_found')}</td></tr>
              )}
              {rows.map((c) => (
                <tr key={c.id} onClick={() => onOpenContract?.(c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{c.contract_number}</td>
                  <td className="student-link" onClick={c.student_id ? e => { e.stopPropagation(); onNavigateToStudent?.(c.student_id); } : undefined}
                    style={{ color: 'var(--text-2)', fontWeight: 650, ...(c.student_id && onNavigateToStudent ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-strong)', textUnderlineOffset: 3 } : {}) }}>
                    {c.customer_full_name ?? c.custom_fields?.customer?.full_name ?? '—'}
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
                    {fmtDate(c.contract_start_date ?? c.start_date)} <span style={{ color: 'var(--muted)' }}>→</span> {fmtDate(c.contract_end_date ?? c.end_date)}
                  </td>
                  <td className="money">{fmt.format(c.monthly_fee_amount ?? c.monthly_fee ?? 0)} {t('currency')}</td>
                  <td>{statusChip(c.status, t)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {c.status === 'ACTIVE' && (
                      <button className="btn sm danger-ghost" onClick={() => openTerminate(c)}>
                        <I.XCircle size={13} /> {t('contracts_terminate')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        <Pager page={page} totalPages={totalPages} total={totalCount} pageSize={PAGE_SIZE} onPage={(p) => {
          setPage(p);
          if (tab === 'terminated') loadTerminated({ page: p });
          else loadActive({ page: p });
        }}/>
      </div>

      {terminateModal && (
        <Modal icon={I.XCircle} tone="danger"
          size="sm"
          onClose={() => setTerminateModal(false)}
          title={t('contracts_terminate_title')}
          subtitle={<>{t('nav_contracts')}: <strong>{terminating?.contract_number}</strong></>}
          footer={<>
            <button className="btn ghost" onClick={() => setTerminateModal(false)}>{t('cancel')}</button>
            <button className="btn danger" onClick={confirmTerminate} disabled={!terminateReason.trim()}>
              <I.XCircle size={14} /> {t('contracts_terminate')}
            </button>
          </>}
        >
          <div className="field" style={{ marginBottom: 12 }}>
            <label>{t('contracts_termination_reason_label')} <span className="req">*</span></label>
            <textarea rows={3} value={terminateReason} onChange={e => setTerminateReason(e.target.value)} placeholder="" />
          </div>
          <div className="field">
            <label>{t('contracts_terminated_at')} *</label>
            <DateTimeInput value={terminateAt} onChange={setTerminateAt} />
          </div>
        </Modal>
      )}
    </div>
  );
}

