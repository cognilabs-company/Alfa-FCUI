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
import { AttendanceTab } from './attendance';
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
  const [groups, setGroups] = React.useState([]);

  React.useEffect(() => {
    apiGetGroupsForSelect().then(r => setGroups(r?.data || [])).catch(() => {});
  }, []);

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

      {tab === 'attendance' && <AttendanceTab/>}


    </div>
  );
}

// ─── Waiting List ─────────────────────────────────────────────────────────────

