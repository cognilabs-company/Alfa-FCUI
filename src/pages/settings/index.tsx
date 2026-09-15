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

import { fmt, fmtDateTime } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';
import { DetailGrid } from '@/shared/ui/modal';

export function SettingsScreen({ theme, setTheme } = {}) {
  const I = Icon;
  const { t } = useT();
  const [settings, setSettings] = React.useState({});
  const [rawSettings, setRawSettings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  // inline result banner instead of blocking alert() dialogs
  const [notice, setNotice] = React.useState(null);
  React.useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(id);
  }, [notice]);
  const [activeTab, setActiveTab] = React.useState('general');

  // admin / archive
  const [adminYear, setAdminYear] = React.useState(new Date().getFullYear());
  const [archiveStats, setArchiveStats] = React.useState(null);
  const [adminLoading, setAdminLoading] = React.useState(false);

  // backup
  const [backupStatus, setBackupStatus] = React.useState(null);
  const [backupLoading, setBackupLoading] = React.useState(false);
  const [backupRunning, setBackupRunning] = React.useState(false);
  const [backupMsg, setBackupMsg] = React.useState('');

  // import
  const [importFile, setImportFile] = React.useState(null);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState(null);

  const tabDefs = [
    { id: 'general', label: t('settings_tab_general'), icon: I.Settings },
    { id: 'billing', label: t('settings_tab_billing'), icon: I.CreditCard },
    { id: 'integrations', label: t('settings_tab_integrations'), icon: I.Link },
    { id: 'import', label: t('settings_tab_import'), icon: I.Upload },
    { id: 'backup', label: t('settings_tab_backup'), icon: I.Save },
    { id: 'admin', label: t('settings_tab_archive'), icon: I.Archive },
  ];

  React.useEffect(() => {
    Promise.allSettled([
      apiGetSettings(),
      apiGetSettingsRaw(),
    ]).then(([flatRes, rawRes]) => {
      setSettings(flatRes.status === 'fulfilled' ? (flatRes.value || {}) : {});
      setRawSettings(rawRes.status === 'fulfilled' ? (rawRes.value?.data || []) : []);
    }).finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (activeTab !== 'backup') return;
    setBackupLoading(true);
    apiGetBackupStatus()
      .then(res => setBackupStatus(res?.data || null))
      .catch(() => setBackupStatus(null))
      .finally(() => setBackupLoading(false));
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab !== 'admin') return;
    setAdminLoading(true);
    apiGetArchiveStats(adminYear)
      .then(res => setArchiveStats(res?.data || null))
      .catch(() => setArchiveStats(null))
      .finally(() => setAdminLoading(false));
  }, [activeTab, adminYear]);

  function setVal(k, v) { setSettings((p) => ({ ...p, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      await apiUpdateSettings(settings);
      setNotice({ ok: true, text: t('toast_settings_saved') });
    } catch (e) {
      setNotice({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function runBackup() {
    setBackupRunning(true);
    setBackupMsg('');
    try {
      const res = await apiTriggerManualBackup();
      setBackupMsg(res?.data?.message || t('backup_started'));
      const bRes = await apiGetBackupStatus();
      setBackupStatus(bRes?.data || null);
    } catch (e) {
      setBackupMsg(e.message);
    } finally {
      setBackupRunning(false);
    }
  }

  async function refreshBackupStatus() {
    setBackupLoading(true);
    try {
      const res = await apiGetBackupStatus();
      setBackupStatus(res?.data || null);
    } finally {
      setBackupLoading(false);
    }
  }

  async function archiveYear(action) {
    try {
      const year = Number(adminYear);
      if (!year) return;
      if (action === 'archive') await apiArchiveYear(year);
      else await apiUnarchiveYear(year);
      const aRes = await apiGetArchiveStats(year);
      setArchiveStats(aRes?.data || null);
      setNotice({ ok: true, text: action === 'archive' ? t('toast_archived') : t('toast_unarchived') });
    } catch (e) {
      setNotice({ ok: false, text: e.message });
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await apiImportStudents(fd);
      setImportResult({ ok: true, data: res?.data || res });
    } catch (e) {
      setImportResult({ ok: false, message: e.message });
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;

  const isSavingTab = ['general', 'billing', 'integrations'].includes(activeTab);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('nav_settings')}</h1>
          <div className="page-sub">{t('settings_sub')}</div>
        </div>
        <div className="page-actions">
          {isSavingTab && (
            <button className="btn primary" onClick={save} disabled={saving}>
              <I.Save size={15} /> {saving ? t('saving') : t('save')}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className={'alert ' + (notice.ok ? 'success' : 'danger')} role="status" style={{ marginBottom: 14 }}>
          {notice.ok ? <I.Check size={16}/> : <I.AlertTriangle size={16}/>} <span>{notice.text}</span>
        </div>
      )}

      <div className="settings-layout">
        <div className="card settings-nav">
          {tabDefs.map((tab) => {
            const Ic = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={'menu-item' + (active ? ' selected' : '')}>
                <Ic size={15} /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="card" style={{ padding: 22, minWidth: 0 }}>

          {activeTab === 'general' && (
            <div>
              {rawSettings.length === 0 && <div className="empty">{t('settings_no_data')}</div>}
              {rawSettings.length > 0 && (
                <div>
                  <div className="section-label">{t('settings_all_settings')}</div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>{t('settings_col_key')}</th><th>{t('settings_col_value')}</th><th>{t('settings_col_desc')}</th></tr></thead>
                      <tbody>
                        {rawSettings.map((s) => (
                          <tr key={s.id || s.key} className="static">
                            <td><span className="kbd" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 12 }}>{s.key}</span></td>
                            <td>
                              <input
                                className="input"
                                value={settings[s.key] ?? s.value ?? ''}
                                onChange={e => setVal(s.key, e.target.value)}
                                style={{ width: '100%', height: 36 }}
                              />
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="form-row">
              <div className="field"><label>{t('settings_currency')}</label><input value={settings.currency || "so'm"} onChange={(e) => setVal('currency', e.target.value)} /></div>
              <div className="field"><label>{t('settings_default_monthly')}</label><input type="number" value={settings.monthly_fee_default || settings.default_monthly_fee || ''} onChange={(e) => setVal('monthly_fee_default', Number(e.target.value))} /></div>
              <div className="field"><label>{t('settings_late_fee')}</label><input type="number" value={settings.late_fee_percent || ''} onChange={(e) => setVal('late_fee_percent', Number(e.target.value))} /></div>
              <div className="field"><label>{t('settings_report_day')}</label><input type="number" value={settings.report_day || ''} onChange={(e) => setVal('report_day', Number(e.target.value))} /></div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="form-stack">
              <div className="field"><label>Click merchant id</label><input value={settings.click_merchant_id || ''} onChange={(e) => setVal('click_merchant_id', e.target.value)} /></div>
              <div className="field"><label>Payme merchant id</label><input value={settings.payme_merchant_id || ''} onChange={(e) => setVal('payme_merchant_id', e.target.value)} /></div>
              <div className="field"><label>SMS provider token</label><input value={settings.sms_token || ''} onChange={(e) => setVal('sms_token', e.target.value)} /></div>
            </div>
          )}

          {activeTab === 'import' && (
            <div>
              <div className="card-title" style={{ marginBottom: 6 }}>{t('settings_import_title')}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 16 }}>
                {t('settings_import_desc')}
              </div>
              <div className="grid-3" style={{ gap: 8, marginBottom: 20 }}>
                {[
                  ['first_name', t('import_col_first_name'), true],
                  ['last_name', t('import_col_last_name'), true],
                  ['date_of_birth', t('import_col_birth_date'), true],
                  ['height', t('import_col_height'), true],
                  ['weight', t('import_col_weight'), true],
                  ['pnfl', t('import_col_pnfl'), true],
                  ['phone', t('import_col_phone'), false],
                  ['address', t('import_col_address'), false],
                  ['ampula', t('import_col_position'), false],
                  ['millati', t('import_col_nationality'), false],
                  ['status', t('import_col_status'), false],
                  ['group_name', t('import_col_group'), false],
                ].map(([key, label, required]) => (
                  <div key={key} className="detail-item" style={required ? { background: 'var(--accent-soft)' } : undefined}>
                    <div style={{ fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontWeight: 700, color: 'var(--text)' }}>{key}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{label}{required ? ' *' : ''}</div>
                  </div>
                ))}
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label>{t('settings_import_file_label')}</label>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }} />
              </div>
              {importFile && (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 12 }}>
                  {t('settings_import_selected')}: <strong style={{ color: 'var(--text)' }}>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
              <button className="btn primary" onClick={handleImport} disabled={!importFile || importing}>
                <I.Upload size={14} /> {importing ? t('loading') : t('settings_import_btn')}
              </button>

              {importResult && (
                <div className={'alert ' + (importResult.ok ? 'success' : 'danger')} style={{ marginTop: 16, display: 'block' }}>
                  {importResult.ok ? (
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>{t('settings_import_ok')}</div>
                      {importResult.data && typeof importResult.data === 'object' && (
                        <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
                          {importResult.data.created_count != null && <div>{t('settings_import_created')}: <strong>{importResult.data.created_count}</strong></div>}
                          {importResult.data.updated_count != null && <div>{t('settings_import_updated')}: <strong>{importResult.data.updated_count}</strong></div>}
                          {importResult.data.skipped_count != null && <div>{t('settings_import_skipped')}: <strong>{importResult.data.skipped_count}</strong></div>}
                          {importResult.data.errors?.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontWeight: 600, color: 'var(--warning)' }}>{t('settings_import_errors')}:</div>
                              {importResult.data.errors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>{e}</div>)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{importResult.message}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'backup' && (
            <div>
              <div className="card-title" style={{ marginBottom: 6 }}>{t('settings_backup_title')}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 20 }}>{t('settings_backup_desc')}</div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={runBackup} disabled={backupRunning}>
                  <I.Save size={14} /> {backupRunning ? t('settings_backup_running') : t('settings_backup_btn')}
                </button>
                <button className="btn ghost" onClick={refreshBackupStatus} disabled={backupLoading}>
                  <I.RefreshCw size={14} /> {t('settings_backup_refresh')}
                </button>
              </div>

              {backupMsg && (
                <div className="alert success" style={{ marginBottom: 16 }}>
                  {backupMsg}
                </div>
              )}

              <div className="section-label">{t('settings_backup_status_title')}</div>

              {backupLoading ? (
                <div className="empty loading">{t('loading')}</div>
              ) : backupStatus ? (
                <DetailGrid
                  items={Object.entries(backupStatus).map(([k, v]) => ({
                    label: k.replace(/_/g, ' '),
                    value: typeof v === 'boolean' ? (v ? t('yes') : t('no'))
                      : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) ? fmtDateTime(v)
                      : String(v ?? '—'),
                  }))}
                />
              ) : (
                <div className="empty">{t('settings_backup_not_found')}</div>
              )}
            </div>
          )}

          {activeTab === 'admin' && (
            <div>
              <div className="card-title" style={{ marginBottom: 16 }}>{t('settings_admin_title')}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>{t('year_label')}</label>
                  <input type="number" value={adminYear} onChange={(e) => setAdminYear(e.target.value)} style={{ width: 120 }} />
                </div>
                <button className="btn" onClick={() => archiveYear('archive')} disabled={adminLoading}>{t('settings_archive_btn')}</button>
                <button className="btn ghost" onClick={() => archiveYear('unarchive')} disabled={adminLoading}>{t('settings_unarchive_btn')}</button>
              </div>

              <div className="section-label">{t('settings_archive_stats')}</div>
              {adminLoading ? (
                <div className="empty loading">{t('loading')}</div>
              ) : archiveStats ? (
                <DetailGrid
                  items={Object.entries(archiveStats).map(([k, v]) => ({
                    label: k.replace(/_/g, ' '),
                    value: String(v ?? '—'),
                  }))}
                />
              ) : (
                <div className="empty">{t('settings_no_data')}</div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Transactions ─────────────────────────────────────────────────────────────

