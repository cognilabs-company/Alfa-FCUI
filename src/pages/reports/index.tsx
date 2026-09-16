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

import { fmt, fmtMln, fmtMoneyRoll, monthLabel, monthShort, toLocalISO, todayISO } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';
import { AnalyticsTab } from './analytics';
import { avatarColor } from '@/shared/lib/avatar';

export function ReportsScreen({ initialTab = 'dashboard', onNav } = {}) {
  const I = Icon;
  const { t, tp } = useT();
  const [tab, setTab] = React.useState(initialTab);
  const [summary, setSummary] = React.useState(null);
  const [financeReport, setFinanceReport] = React.useState(null);
  const [txStats, setTxStats] = React.useState(null);
  const [attendanceGroups, setAttendanceGroups] = React.useState([]);
  const [terminatedSummary, setTerminatedSummary] = React.useState(null);
  const [debtors, setDebtors] = React.useState([]);
  const [debtorsLoading, setDebtorsLoading] = React.useState(false);
  const [payers, setPayers] = React.useState([]);
  const [payersLoading, setPayersLoading] = React.useState(false);
  const [payersYear, setPayersYear] = React.useState(new Date().getFullYear());
  const [payersMonth, setPayersMonth] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [financeFrom, setFinanceFrom] = React.useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return toLocalISO(d);
  });
  const [financeTo, setFinanceTo] = React.useState(todayISO());
  const loadedOnce = React.useRef(false);

  React.useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      setLoadError('');
      try {
        const results = await Promise.allSettled([
          apiGetReportsSummary(),
          apiGetFinanceReport({ from_date: financeFrom, to_date: financeTo }),
          apiGetTransactionStats({ from_date: financeFrom, to_date: financeTo }),
          apiGetAttendanceGroupsReport(),
          apiGetReportsTerminatedSummary(),
        ]);

        if (!mounted) return;

        const [s, f, tx, a, t] = results;
        setSummary(s.status === 'fulfilled' ? (s.value || {}) : {});
        setFinanceReport(f.status === 'fulfilled' ? (f.value?.data || null) : null);
        setTxStats(tx.status === 'fulfilled' ? (tx.value?.data || null) : null);
        setAttendanceGroups(a.status === 'fulfilled' ? (a.value?.data || []) : []);
        setTerminatedSummary(t.status === 'fulfilled' ? (t.value?.data || null) : null);

        if (results.every((r) => r.status === 'rejected')) {
          setLoadError('rpt_load_failed');
        } else if (results.some((r) => r.status === 'rejected')) {
          setLoadError('rpt_load_partial');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [financeFrom, financeTo]);

  React.useEffect(() => {
    if (tab !== 'debtors') return;
    setDebtorsLoading(true);
    apiGetDebtors({ page_size: 100 })
      .then(res => setDebtors(res?.data || []))
      .catch(() => setDebtors([]))
      .finally(() => setDebtorsLoading(false));
  }, [tab]);

  React.useEffect(() => {
    if (tab !== 'payers') return;
    setPayersLoading(true);
    const params = { payment_year: payersYear, page_size: 100 };
    if (payersMonth) params.payment_month = payersMonth;
    apiGetPayers(params)
      .then(res => setPayers(res?.data || []))
      .catch(() => setPayers([]))
      .finally(() => setPayersLoading(false));
  }, [tab, payersYear, payersMonth]);

  // Only the first load replaces the page; changing the finance range keeps
  // the tabs and date pickers mounted.
  if (loading && !loadedOnce.current) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!loading) loadedOnce.current = true;

  const safeSummary = summary || {};

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

  async function handlePayersExport() {
    try {
      const params = { payment_year: payersYear };
      if (payersMonth) params.payment_month = payersMonth;
      const blob = await apiDownloadPayers(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payers-${payersYear}${payersMonth ? '-' + String(payersMonth).padStart(2, '0') : ''}.xlsx`;
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
            { id: 'dashboard', label: t('rpt_dashboard') },
            { id: 'analytics', label: t('rpt_analytics') },
            { id: 'finance', label: t('rpt_finance') },
            { id: 'attendance', label: t('rpt_attendance') },
            { id: 'debtors', label: t('rpt_debtors') },
            { id: 'payers', label: t('rpt_payers') },
          ].map(tb => (
            <button key={tb.id} type="button" className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>{tb.label}</button>
          ))}
        </div>
      </div>

      {loadError && <div className="alert warning" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{t(loadError)}</span></div>}

      {tab === 'dashboard' && (
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <Stat feature label={t('rpt_active_students')} value={safeSummary.active_students != null ? Number(safeSummary.active_students) : '—'} icon={I.Users}
            onClick={() => {
              // open the students list filtered to active students
              try { sessionStorage.setItem('alpha_students_filters', JSON.stringify({ q: '', status: 'active', groupId: '', page: 1 })); } catch { /* private mode */ }
              onNav?.('students');
            }} />
          <Stat label={t('rpt_today_revenue')} tone="success" icon={I.HandCoins}
            onClick={() => {
              // open transactions limited to today
              try { sessionStorage.setItem('alpha_tx_intent', JSON.stringify({ from: todayISO(), to: todayISO() })); } catch { /* private mode */ }
              onNav?.('transactions');
            }}
            value={safeSummary.today_revenue != null ? Number(safeSummary.today_revenue) : '—'} format={fmtMoneyRoll}
            sub={safeSummary.today_revenue != null ? `${fmt.format(safeSummary.today_revenue)} ${t('currency')}` : null} />
          <Stat label={t('rpt_debtors_count_lbl')} tone="danger" icon={I.AlertCircle}
            onClick={() => setTab('debtors')}
            value={safeSummary.total_debtors != null ? Number(safeSummary.total_debtors) : '—'}
            sub={(safeSummary.total_debt ?? safeSummary.total_outstanding ?? safeSummary.outstanding_debt) != null
              ? `${fmt.format(safeSummary.total_debt ?? safeSummary.total_outstanding ?? safeSummary.outstanding_debt)} ${t('currency')} ${t('rpt_total_debt')}`
              : null} />
          <Stat label={t('rpt_today_sessions')} icon={I.CalendarCheck} value={safeSummary.today_sessions != null ? Number(safeSummary.today_sessions) : '—'}
            onClick={() => onNav?.('sessions')} />
        </div>
      )}

      {tab === 'analytics' && <AnalyticsTab onNav={onNav}/>}

      {tab === 'finance' && (
        <div>
          <div className="toolbar">
            <DateInput value={financeFrom} onChange={setFinanceFrom} placeholder={t('cal_from')} />
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>—</span>
            <DateInput value={financeTo} onChange={setFinanceTo} placeholder={t('cal_to')} />
            {loading && <span className="toolbar-meta">{t('loading')}</span>}
          </div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            {[
              {
                label: t('rpt_total_income'),
                value: financeReport ? Number(financeReport.total_income ?? financeReport.total_revenue ?? 0) : (txStats ? Number(txStats.total_paid || 0) : null),
                money: true, icon: I.TrendingUp, tone: 'success',
              },
              {
                label: t('rpt_paid'),
                value: financeReport?.total_paid != null ? Number(financeReport.total_paid) : (txStats ? Number(txStats.total_paid || 0) : null),
                money: true, icon: I.CheckCircle, tone: 'info',
              },
              {
                label: t('rpt_total_debt'),
                value: financeReport?.total_debt != null ? Number(financeReport.total_debt) : null,
                money: true, icon: I.AlertCircle, tone: 'danger',
              },
              {
                label: t('rpt_success_tx'),
                value: txStats?.successful_transactions != null ? Number(txStats.successful_transactions) : null,
                icon: I.Receipt, tone: 'default',
              },
            ].map((item) => (
              <Stat key={item.label} label={item.label} icon={item.icon} tone={item.tone}
                value={item.value == null ? '—' : item.value}
                unit={item.money && item.value != null ? t('currency') : undefined}/>
            ))}
          </div>

          {financeReport ? (
            <div className="card" style={{ padding: 20 }}>
              {financeReport.breakdown && Array.isArray(financeReport.breakdown) && financeReport.breakdown.length > 0 && (
                <div>
                  <div className="section-label">{t('rpt_by_source_title')}</div>
                  <div className="report-table-scroll">
                    <table className="table compact-report-table">
                      <thead><tr><th>{t('rpt_source_col')}</th><th style={{ textAlign: 'right' }}>{t('rpt_sum_col')}</th><th style={{ textAlign: 'right' }}>{t('rpt_count_col')}</th></tr></thead>
                      <tbody>
                        {financeReport.breakdown.map((b, i) => (
                          <tr key={i}>
                            <td><span className="chip">{b.source || '—'}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.format(b.total_amount || 0)} {t('currency')}</td>
                            <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{b.transaction_count || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {financeReport.by_month && Array.isArray(financeReport.by_month) && financeReport.by_month.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="section-label">{t('rpt_by_month_title')}</div>
                  <div className="report-table-scroll">
                    <table className="table compact-report-table">
                      <thead><tr><th>{t('rpt_month_col')}</th><th style={{ textAlign: 'right' }}>{t('rpt_income_col')}</th><th style={{ textAlign: 'right' }}>{t('rpt_expected_col')}</th></tr></thead>
                      <tbody>
                        {financeReport.by_month.map((m, i) => (
                          <tr key={i}>
                            <td>{m.month || m.period}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt.format(m.income || m.total_income || m.amount || 0)} {t('currency')}</td>
                            <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt.format(m.expected || 0)} {t('currency')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card empty" style={{ padding: 48 }}>{t('rpt_finance_empty')}</div>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>{t('rpt_att_groups')}</div>
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

      {tab === 'debtors' && (
        <div>
          <div className="toolbar">
            <span className="chip danger">{debtors.length} {tp('rpt_debtors_count_sfx', debtors.length)}</span>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={handleDebtorsExport}><I.Download size={15} /> Excel</button>
          </div>
          {debtorsLoading ? (
            <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>
          ) : debtors.length === 0 ? (
            <div className="card empty" style={{ padding: 48 }}>{t('rpt_debtors_none')}</div>
          ) : (
            <div className="debt-list">
              {debtors.map((d, idx) => {
                const name = d.student_name || `#${d.student_id || idx}`;
                const months = d.overdue_months || [];
                const amount = Number(d.debt_amount) || Math.abs(Number(d.debt || d.balance) || 0);
                return (
                  <div className="debt-row" key={d.student_id || d.id || idx}>
                    <span className="avatar" style={{ background: avatarColor(Number(d.student_id) || idx) }}>
                      {name.split(/\s+/).slice(0, 2).map(w => w[0]).join('')}
                    </span>
                    <div className="debt-main">
                      <div className="name">{name}</div>
                      <div className="sub">
                        <span>{d.contract_number || '—'}</span>
                        {d.group_name && <span>{d.group_name}</span>}
                        {(d.primary_phone || d.father_phone) && <span>{d.primary_phone || d.father_phone}</span>}
                      </div>
                    </div>
                    <div className="debt-months">
                      {months.slice(0, 4).map((m, mi) => (
                        <span key={mi} className="chip danger">{m.month ? `${monthShort(Number(m.month) - 1)}${m.year ? ` ${String(m.year).slice(2)}` : ''}` : m.label}</span>
                      ))}
                      {months.length > 4 && <span className="chip">+{months.length - 4}</span>}
                      {months.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                    </div>
                    <div className="debt-amount">
                      {fmt.format(amount)} {t('currency')}
                      <small>{months.length || d.overdue_months_count || 1} {tp('an_months_overdue', months.length || 1)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'payers' && (
        <div>
          <div className="toolbar">
            <SearchableSelect
              value={String(payersYear)}
              onChange={v => setPayersYear(Number(v))}
              options={[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => ({ value: String(y), label: String(y) }))}
              style={{ minWidth: 100 }}
            />
            <SearchableSelect
              value={String(payersMonth)}
              onChange={v => setPayersMonth(v)}
              options={[
                { value: '', label: t('rpt_all_months') },
                ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthLabel(i) })),
              ]}
              style={{ minWidth: 140 }}
            />
            <span className="chip success" style={{ marginLeft: 'auto' }}>{payers.length} {tp('rpt_payers_count_sfx', payers.length)}</span>
            <button className="btn" onClick={handlePayersExport}><I.Download size={15} /> Excel</button>
          </div>
          {payersLoading ? (
            <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>
          ) : (
            <div className="table-wrap">
              <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('rpt_payers_col_student')}</th>
                    <th>{t('rpt_payers_col_contract')}</th>
                    <th>{t('rpt_payers_col_group')}</th>
                    <th>{t('rpt_payers_col_months')}</th>
                    <th style={{ textAlign: 'right' }}>{t('rpt_payers_col_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payers.length === 0 && (
                    <tr className="static"><td colSpan={5} className="empty-cell">{t('rpt_payers_none')}</td></tr>
                  )}
                  {payers.map((p, idx) => {
                    return (
                      <tr key={p.student_id || idx} className="static">
                        <td style={{ fontWeight: 750 }}>{p.student_name || `#${p.student_id}`}</td>
                        <td style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{p.contract_number || '—'}</td>
                        <td style={{ color: 'var(--text-2)' }}>{p.group_name || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(p.payment_months || []).map((m, mi) => (
                              <span key={mi} className="chip success" style={{ fontSize: 11 }}>{monthShort(Number(m) - 1) || m}</span>
                            ))}
                          </div>
                        </td>
                        <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>
                          {fmt.format(p.total_paid || 0)} {t('currency')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Waiting List ─────────────────────────────────────────────────────────────

