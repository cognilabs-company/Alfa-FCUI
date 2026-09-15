// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import {
  apiGetGroups, apiGetHeadCoachGroups, apiGetGroup, apiGetGroupStudents, apiCreateGroup, apiUpdateGroup, apiDeleteGroup, apiDeleteGroupsBulk,
  apiGetSessions, apiGetSessionDetails, apiGetCoachSessionDetails, apiCreateSession,
  apiUpdateSession, apiDeleteSession, apiCreateHeadCoachSessionsBulk,
  apiGetCoaches, apiDownloadGroupStudentsExport, apiDownloadCoachGroupPerformanceTableExport,
  apiMarkAttendance, apiMarkBulkAttendance, apiAddPerformanceTableMatch,
  apiSaveCoachGroupPerformanceTable, apiDeleteCoachPerformanceTableColumn, apiUpdateCoachPerformanceTableColumn,
  apiUploadCoachSessionKonspekt, apiGetCoachMyAttendances,
} from '@/shared/api';
import { useCoachGroupsQuery, useGroupPerformanceTableQuery } from '@/features/performance-table/model/use-performance-table';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { monthShort, todayISO } from '@/shared/lib/format';

// compact "19 May" for narrow match-column headers
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${monthShort(d.getMonth())}`;
}
import { Modal } from '@/shared/ui/modal';

export function PerformanceTable() {
  const { t, tp } = useT();
  const I = Icon;
  const currentYear = new Date().getFullYear();
  const [seasonYear, setSeasonYear] = React.useState(currentYear);

  const groupsQuery = useCoachGroupsQuery();
  const groups = groupsQuery.data || [];
  const [selectedGroupId, setSelectedGroupId] = React.useState(null);
  React.useEffect(() => {
    if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
  }, [groups, selectedGroupId]);

  const tableQuery = useGroupPerformanceTableQuery(selectedGroupId, seasonYear);
  const tableData = tableQuery.data || null;
  const matches = tableData?.matches || [];
  const rows = tableData?.rows || [];
  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;

  // add match
  const [showAddMatch, setShowAddMatch] = React.useState(false);
  const [newMatch, setNewMatch] = React.useState({ match_date: todayISO(), opponent: '', tour_label: '' });
  const [savingMatch, setSavingMatch] = React.useState(false);

  // edit match (column)
  const [editMatchTarget, setEditMatchTarget] = React.useState(null);
  const [editMatchForm, setEditMatchForm] = React.useState({ match_date: '', opponent: '', tour_label: '' });
  const [deletingMatchId, setDeletingMatchId] = React.useState(null);

  // cell editing
  const [editMode, setEditMode] = React.useState(false);
  const [editCells, setEditCells] = React.useState([]);
  const [savingTable, setSavingTable] = React.useState(false);
  const CELL_CYCLE = [null, 'goal', 'assist', 'yellow', 'absent'];

  function enterEditMode() {
    setEditCells(rows.map(r => {
      const cells = r.cells || [];
      return matches.map((_, mi) => cells[mi] ?? null);
    }));
    setEditMode(true);
  }

  function exitEditMode() { setEditMode(false); setEditCells([]); }

  function cycleCell(ri, mi) {
    setEditCells(prev => {
      const next = prev.map(r => [...r]);
      const cur = next[ri][mi];
      const idx = CELL_CYCLE.indexOf(cur);
      next[ri][mi] = CELL_CYCLE[(idx + 1) % CELL_CYCLE.length];
      return next;
    });
  }

  async function saveTable() {
    setSavingTable(true);
    try {
      await apiSaveCoachGroupPerformanceTable(selectedGroupId, {
        title: tableData?.title || '',
        season_year: seasonYear,
        matches: matches.map(m => ({ tour_label: m.tour_label, match_date: m.match_date, opponent: m.opponent })),
        rows: rows.map((r, ri) => ({ student_id: r.student_id, cells: editCells[ri] || [] })),
      });
      setEditMode(false);
      tableQuery.refetch();
    } catch (e) {
      notify.error(`${t('err_not_saved')}: ${e.message}`);
    } finally {
      setSavingTable(false);
    }
  }

  async function handleAddMatch() {
    if (!selectedGroupId || !newMatch.opponent.trim() || !newMatch.match_date) { notify.error(t('toast_required')); return; }
    setSavingMatch(true);
    try {
      await apiAddPerformanceTableMatch(selectedGroupId, {
        season_year: seasonYear,
        match_date: newMatch.match_date,
        opponent: newMatch.opponent.trim(),
        tour_label: newMatch.tour_label.trim() || undefined,
        values: [],
      });
      setShowAddMatch(false);
      setNewMatch({ match_date: todayISO(), opponent: '', tour_label: '' });
      exitEditMode();
      setTimeout(() => tableQuery.refetch(), 300);
    } catch (e) {
      notify.error(e.message);
    } finally { setSavingMatch(false); }
  }

  function openEditMatch(m) {
    setEditMatchTarget(m);
    setEditMatchForm({ match_date: m.match_date || '', opponent: m.opponent || '', tour_label: m.tour_label || '' });
  }

  async function handleEditMatch() {
    if (!editMatchTarget || !editMatchForm.opponent.trim()) return;
    setSavingMatch(true);
    try {
      await apiUpdateCoachPerformanceTableColumn(selectedGroupId, editMatchTarget.id, {
        match_date: editMatchForm.match_date,
        opponent: editMatchForm.opponent.trim(),
        tour_label: editMatchForm.tour_label.trim() || undefined,
        values: [],
      });
      setEditMatchTarget(null);
      tableQuery.refetch();
    } catch (e) {
      notify.error(e.message);
    } finally { setSavingMatch(false); }
  }

  async function handleDeleteMatch(m) {
    if (!await confirmDialog(t('confirm_delete_match').replace('{name}', m.opponent))) return;
    setDeletingMatchId(m.id);
    try {
      await apiDeleteCoachPerformanceTableColumn(selectedGroupId, m.id, seasonYear);
      exitEditMode();
      tableQuery.refetch();
    } catch (e) {
      notify.error(e.message);
    } finally { setDeletingMatchId(null); }
  }

  async function handleExport() {
    if (!selectedGroupId) return;
    try {
      const blob = await apiDownloadCoachGroupPerformanceTableExport(selectedGroupId, seasonYear);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `performance-table-${selectedGroupId}-${seasonYear}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { notify.error(`${t('err_excel_open')}: ${e.message}`); }
  }

  function cellStyle(rawValue) {
    const v = rawValue == null ? null : String(rawValue).toLowerCase().trim();
    switch (v) {
      case 'goal': case 'gol': return { bg: 'var(--success-soft)', color: 'var(--success)', label: '⚽', numericGoals: 1 };
      case 'assist': case 'uzatma': return { bg: 'var(--info-soft)', color: 'var(--info)', label: '↗', numericGoals: 0 };
      case 'yellow': case 'sariq': return { bg: 'var(--warning-soft)', color: 'var(--warning)', label: '▢', numericGoals: 0 };
      case 'absent': case 'kelmagan': return { bg: 'var(--danger-soft)', color: 'var(--danger)', label: '✗', numericGoals: 0 };
      case null: case '': case 'played': return { bg: 'var(--surface-2)', color: 'var(--text-2)', label: '·', numericGoals: 0 };
      default: {
        const n = Number(rawValue);
        if (!isNaN(n) && n > 0) return { bg: 'var(--success-soft)', color: 'var(--success)', label: `⚽ ${n}`, numericGoals: n };
        return { bg: 'var(--surface-2)', color: 'var(--text-2)', label: v || '·', numericGoals: 0 };
      }
    }
  }

  if (groupsQuery.isLoading) return <div className="empty loading" style={{ padding: 64 }}>{t('perf_groups_loading')}</div>;
  if (groupsQuery.isError) return <div className="empty" style={{ padding: 48, color: 'var(--danger)' }}>{t('perf_groups_error')}</div>;
  if (groups.length === 0) return <div className="empty" style={{ padding: 48 }}>{t('perf_groups_empty')}</div>;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Trophy}/>
        <div>
          <h1 className="page-title">{t('performance_title')}</h1>
          <div className="page-sub">{selectedGroup?.name || '—'} · {t('perf_season_sub').replace('{year}', seasonYear)} · {matches.length} {tp('perf_matches_count', matches.length)}</div>
        </div>
        <div className="page-actions">
          <SearchableGroupSelect value={selectedGroupId || ''} onChange={v => { setSelectedGroupId(v ? Number(v) : null); exitEditMode(); }} groups={groups} placeholder={t('group_select_ph')} />
          <SearchableSelect
            value={String(seasonYear)}
            onChange={v => { setSeasonYear(Number(v)); exitEditMode(); }}
            options={[currentYear, currentYear - 1, currentYear - 2].map(y => ({ value: String(y), label: String(y) }))}
            style={{ minWidth: 100 }}
          />
          <button className="btn" onClick={handleExport} disabled={!selectedGroupId}><I.Download size={15}/> Excel</button>
          {editMode ? (
            <>
              <button className="btn ghost" onClick={exitEditMode} disabled={savingTable}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveTable} disabled={savingTable}>
                <I.Save size={15}/> {savingTable ? t('saving') : t('save')}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={enterEditMode} disabled={!selectedGroupId || matches.length === 0}>
                <I.Edit size={15}/> {t('edit')}
              </button>
              <button className="btn primary" onClick={() => setShowAddMatch(true)} disabled={!selectedGroupId}>
                <I.Plus size={15}/> {t('perf_add_match')}
              </button>
            </>
          )}
        </div>
      </div>

      {editMode && (
        <div className="alert warning" style={{ marginBottom: 12 }}>
          <I.Edit size={15}/> {t('perf_edit_mode_hint')}
        </div>
      )}

      {tableQuery.isLoading && <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>}
      {tableQuery.isError && <div className="alert danger">{t('perf_load_error')}</div>}

      {!tableQuery.isLoading && !tableQuery.isError && matches.length === 0 && (
        <div className="card empty" style={{ padding: 48 }}>
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 750 }}>{t('perf_no_data')}</div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => setShowAddMatch(true)} disabled={!selectedGroupId}>
            <I.Plus size={15}/> {t('perf_add_match')}
          </button>
        </div>
      )}

      {!tableQuery.isLoading && !tableQuery.isError && matches.length > 0 && rows.length === 0 && (
        <div className="card empty" style={{ padding: 48 }}>
          <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 750 }}>{t('perf_no_students')}</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>{t('perf_check_students')}</div>
        </div>
      )}

      {!tableQuery.isLoading && !tableQuery.isError && matches.length > 0 && (
        <>
          <div className="table-wrap" style={{ overflow: 'auto' }}>
            <table className="table performance-table">
              <thead>
                <tr>
                  <th>{t('field_student')}</th>
                  {matches.map(m => (
                    <th key={m.id} style={{ textAlign: 'center', minWidth: editMode ? 116 : 96, whiteSpace: 'normal' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{shortDate(m.match_date)}{m.tour_label ? ' · ' + m.tour_label : ''}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{m.opponent}</div>
                      {editMode && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                          <button
                            className="icon-btn"
                            style={{ width: 26, height: 26 }}
                            title={t('btn_edit')}
                            aria-label={t('btn_edit')}
                            onClick={() => openEditMatch(m)}
                          ><I.Edit size={12}/></button>
                          <button
                            className="icon-btn danger"
                            style={{ width: 26, height: 26 }}
                            title={t('btn_delete')}
                            aria-label={t('btn_delete')}
                            disabled={deletingMatchId === m.id}
                            onClick={() => handleDeleteMatch(m)}
                          ><I.Trash size={12}/></button>
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="total" style={{ minWidth: 80 }}>{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => {
                  let goals = 0;
                  return (
                    <tr key={row.student_id} className={editMode ? undefined : 'static'}>
                      <td>
                        <div className="row-name">
                          <div className="avatar sm" style={{ background: avatarColor(row.student_id) }}>
                            {row.student_name?.split(' ').map(p => p[0]).slice(0, 2).join('') || '??'}
                          </div>
                          <div className="meta">
                            <span className="name" style={{ fontSize: 13 }}>{row.student_name}</span>
                            {row.millati && <span className="sub">{row.millati}</span>}
                          </div>
                        </div>
                      </td>
                      {matches.map((m, mi) => {
                        const rawCell = editMode ? (editCells[ri]?.[mi] ?? null) : (row.cells?.[mi] ?? null);
                        const st = cellStyle(rawCell);
                        goals += st.numericGoals;
                        return (
                          <td key={m.id} style={{ textAlign: 'center', padding: 4 }} onClick={editMode ? () => cycleCell(ri, mi) : undefined}>
                            <div className={'perf-cell' + (editMode ? ' editable' : '')} style={{ background: st.bg, color: st.color }}>
                              {st.label}
                            </div>
                          </td>
                        );
                      })}
                      <td className="total" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{goals}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card legend" style={{ marginTop: 14, padding: '14px 18px', alignItems: 'center' }}>
            {[
              ['⚽', 'var(--success-soft)', 'var(--success)', t('perf_legend_goal')],
              ['↗', 'var(--info-soft)', 'var(--info)', t('perf_legend_assist')],
              ['▢', 'var(--warning-soft)', 'var(--warning)', t('perf_legend_yellow')],
              ['✗', 'var(--danger-soft)', 'var(--danger)', t('perf_legend_absent')],
              ['·', 'var(--surface-2)', 'var(--text-2)', t('perf_legend_played')],
            ].map(([lbl, bg, clr, name]) => (
              <span key={name} style={{ color: 'var(--text-2)' }}><span className="perf-cell" style={{ minWidth: 30, height: 24, padding: '0 6px', fontSize: 12, background: bg, color: clr }}>{lbl}</span>{name}</span>
            ))}
            {editMode && <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{t('perf_edit_hint')}</span>}
          </div>
        </>
      )}

      {/* Add match modal */}
      {showAddMatch && (
        <Modal icon={I.Ball}
          onClose={() => setShowAddMatch(false)}
          title={t('perf_add_match')}
          footer={(
            <>
              <button className="btn ghost" onClick={() => setShowAddMatch(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={handleAddMatch} disabled={savingMatch}>
                <I.Plus size={14}/> {savingMatch ? t('adding') : t('add')}
              </button>
            </>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field"><label>{t('field_date')} <span className="req">*</span></label><DateInput value={newMatch.match_date} onChange={v => setNewMatch(p => ({ ...p, match_date: v }))} /></div>
            <div className="field"><label>{t('field_opponent')} <span className="req">*</span></label><input value={newMatch.opponent} onChange={e => setNewMatch(p => ({ ...p, opponent: e.target.value }))} placeholder={t('ph_opponent')}/></div>
            <div className="field"><label>{t('field_tour')}</label><input value={newMatch.tour_label} onChange={e => setNewMatch(p => ({ ...p, tour_label: e.target.value }))} placeholder={t('ph_tour')}/></div>
          </div>
        </Modal>
      )}

      {/* Edit match modal */}
      {editMatchTarget && (
        <Modal icon={I.Edit}
          onClose={() => setEditMatchTarget(null)}
          title={t('perf_edit_match')}
          size="sm"
          footer={(
            <>
              <button className="btn ghost" onClick={() => setEditMatchTarget(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={handleEditMatch} disabled={savingMatch}>
                <I.Check size={14}/> {savingMatch ? t('saving') : t('save')}
              </button>
            </>
          )}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field"><label>{t('field_date')} <span className="req">*</span></label><DateInput value={editMatchForm.match_date} onChange={v => setEditMatchForm(p => ({ ...p, match_date: v }))} /></div>
            <div className="field"><label>{t('field_opponent')} <span className="req">*</span></label><input value={editMatchForm.opponent} onChange={e => setEditMatchForm(p => ({ ...p, opponent: e.target.value }))} placeholder={t('ph_opponent')}/></div>
            <div className="field"><label>{t('field_tour')}</label><input value={editMatchForm.tour_label} onChange={e => setEditMatchForm(p => ({ ...p, tour_label: e.target.value }))} placeholder={t('ph_tour')}/></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
