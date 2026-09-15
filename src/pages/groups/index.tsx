// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
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
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { menuPosition } from '@/shared/ui/pager';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { CountUp } from '@/shared/ui/count-up';
import { Badge, studentStatusBadge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';

function GroupFormFields({ form, setForm, coaches }) {
  const { t } = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="field">
        <label>{t('groups_name_label')} <span className="req">*</span></label>
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={t('groups_name_placeholder')} />
      </div>
      <div className="field">
        <label>{t('groups_desc_label')}</label>
        <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={t('groups_desc_placeholder')} />
      </div>
      <div className="field">
        <label>{t('groups_coach_label')}</label>
        <SearchableSelect
          value={form.coach_id}
          onChange={v => setForm(p => ({ ...p, coach_id: v }))}
          options={[{ value: '', label: t('groups_coach_none') }, ...coaches.map(c => ({ value: String(c.id), label: c.full_name }))]}
        />
      </div>
    </div>
  );
}

export function GroupsScreen({ onOpen, selectedGroupId = null, onCloseGroup, onToast, onOpenStudent } = {}) {
  const I = Icon;
  const { t } = useT();
  const [groups, setGroups] = React.useState([]);
  const [coaches, setCoaches] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [view, setView] = React.useState('cards');
  const [includeArchived, setIncludeArchived] = React.useState(false);

  // new group
  const [showNew, setShowNew] = React.useState(false);
  const [newGroup, setNewGroup] = React.useState({ name: '', description: '', coach_id: '' });
  const [saving, setSaving] = React.useState(false);

  // edit group
  const [editingGroup, setEditingGroup] = React.useState(null);
  const [editForm, setEditForm] = React.useState({ name: '', description: '', coach_id: '' });

  // bulk select
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  // group detail
  const [groupDetail, setGroupDetail] = React.useState(null);
  const [groupStudents, setGroupStudents] = React.useState([]);
  const [groupLoading, setGroupLoading] = React.useState(false);

  // context menu (list view)
  const [openMenuGroupId, setOpenMenuGroupId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });

  async function loadData() {
    setLoading(true);
    try {
      const [gRes, cRes] = await Promise.all([
        apiGetGroups({ page_size: 100, include_archived: includeArchived }),
        apiGetCoaches(),
      ]);
      setGroups(gRes?.data || []);
      setCoaches(cRes?.data || []);
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadData(); }, [includeArchived]);

  React.useEffect(() => {
    const closeMenu = () => setOpenMenuGroupId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  React.useEffect(() => {
    if (!selectedGroupId) { setGroupDetail(null); setGroupStudents([]); return; }
    setGroupLoading(true);
    Promise.all([apiGetGroup(selectedGroupId), apiGetGroupStudents(selectedGroupId)])
      .then(([gRes, sRes]) => {
        setGroupDetail(gRes?.data || null);
        setGroupStudents(sRes?.data || []);
      })
      .catch(() => {})
      .finally(() => setGroupLoading(false));
  }, [selectedGroupId]);

  const coachMap = React.useMemo(() => {
    const m = {};
    coaches.forEach(c => { m[c.id] = c.full_name; });
    return m;
  }, [coaches]);

  async function handleCreateGroup() {
    if (!newGroup.name.trim()) return;
    setSaving(true);
    try {
      await apiCreateGroup({
        name: newGroup.name.trim(),
        description: newGroup.description.trim() || undefined,
        coach_id: newGroup.coach_id ? Number(newGroup.coach_id) : undefined,
      });
      setShowNew(false);
      setNewGroup({ name: '', description: '', coach_id: '' });
      onToast?.(`"${newGroup.name.trim()}" ${t('toast_group_added')}`);
      await loadData();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(g) {
    setEditingGroup(g);
    setEditForm({ name: g.name || '', description: g.description || '', coach_id: String(g.coach_id || '') });
    setOpenMenuGroupId(null);
  }

  async function handleEditGroup() {
    if (!editForm.name.trim() || !editingGroup) return;
    setSaving(true);
    try {
      await apiUpdateGroup(editingGroup.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        coach_id: editForm.coach_id ? Number(editForm.coach_id) : undefined,
      });
      setEditingGroup(null);
      onToast?.(t('toast_group_updated'));
      await loadData();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(g) {
    if (!await confirmDialog(`"${g.name}" ${t('confirm_delete_group')}`)) return;
    try {
      await apiDeleteGroup(g.id);
      setOpenMenuGroupId(null);
      onToast?.(`"${g.name}" ${t('toast_group_deleted')}`);
      await loadData();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!await confirmDialog(`${selectedIds.length} ${t('confirm_delete_groups')}`)) return;
    setBulkDeleting(true);
    try {
      await apiDeleteGroupsBulk(selectedIds);
      setSelectedIds([]);
      await loadData();
    } catch (e) {
      notify.error(e.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    setSelectedIds(prev => prev.length === groups.length ? [] : groups.map(g => g.id));
  }

  async function handleExport(groupId) {
    try {
      const blob = await apiDownloadGroupStudentsExport(groupId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guruh-${groupId}-export.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e.message);
    }
  }

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;

  const selectedGroup = groupDetail || groups.find(g => g.id === selectedGroupId) || null;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.UsersFour}/>
        <div>
          <h1 className="page-title">{t('groups_title')}</h1>
          <div className="page-sub">{groups.length} {t('groups_sub')}</div>
        </div>
        <div className="page-actions">
          {selectedIds.length > 0 && (
            <button className="btn ghost danger-ghost" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <I.Trash size={14}/> {bulkDeleting ? t('deleting') : `${selectedIds.length} ${t('delete')}`}
            </button>
          )}
          <label className="check-line" style={{ marginRight: 6 }}>
            <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
            {t('groups_archived')}
          </label>
          <div className="seg">
            <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>{t('groups_cards')}</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>{t('groups_list')}</button>
          </div>
          <button className="btn primary" onClick={() => setShowNew(true)}><I.Plus size={15}/> {t('groups_new')}</button>
        </div>
      </div>

      {/* Group detail modal */}
      {selectedGroup && (
        <Modal icon={I.UsersFour}
          onClose={() => onCloseGroup?.()}
          size="lg"
          title={selectedGroup.name}
          subtitle={selectedGroup.description || t('groups_no_desc')}
          headerExtra={
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn ghost sm" onClick={() => { onCloseGroup?.(); openEdit(selectedGroup); }}>
                <I.Edit size={13}/> {t('edit')}
              </button>
              <button className="btn ghost sm" onClick={() => handleExport(selectedGroup.id)}>
                <I.Download size={13}/> {t('export')}
              </button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge tone="success" icon={I.CheckCircle}>{t('groups_active')}</Badge>
              <span className="chip navy">{groupStudents.length} {t('groups_students_count')}</span>
            </div>

            {groupLoading ? (
              <div className="empty" style={{ padding: 20 }}>{t('loading')}</div>
            ) : (
              <DetailGrid items={[
                { label: t('groups_coach_label2'), value: selectedGroup.coach_name || coachMap[selectedGroup.coach_id] || '—' },
                { label: t('groups_capacity'), value: selectedGroup.capacity ?? '—' },
                { label: t('groups_active_students'), value: selectedGroup.active_students_count ?? groupStudents.filter(s => s.status === 'active').length },
                { label: t('groups_waiting_list'), value: selectedGroup.waiting_list_count ?? '—' },
              ]}/>
            )}

            <div>
              <div className="card-title" style={{ marginBottom: 10 }}>{t('groups_members')}</div>
              {groupStudents.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>{t('groups_no_students')}</div>
              ) : (
                <div className="list-stack">
                  {groupStudents.map((s) => (
                    <div
                      key={s.id}
                      className="list-row"
                      role={onOpenStudent ? 'button' : undefined}
                      tabIndex={onOpenStudent ? 0 : undefined}
                      style={onOpenStudent ? { cursor: 'pointer' } : undefined}
                      onClick={() => { if (onOpenStudent) { onCloseGroup?.(); onOpenStudent(s.id); } }}
                      onKeyDown={(e) => {
                        if (!onOpenStudent || (e.key !== 'Enter' && e.key !== ' ')) return;
                        e.preventDefault();
                        onCloseGroup?.();
                        onOpenStudent(s.id);
                      }}
                    >
                      <div className="avatar sm" style={{ background: avatarColor(s.id) }}>{s.first_name?.[0]}{s.last_name?.[0]}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.first_name} {s.last_name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.phone || t('groups_no_phone')}</div>
                      </div>
                      {studentStatusBadge(s.status, t)}
                      {onOpenStudent && <Icon.ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }}/>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Cards view */}
      {view === 'cards' && (
        <div className="grid-cards">
          {groups.map(g => {
            const coachName = coachMap[g.coach_id] || '—';
            const count = g.active_students_count ?? 0;
            const isSelected = selectedIds.includes(g.id);
            const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : null;
            const pct = capacity ? Math.min(100, Math.round((count / capacity) * 100)) : null;
            return (
              <div key={g.id} className={'card group-card' + (isSelected ? ' selected' : '')}>
                <div className="gc-top">
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(g.id)} style={{ marginTop: 2 }} aria-label={g.name} />
                  <button type="button" className="gc-open" onClick={() => onOpen && onOpen(g.id)}>
                    {g.description && <div className="gc-eyebrow">{g.description}</div>}
                    <div className="gc-name">{g.name}</div>
                  </button>
                  <Badge tone="success" icon={I.CheckCircle}>{t('status_active')}</Badge>
                </div>
                <div>
                  <div className="gc-count">
                    <b><CountUp value={count} duration={1000}/></b>
                    <span>{capacity ? `/ ${capacity} · ` : ''}{t('groups_active_students')}</span>
                  </div>
                  {pct != null && (
                    <div className={'progress' + (pct >= 95 ? ' red' : pct >= 75 ? ' gold' : '')} style={{ marginTop: 10 }}>
                      <span style={{ width: pct + '%' }}></span>
                    </div>
                  )}
                </div>
                <div className="gc-foot">
                  <div className="gc-coach">
                    {g.coach_id ? (
                      <>
                        <div className="avatar sm" style={{ background: avatarColor(g.coach_id) }}>
                          {coachName.split(' ').map(p => p[0]).slice(0, 2).join('')}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="n">{coachName}</div>
                          <div className="r">{t('groups_coach_label2')}</div>
                        </div>
                      </>
                    ) : (
                      <div className="r">{t('groups_coach_none')}</div>
                    )}
                  </div>
                  <div className="gc-actions">
                    <button className="icon-btn plain" title={t('btn_edit')} aria-label={t('btn_edit')} onClick={() => openEdit(g)}><I.Edit size={15}/></button>
                    <button className="icon-btn plain" title={t('export')} aria-label={t('export')} onClick={() => handleExport(g.id)}><I.Download size={15}/></button>
                    <button className="icon-btn plain danger" title={t('btn_delete')} aria-label={t('btn_delete')} onClick={() => handleDeleteGroup(g)}><I.Trash size={15}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={selectedIds.length === groups.length && groups.length > 0} onChange={toggleAll} />
                </th>
                <th>{t('groups_col_group')}</th><th>{t('groups_col_desc')}</th><th>{t('groups_col_coach')}</th><th>{t('groups_col_students')}</th><th>{t('groups_col_waiting')}</th><th>{t('groups_col_status')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const coachName = coachMap[g.coach_id] || '—';
                const isSelected = selectedIds.includes(g.id);
                return (
                  <tr key={g.id} className={isSelected ? 'selected' : undefined}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(g.id)} />
                    </td>
                    <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => onOpen && onOpen(g.id)}>{g.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{g.description || '—'}</td>
                    <td>{coachName}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{g.active_students_count ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{g.waiting_list_count ?? '—'}</td>
                    <td><Badge tone="success" icon={I.CheckCircle}>{t('status_active')}</Badge></td>
                    <td style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <button className="icon-btn plain" aria-label="Actions" onClick={(e) => {
                        if (openMenuGroupId === g.id) { setOpenMenuGroupId(null); return; }

                        setMenuPos(menuPosition(e.currentTarget, 4));
                        setOpenMenuGroupId(g.id);
                      }}><I.More size={15}/></button>
                      {openMenuGroupId === g.id && (
                        <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }}>
                          {[
                            { icon: 'Eye', label: t('view'), action: () => { onOpen?.(g.id); setOpenMenuGroupId(null); } },
                            { icon: 'Edit', label: t('edit'), action: () => openEdit(g) },
                            { icon: 'Download', label: t('export'), action: () => { handleExport(g.id); setOpenMenuGroupId(null); } },
                            { icon: 'Trash', label: t('delete'), action: () => { setOpenMenuGroupId(null); handleDeleteGroup(g); }, danger: true },
                          ].map(item => {
                            const Ic = I[item.icon];
                            return (
                              <button key={item.label} className={'menu-item' + (item.danger ? ' danger' : '')} onClick={item.action}>
                                <Ic size={14}/> {item.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New group modal */}
      {showNew && (
        <Modal icon={I.PlusCircle}
          onClose={() => setShowNew(false)}
          title={t('groups_new_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setShowNew(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={handleCreateGroup} disabled={saving}>
              <I.Check size={14}/> {saving ? t('saving') : t('add')}
            </button>
          </>}
        >
          <GroupFormFields form={newGroup} setForm={setNewGroup} coaches={coaches} />
        </Modal>
      )}

      {/* Edit group modal */}
      {editingGroup && (
        <Modal icon={I.Edit}
          onClose={() => setEditingGroup(null)}
          title={t('groups_edit_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setEditingGroup(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={handleEditGroup} disabled={saving}>
              <I.Check size={14}/> {saving ? t('saving') : t('save')}
            </button>
          </>}
        >
          <GroupFormFields form={editForm} setForm={setEditForm} coaches={coaches} />
        </Modal>
      )}
    </div>
  );
}

