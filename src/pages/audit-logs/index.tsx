// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { Badge, auditActionMeta } from '@/shared/ui/status';
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

import { fmt, fmtDate, fmtDateTime } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { Pager } from '@/shared/ui/pager';


function trOrNull(t, key) {
  const v = t(key);
  return v && v !== key ? v : null;
}

/** Compose a localized description from structured fields; raw description is the fallback. */
function describeLog(r, t) {
  const name = String(r.entity_label || (r.entity_id ? `#${r.entity_id}` : '')).trim();
  const entity = trOrNull(t, 'audit_ent_' + r.entity_type) || r.entity_type || '';
  const a = String(r.action || '').toUpperCase();
  const x = r.extra || {};
  if (a === 'LOGIN') {
    const tpl = trOrNull(t, 'audit_desc_login');
    if (tpl) return tpl.replace('{name}', name);
  }
  if (a === 'UPDATE' && r.entity_type === 'student' && x.group_name) {
    const tpl = trOrNull(t, 'audit_desc_group_change');
    if (tpl) return tpl.replace('{name}', name).replace('{group}', x.group_name);
  }
  const map = { CREATE: 'create', UPDATE: 'update', PATCH: 'update', DELETE: 'delete', CANCEL: 'cancel', TERMINATE: 'terminate' };
  const tpl = map[a] && trOrNull(t, 'audit_desc_' + map[a]);
  if (tpl && entity) return tpl.replace('{entity}', entity).replace('{name}', name);
  return r.description || '\u2014';
}

/** Known extra fields rendered as label/value rows; unknown keys are skipped here. */
function extraRows(extra, t) {
  if (!extra || typeof extra !== 'object') return [];
  const known = ['contract_number', 'group_name', 'group_id', 'topic', 'deleted_attendances'];
  return known.filter(k => extra[k] !== undefined && extra[k] !== null)
    .map(k => ({ label: trOrNull(t, 'audit_x_' + k) || k, value: String(extra[k]) }));
}

