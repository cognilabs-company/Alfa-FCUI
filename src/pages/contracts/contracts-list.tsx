// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import {
  apiGetContracts,
  apiGetContract,
  apiGetContractPdf,
  apiRegenerateContractPdf,
  apiGetContractStats,
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
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  // the two tabs are the whole filter: live contracts, or the archive
  const [tab, setTab] = React.useState('active');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [archiving, setArchiving] = React.useState(null);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const PAGE_SIZE = 10;

  async function loadContracts(overrides = {}) {
    setLoading(true);
    try {
      const effTab = overrides.tab ?? tab;
      const effQuery = overrides.query ?? query;
      const params = {
        page: overrides.page ?? page,
        page_size: PAGE_SIZE,
        status: effTab === 'archived' ? 'ARCHIVED' : 'ACTIVE',
      };
      if (effQuery) params.search = effQuery;
      const [cRes, sRes] = await Promise.allSettled([
        apiGetContracts(params),
        apiGetContractStats(),
      ]);
      const cData = cRes.status === 'fulfilled' ? cRes.value : null;
      setContracts(cData?.data || []);
      setTotalPages(cData?.meta?.total_pages || 1);
      setTotalCount(cData?.meta?.total || 0);
      if (sRes.status === 'fulfilled') setStats(sRes.value?.data || null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setPage(1);
    const timer = setTimeout(() => {
      loadContracts({ page: 1, query, tab });
    }, query ? 400 : 0);
    return () => clearTimeout(timer);
  }, [query, tab]);

  // Archiving parks a contract without ending it: the status flips to ARCHIVED
  // and back to ACTIVE, so nothing is lost the way a termination would lose it.
  async function confirmArchive() {
    if (!archiving) return;
    const toArchive = tab !== 'archived';
    setArchiveBusy(true);
    try {
      await apiPatchContractStatus(archiving.id, { status: toArchive ? 'ARCHIVED' : 'ACTIVE' });
      setArchiving(null);
      onToast?.(t(toArchive ? 'toast_contract_archived' : 'toast_contract_unarchived'));
      loadContracts({ page: 1 });
      setPage(1);
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setArchiveBusy(false);
    }
  }

  const rows = contracts;

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
            { key: 'archived', label: t('status_archived'), value: Number(stats.archived) || 0, color: '#7A8B83', icon: I.Archive },
            { key: 'expired', label: t('status_cancelled'), value: Number(stats.expired) || 0, color: '#FBBF24', icon: I.Hourglass },
            // contracts terminated before archiving replaced it stay visible while any remain
            ...(Number(stats.terminated) > 0
              ? [{ key: 'terminated', label: t('status_terminated'), value: Number(stats.terminated), color: '#FF6B5E', icon: I.XCircle }]
              : []),
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
                      <i style={{ background: p.color }}/>
                      <span>{p.label}</span>
                      <b><CountUp value={p.value} duration={1400}/></b>
                      <em>{Math.round((p.value / sum) * 100)}%</em>
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
          { key: 'active', labelKey: 'status_active', icon: I.Sealed },
          { key: 'archived', labelKey: 'status_archived', icon: I.Archive },
        ].map(tb => (
          <button
            key={tb.key}
            className={tab === tb.key ? 'active' : ''}
            onClick={() => { setPage(1); setTab(tb.key); }}
          >
            <tb.icon size={16} weight={tab === tb.key ? 'fill' : 'duotone'}/> {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-toolbar">
          <div className="search">
            <span className="icon-l"><I.Search size={15} /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('contracts_search')} />
          </div>
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
                    {c.status === 'ARCHIVED' ? (
                      <button className="btn sm" onClick={() => setArchiving(c)}>
                        <I.ArrowLeft size={13} /> {t('contracts_unarchive')}
                      </button>
                    ) : c.status === 'ACTIVE' && (
                      <button className="btn sm" onClick={() => setArchiving(c)}>
                        <I.Archive size={13} /> {t('contracts_archive')}
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
          loadContracts({ page: p });
        }}/>
      </div>

      {archiving && (() => {
        const toArchive = tab !== 'archived';
        return (
          <Modal icon={I.Archive}
            size="sm"
            onClose={() => setArchiving(null)}
            title={t(toArchive ? 'contracts_archive_title' : 'contracts_unarchive_title')}
            subtitle={<>{t('nav_contracts')}: <strong>{archiving.contract_number}</strong></>}
            footer={<>
              <button className="btn ghost" onClick={() => setArchiving(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={confirmArchive} disabled={archiveBusy}>
                <I.Archive size={14} /> {t(toArchive ? 'contracts_archive' : 'contracts_unarchive')}
              </button>
            </>}
          >
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.6 }}>
              {t(toArchive ? 'contracts_archive_confirm' : 'contracts_unarchive_confirm')}
            </p>
          </Modal>
        );
      })()}
    </div>
  );
}

