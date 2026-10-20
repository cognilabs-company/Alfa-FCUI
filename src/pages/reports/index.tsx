// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
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
  apiGetGroupsForSelect,
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

import { paymentSourceLabel } from '@/shared/lib/labels';
import { AnalyticsTab } from './analytics';
import { LedgerTab } from './ledger';
import { StudentPaymentsTab } from './student-payments';
import { avatarColor } from '@/shared/lib/avatar';

export function ReportsScreen({ initialTab = 'ledger', onNav } = {}) {
  const I = Icon;
  const { t } = useT();
  // Debtors and payers live in "To'lovlar" now, the dashboard and finance
  // figures in "Moliya", the profit trend in "Analitika" — links to the old
  // tabs land on their new home.
  const legacy = { debtors: ['student-payments', 'unpaid'], payers: ['student-payments', 'paid'], dashboard: ['ledger'], finance: ['ledger'], profit: ['analytics'] };
  const [tab, setTab] = React.useState(() => legacy[initialTab]?.[0] || initialTab);
  const spInitialStatus = legacy[initialTab]?.[1] || 'all';
  const [attendanceGroups, setAttendanceGroups] = React.useState([]);
  const [attFrom, setAttFrom] = React.useState('');
  const [attTo, setAttTo] = React.useState('');
  const [groups, setGroups] = React.useState([]);

  React.useEffect(() => {
    apiGetGroupsForSelect().then(r => setGroups(r?.data || [])).catch(() => {});
  }, []);

  // Attendance report follows its own date range (all time by default).
  React.useEffect(() => {
    if (tab !== 'attendance') return;
    const params = {};
    if (attFrom) params.from_date = attFrom;
    if (attTo) params.to_date = attTo;
    apiGetAttendanceGroupsReport(params)
      .then(res => setAttendanceGroups(res?.data || []))
      .catch(() => setAttendanceGroups([]));
  }, [tab, attFrom, attTo]);

  async function handleExcel() {
    try {
      const blob = await apiDownloadPaymentsExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      notify.error(`${t('groups_export_error')}: ${e.message}`);
    }
  }
  async function handleDebtorsExport() {
    try {
      const blob = await apiDownloadDebtors();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debtors-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      notify.error(`${t('groups_export_error')}: ${e.message}`);
    }
  }

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Reports}/>
        <div>
          <h1 className="page-title">{t('nav_reports')}</h1>
          <div className="page-sub">{t('rpt_subtitle')}</div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={handleDebtorsExport}><I.Download size={15} /> {t('rpt_debtors')}</button>
          <button className="btn" onClick={handleExcel}><I.Download size={15} /> Excel</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tabs">
          {[
            { id: 'ledger', label: t('lg_tab') },
            { id: 'analytics', label: t('rpt_analytics') },
            { id: 'student-payments', label: t('sp_tab') },
            { id: 'attendance', label: t('rpt_attendance') },
          ].map(tb => (
            <button key={tb.id} type="button" className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>{tb.label}</button>
          ))}
        </div>
      </div>

      {tab === 'ledger' && <LedgerTab onNav={onNav}/>}

      {tab === 'analytics' && <AnalyticsTab onNav={onNav}/>}

      {tab === 'student-payments' && <StudentPaymentsTab groups={groups} initialStatus={spInitialStatus}/>}

      {tab === 'attendance' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <div className="card-title">{t('rpt_att_groups')}</div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <DateInput value={attFrom} onChange={setAttFrom} placeholder={t('cal_from')} />
              <DateInput value={attTo} onChange={setAttTo} placeholder={t('cal_to')} />
              {(attFrom || attTo) && <button className="btn ghost" onClick={() => { setAttFrom(''); setAttTo(''); }}><I.X size={14} /> {t('clear_filters')}</button>}
            </div>
          </div>
          {attendanceGroups.length === 0 ? (
            <div className="empty" style={{ padding: 18 }}>{t('rpt_att_not_found')}</div>
          ) : (
            <div className="grid-cards" style={{ gap: 12 }}>
              {attendanceGroups.map((g) => (
                <div key={g.group_id || g.id} className="detail-item" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.group_name}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{g.attendance_percentage || g.attendance_rate || 0}%</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', margin: '4px 0 12px' }}>
                    {g.total_sessions} {t('nav_sessions').toLowerCase()} · {g.total_students} {t('nav_students').toLowerCase()}
                  </div>
                  {(() => {
                    const pct = Number(g.attendance_percentage || g.attendance_rate || 0);
                    return (
                      <div className={'progress' + (pct < 60 ? ' red' : pct < 80 ? ' gold' : ' green')}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}


    </div>
  );
}

// ─── Waiting List ─────────────────────────────────────────────────────────────