export function AuditLogsScreen() {
  const I = Icon;
  const { t, tp } = useT();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [entityType, setEntityType] = React.useState('');
  const [action, setAction] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');
  const [userFilter, setUserFilter] = React.useState('');
  const [usersList, setUsersList] = React.useState([]);
  const [detail, setDetail] = React.useState(null);

  React.useEffect(() => {
    apiGetUsers({ page_size: 200 }).then(res => setUsersList(res?.data || [])).catch(() => {});
  }, []);

  async function loadData() {
    setLoading(true);
    setLoadError('');
    try {
      const params = { page, page_size: 50 };
      if (entityType) params.entity_type = entityType;
      if (action) params.action = action;
      if (fromDate) params.from_date = fromDate + 'T00:00:00';
      if (toDate) params.to_date = toDate + 'T23:59:59';
      if (search) params.search = search;
      if (userFilter) params.user_full_name = userFilter;
      const res = await apiGetAuditLogs(params);
      setRows(res?.data || []);
      const meta = res?.meta;
      setTotalPages(meta?.total_pages || 1);
      setTotalCount(meta?.total || 0);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadData(); }, [page, entityType, action, fromDate, toDate, search, userFilter]);

  function actionChip(a) {
    const s = String(a || '').toUpperCase();
    const label = trOrNull(t, 'audit_act_' + s) || a;
    const meta = auditActionMeta(s);
    return <Badge tone={meta.tone} icon={meta.icon}>{label || '—'}</Badge>;
  }

  const hasFilters = entityType || action || fromDate || toDate || search || userFilter;


  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Shield}/>
        <div>
          <h1 className="page-title">{t('audit_title')}</h1>
          <div className="page-sub">{totalCount} {tp('audit_records_sfx', totalCount)}</div>
        </div>
      </div>

      <div className="toolbar">
        <SearchableSelect
          value={entityType}
          onChange={v => { setEntityType(v); setPage(1); }}
          options={[
            { value: '', label: `${t('all')} ${t('audit_col_entity').toLowerCase()}` },
            { value: 'student', label: t('audit_ent_student') },
            { value: 'user', label: t('audit_ent_user') },
            { value: 'contract', label: t('audit_ent_contract') },
            { value: 'session', label: t('audit_ent_session') },
            { value: 'group', label: t('audit_ent_group') },
            { value: 'transaction', label: t('audit_ent_transaction') },
            { value: 'attendance', label: t('audit_ent_attendance') },
          ]}
        />
        <SearchableSelect
          value={action}
          onChange={v => { setAction(v); setPage(1); }}
          options={[
            { value: '', label: `${t('all')} ${t('audit_col_action').toLowerCase()}` },
            { value: 'CREATE', label: t('audit_act_CREATE') },
            { value: 'UPDATE', label: t('audit_act_UPDATE') },
            { value: 'DELETE', label: t('audit_act_DELETE') },
            { value: 'LOGIN', label: t('audit_act_LOGIN') },
            { value: 'CANCEL', label: t('audit_act_CANCEL') },
            { value: 'TERMINATE', label: t('audit_act_TERMINATE') },
          ]}
        />
        <DateInput value={fromDate} onChange={v => { setFromDate(v); setPage(1); }} placeholder={t('cal_from')} />
        <DateInput value={toDate} onChange={v => { setToDate(v); setPage(1); }} placeholder={t('cal_to')} />
        <SearchableSelect
          value={userFilter}
          onChange={v => { setUserFilter(v); setPage(1); }}
          options={[
            { value: '', label: t('audit_search_user') },
            ...usersList.map(u => ({ value: u.full_name, label: u.full_name })),
          ]}
        />
        <div className="input-group">
          <input className="input" placeholder={t('audit_search_input')} value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }} style={{ width: 180 }} />
          <button className="btn" aria-label={t('audit_search_input')} onClick={() => { setSearch(searchInput); setPage(1); }}><I.Search size={15} /></button>
        </div>
        {hasFilters && (
          <button className="btn ghost" onClick={() => { setEntityType(''); setAction(''); setFromDate(''); setToDate(''); setSearch(''); setSearchInput(''); setUserFilter(''); setPage(1); }}>
            <I.X size={14} /> {t('audit_clear_btn')}
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>
      ) : (
        <div className={'card' + (loading ? ' is-loading' : '')} style={{ padding: '16px 14px', opacity: loading ? 0.6 : 1, transition: 'opacity 160ms' }}>
          {rows.length === 0 && (
            <div className="empty" style={loadError ? { color: 'var(--danger)' } : undefined}>{loadError || t('audit_not_found')}</div>
          )}
          <div className="feed">
            {(() => {
              let lastDay = '';
              return rows.map((r, i) => {
                const d = new Date(r.created_at);
                const dayKey = isNaN(d.getTime()) ? '' : fmtDate(d);
                const showDay = dayKey && dayKey !== lastDay;
                lastDay = dayKey || lastDay;
                const meta = auditActionMeta(r.action);
                const Ic = meta.icon;
                const actionLabel = trOrNull(t, 'audit_act_' + String(r.action || '').toUpperCase()) || r.action;
                const time = isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                return (
                  <React.Fragment key={r.id}>
                    {showDay && <div className="feed-day"><I.Calendar size={13}/> {dayKey}</div>}
                    <button type="button" className={'feed-item' + (detail?.id === r.id ? ' selected' : '')}
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                      onClick={() => setDetail(r)}>
                      <span className={'feed-icon ' + meta.tone}><Ic size={20} weight="duotone"/></span>
                      <div style={{ minWidth: 0 }}>
                        <div className="feed-text"><b>{r.user_full_name || `#${r.user_id || '—'}`}</b> · {describeLog(r, t)}</div>
                        <div className="feed-meta">
                          <Badge tone={meta.tone} icon={Ic}>{actionLabel}</Badge>
                          <span className="chip">{trOrNull(t, 'audit_ent_' + r.entity_type) || r.entity_type || '—'}</span>
                          {(r.entity_label || r.entity_id) && <span>{r.entity_label || `#${r.entity_id}`}</span>}
                        </div>
                      </div>
                      <span className="feed-time">{time}</span>
                    </button>
                  </React.Fragment>
                );
              });
            })()}
          </div>
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onPage={setPage} total={totalCount} pageSize={50}/>}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal icon={I.Shield} onClose={() => setDetail(null)} title={`${t('audit_title')} #${detail.id}`} size="lg">
          <DetailGrid items={[
            { label: t('audit_detail_date'), value: fmtDateTime(detail.created_at) },
            { label: t('audit_detail_user'), value: detail.user_full_name || `#${detail.user_id}` },
            { label: t('audit_detail_action'), value: actionChip(detail.action) },
            { label: t('audit_detail_entity_type'), value: trOrNull(t, 'audit_ent_' + detail.entity_type) || detail.entity_type },
            { label: t('audit_detail_entity_id'), value: detail.entity_id },
            { label: t('audit_detail_entity_name'), value: detail.entity_label },
          ]} />
          <div className="detail-item" style={{ marginTop: 10 }}>
            <div className="label">{t('audit_detail_desc')}</div>
            <div className="value" style={{ fontWeight: 500 }}>{describeLog(detail, t)}</div>
          </div>
          {extraRows(detail.extra, t).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <DetailGrid items={extraRows(detail.extra, t)} />
            </div>
          )}
          {detail.extra && (
            <div style={{ marginTop: 10 }}>
              <div className="section-label">{t('audit_detail_extra')}</div>
              <pre style={{ fontSize: 12, lineHeight: 1.55, background: 'var(--ink)', color: '#DDE5DF', padding: 14, borderRadius: 14, overflowX: 'auto', margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{typeof detail.extra === 'string' ? detail.extra : JSON.stringify(detail.extra, null, 2)}</pre>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
