// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import {
  apiGetStudents, apiGetStudentFullInfo, apiGetStudentTransactions, apiGetStudentGateLogs,
  apiGetGroupsForSelect, apiGetGroups, apiCreateStudent, apiDownloadStudentsComprehensiveExport,
  apiGetStudentAttendanceReport, apiUpdateStudent,
  apiDeleteStudent, apiDeleteStudentsBulk, apiHardDeleteStudent,
  apiUploadStudentPhoto, apiUploadStudentPassport, apiUploadStudentExtraFile,
  apiContractPdfUrl, apiGetContractPdf, apiDownloadStudentFile,
  apiChangeStudentGroup, apiGetContracts, apiGetStudent,
} from '@/shared/api';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Pager, menuPosition } from '@/shared/ui/pager';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { studentStatusBadge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate } from '@/shared/lib/format';
import { calcAge, fullName, normalizeStatus } from './lib';

// Filters survive navigating into a student profile and back (the list
// unmounts on route change, so plain state would reset them).
const FILTERS_KEY = 'alpha_students_filters';
function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY)) || {}; } catch { return {}; }
}

export function StudentsList({ onOpen, onNew, onToast }) {
  const I = Icon;
  const { t } = useT();
  const [students, setStudents] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState(() => loadSavedFilters().q || '');
  const [status, setStatus] = React.useState(() => loadSavedFilters().status || 'all');
  const [groupId, setGroupId] = React.useState(() => loadSavedFilters().groupId || '');
  const [selected, setSelected] = React.useState([]);
  const [page, setPage] = React.useState(() => loadSavedFilters().page || 1);

  React.useEffect(() => {
    try { sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ q, status, groupId, page })); } catch { /* private mode */ }
  }, [q, status, groupId, page]);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalCount, setTotalCount] = React.useState(0);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [openMenuStudentId, setOpenMenuStudentId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });
  // student_id -> contract_number. Source of truth for the row label + contract-number search.
  const [contractByStudent, setContractByStudent] = React.useState({});
  const PAGE_SIZE = 10;
  const loadedOnce = React.useRef(false);

  async function loadStudents(overrides = {}) {
    setLoading(true);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (q) params.search = q;
      if (status !== 'all') params.status = status;
      if (groupId) params.group_id = groupId;
      Object.assign(params, overrides);
      const res = await apiGetStudents(params);
      let data = res?.data || [];
      let totalPages = res?.meta?.total_pages || 1;
      let totalCount = res?.meta?.total || 0;

      // Contract-number search: the server search may not cover contract_number,
      // so on page 1 we resolve the query against the contract map and pull in
      // any matching students the server didn't already return.
      const effPage = overrides.page ?? page;
      const query = String(overrides.search ?? q ?? '').trim().toLowerCase();
      if (query && effPage === 1) {
        const have = new Set(data.map(s => s.id));
        const matchIds = Object.keys(contractByStudent)
          .filter(sid => String(contractByStudent[sid]).toLowerCase().includes(query))
          .map(Number)
          .filter(id => !have.has(id))
          .slice(0, 20);
        if (matchIds.length) {
          const extra = (await Promise.all(
            matchIds.map(id => apiGetStudent(id).then(r => r?.data).catch(() => null))
          )).filter(Boolean);
          if (extra.length) {
            data = [...extra, ...data];
            totalCount = totalCount + extra.length;
          }
        }
      }

      setStudents(data);
      setTotalPages(totalPages);
      setTotalCount(totalCount);
    } catch {} finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    apiGetGroupsForSelect().then(res => setGroups(res?.data || [])).catch(() => {});
  }, []);

  // Pull every contract once and index by student. A student may have several
  // contracts (renewals) — keep the newest (highest id) as the current one.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const newest = {}; // student_id -> { number, id }
      try {
        let p = 1, totalPages = 1;
        do {
          const res = await apiGetContracts({ page: p, page_size: 200 });
          (res?.data || []).forEach(c => {
            const sid = c.student_id;
            if (sid == null || !c.contract_number) return;
            const prev = newest[sid];
            if (!prev || Number(c.id) > Number(prev.id)) newest[sid] = { number: c.contract_number, id: c.id };
          });
          totalPages = res?.meta?.total_pages || 1;
          p++;
        } while (p <= totalPages && p <= 40);
      } catch { /* leave map empty; rows fall back to #id */ }
      if (cancelled) return;
      const map = {};
      Object.entries(newest).forEach(([sid, v]) => { map[sid] = v.number; });
      setContractByStudent(map);
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => { setPage(1); loadStudents({ page: 1 }); }, q ? 400 : 0);
    return () => clearTimeout(timer);
  }, [q, status, groupId]);

  React.useEffect(() => { loadStudents(); }, [page]);

  React.useEffect(() => {
    const closeMenu = () => setOpenMenuStudentId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const groupMap = React.useMemo(() => {
    const m = {};
    groups.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [groups]);

  const isDeletedStatusFilter = normalizeStatus(status) === 'deleted';
  const allSelected = students.length > 0 && students.every(s => selected.includes(s.id));

  async function handleDeleteStudent(id) {
    if (!await confirmDialog(t('confirm_delete_student'))) return;
    try {
      await apiDeleteStudent(id);
      setSelected(prev => prev.filter(x => x !== id));
      setOpenMenuStudentId(null);
      onToast?.(t('toast_student_deleted'));
      loadStudents();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  async function handleBulkDelete() {
    if (selected.length === 0) return;
    if (!await confirmDialog(`${selected.length} ${t('confirm_delete_students')}`)) return;
    setBulkDeleting(true);
    try {
      await apiDeleteStudentsBulk(selected);
      setSelected([]);
      onToast?.(`${selected.length} ${t('toast_students_deleted')}`);
      loadStudents();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleExport() {
    try {
      const blob = await apiDownloadStudentsComprehensiveExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  // Full-page loader only for the very first fetch; later filter changes keep
  // the toolbar mounted and dim the table instead.
  if (loading && !loadedOnce.current) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!loading) loadedOnce.current = true;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Student}/>
        <div>
          <h1 className="page-title">{t('students_title')}</h1>
          <div className="page-sub">{t('students_sub')} {totalCount} {t('students_count')}</div>
        </div>
        <div className="page-actions">
          {selected.length > 0 && !isDeletedStatusFilter && (
            <button className="btn danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <I.Trash2 size={14}/> {bulkDeleting ? t('deleting') : `${selected.length} ${t('delete')}`}
            </button>
          )}
          <button className="btn" onClick={handleExport}><I.Download size={15}/> {t('students_excel_export')}</button>
          <button className="btn primary" onClick={onNew}><I.UserPlus size={15}/> {t('students_new')}</button>
        </div>
      </div>

      <div className={"table-wrap" + (loading ? " is-loading" : "")}>
        <div className="seg" style={{ marginBottom: 12 }} role="tablist">
          {[
            { value: 'all', label: t('students_all_statuses'), icon: I.Stack },
            { value: 'active', label: t('status_active'), icon: I.CheckCircle },
            { value: 'inactive', label: t('status_inactive'), icon: I.Pause },
            { value: 'archived', label: t('status_archived'), icon: I.Archive },
            { value: 'DELETED', label: t('status_deleted'), icon: I.Prohibit },
          ].map(opt => (
            <button key={opt.value} type="button" role="tab" aria-selected={status === opt.value}
              className={status === opt.value ? 'active' : ''}
              onClick={() => { setStatus(opt.value); setPage(1); }}>
              <opt.icon size={16} weight={status === opt.value ? 'fill' : 'duotone'}/> {opt.label}
            </button>
          ))}
        </div>
        <div className="table-toolbar">
          <div className="search">
            <span className="icon-l"><I.Search size={15}/></span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('students_search')}/>
          </div>
          <SearchableGroupSelect value={groupId} onChange={v => { setGroupId(v === 'all' ? '' : v); setPage(1); }} groups={groups} placeholder={t('students_all_groups')} />
          <div className="toolbar-meta">
            {selected.length > 0 && <span className="chip solid">{selected.length} {t('students_selected')}</span>}
            <span>{totalCount} {t('students_results')}</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36, paddingRight: 0 }}>
                  <input type="checkbox" checked={allSelected} onChange={e => setSelected(e.target.checked ? students.map(s => s.id) : [])}/>
                </th>
                <th>{t('students_col_name')}</th>
                <th>{t('students_col_group')}</th>
                <th>{t('students_col_birth')}</th>
                <th>{t('students_col_phone')}</th>
                <th>{t('students_col_status')}</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && !loading && (
                <tr className="static"><td colSpan={7} className="empty-cell">{t('students_not_found')}</td></tr>
              )}
              {students.map(s => {
                const name = fullName(s);
                const age = calcAge(s.date_of_birth);
                const grpName = groupMap[s.group_id] || '—';
                const contractNo = contractByStudent[s.id] || s.contract_number || '';
                return (
                  <tr key={s.id} className={selected.includes(s.id) ? 'selected' : undefined} onClick={() => onOpen(s.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(e.target.checked ? [...selected, s.id] : selected.filter(x => x !== s.id))}/>
                    </td>
                    <td>
                      <div className="row-name">
                        <div className="avatar sm" style={{ background: avatarColor(s.id) }}>{s.first_name?.[0]}{s.last_name?.[0]}</div>
                        <div className="meta">
                          <span className="name">{name}</span>
                          <span className="sub">{contractNo || '#' + String(s.id).padStart(4, '0')} · {age} {t('students_years')}</span>
                        </div>
                      </div>
                    </td>
                    <td><span className="chip navy">{grpName}</span></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{fmtDate(s.date_of_birth)}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{s.phone || '—'}</td>
                    <td>
                      {studentStatusBadge(s.status, t)}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                      <button className="icon-btn plain" aria-label="Actions" onClick={(e) => {
                        e.stopPropagation();
                        if (openMenuStudentId === s.id) {
                          setOpenMenuStudentId(null);
                        } else {
                          setMenuPos(menuPosition(e.currentTarget, 2));
                          setOpenMenuStudentId(s.id);
                        }
                      }}><I.More size={16}/></button>
                      {openMenuStudentId === s.id && (
                        <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                          <button className="menu-item" onClick={() => { onOpen(s.id); setOpenMenuStudentId(null); }}>
                            <I.Eye size={14} /> {t('open')}
                          </button>
                          <button className="menu-item danger" onClick={() => handleDeleteStudent(s.id)}>
                            <I.Trash2 size={14} /> {t('delete')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={totalPages} onPage={setPage} total={totalCount} pageSize={PAGE_SIZE}/>
      </div>

    </div>
  );
}

