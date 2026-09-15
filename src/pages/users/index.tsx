// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { Badge, userStatusBadge } from '@/shared/ui/status';
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

import { fmt } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';
import { Modal } from '@/shared/ui/modal';
import { menuPosition } from '@/shared/ui/pager';
import { avatarColor, getInitials } from '@/shared/lib/avatar';

/** Toggle-chip picker for role ids (replaces the Ctrl-click multi-select). */
function RolePicker({ roles, value, onChange }) {
  const I = Icon;
  const ids = (value || []).map(Number);
  return (
    <div className="choice-grid">
      {roles.map(r => {
        const on = ids.includes(Number(r.id));
        return (
          <button key={r.id} type="button" className={'choice' + (on ? ' on' : '')} aria-pressed={on}
            onClick={() => onChange(on ? ids.filter(x => x !== Number(r.id)) : [...ids, Number(r.id)])}>
            {on ? <I.Check size={14} strokeWidth={2.6}/> : <I.Plus size={14}/>} {r.name}
          </button>
        );
      })}
    </div>
  );
}

const ALL_PERMS = [
  { code: 'students:view', label: "O'quvchilarni ko'rish" },
  { code: 'students:edit', label: "O'quvchilarni tahrirlash" },
  { code: 'groups:view', label: "Guruhlarni ko'rish" },
  { code: 'groups:edit', label: 'Guruhlarni tahrirlash' },
  { code: 'attendance:coach:mark', label: 'Davomat belgilash' },
  { code: 'attendance:view', label: "Davomatni ko'rish" },
  { code: 'sessions:create', label: 'Sessiya yaratish' },
  { code: 'sessions:manage', label: 'Sessiyalarni boshqarish' },
  { code: 'reports:dashboard:view', label: 'Dashboard' },
  { code: 'reports:attendance:view', label: 'Davomat hisobotlari' },
  { code: 'settings:system:view', label: "Sozlamalarni ko'rish" },
  { code: 'settings:system:edit', label: 'Sozlamalarni tahrirlash' },
  { code: 'roles:manage', label: 'Rollarni boshqarish' },
  { code: 'users:manage', label: 'Foydalanuvchilarni boshqarish' },
  { code: 'gate:logs:view', label: "Darvoza loglarini ko'rish" },
  { code: 'contracts:view', label: "Shartnomalarni ko'rish" },
  { code: 'contracts:edit', label: 'Shartnomalarni tahrirlash' },
  { code: 'finance:transactions:view', label: "To'lovlarni ko'rish" },
  { code: 'finance:transactions:manual', label: "Qo'lda to'lov kiritish" },
  { code: 'finance:transactions:cancel', label: "To'lovni bekor qilish" },
  { code: 'finance:unassigned:view', label: "Biriktirilmagan to'lovlar" },
  { code: 'finance:unassigned:assign', label: "To'lovlarni biriktirish" },
];

// Permission category → i18n key (unknown categories fall back to the raw code)
const PERM_CATS = {
  students:   'nav_students',
  groups:     'nav_groups',
  attendance: 'profile_attendance',
  sessions:   'sessions_tab_sessions',
  reports:    'nav_reports',
  settings:   'nav_settings',
  roles:      'users_tab_roles',
  users:      'nav_users',
  gate:       'profile_gate',
  contracts:  'nav_contracts',
  finance:    'perm_cat_finance',
};

function getPermGroups(perms) {
  const map = {};
  perms.forEach(p => {
    const cat = p.code.split(':')[0];
    if (!map[cat]) map[cat] = { label: PERM_CATS[cat] || cat, items: [] };
    map[cat].items.push(p);
  });
  return Object.values(map);
}

function PermSelector({ ids, onChange, permissions }) {
  const { t } = useT();
  const groups = getPermGroups(permissions);
  return (
    <div className="perm-list">
      {groups.map(g => {
        const groupIds = g.items.map(p => p.id);
        const allChecked = groupIds.length > 0 && groupIds.every(id => ids.includes(id));
        const someChecked = groupIds.some(id => ids.includes(id));
        function toggleGroup(e) {
          onChange(e.target.checked ? [...new Set([...ids, ...groupIds])] : ids.filter(id => !groupIds.includes(id)));
        }
        return (
          <div key={g.label} className="perm-group">
            <label className="check-line">
              <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleGroup} />
              {t(g.label)}
            </label>
            <div className="perm-items">
            {g.items.map(p => (
              <label key={p.id} className="check-line">
                <input type="checkbox" checked={ids.includes(p.id)} onChange={e => {
                  onChange(e.target.checked ? [...ids, p.id] : ids.filter(x => x !== p.id));
                }} />
                <span>{p.description}</span>
              </label>
            ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UsersScreen({ initialView = 'users', onToast } = {}) {
  const I = Icon;
  const { t, tp } = useT();
  const [users, setUsers] = React.useState([]);
  const [roles, setRoles] = React.useState([]);
  const [permissions, setPermissions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState(initialView);

  // Role form
  const [newRole, setNewRole] = React.useState({ name: '', description: '', permission_ids: [] });
  const [editingRole, setEditingRole] = React.useState(null);

  // User create modal
  const [showCreateUser, setShowCreateUser] = React.useState(false);
  const [userForm, setUserForm] = React.useState({ full_name: '', phone: '', email: '', password: '', status: 'active', is_super_admin: false, role_ids: [] });
  const [savingUser, setSavingUser] = React.useState(false);

  // User edit modal
  const [editingUser, setEditingUser] = React.useState(null);
  const [editUserForm, setEditUserForm] = React.useState({ full_name: '', phone: '', email: '', password: '', status: 'active', role_ids: [] });
  const [savingEditUser, setSavingEditUser] = React.useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

  // Menus
  const [openMenuUserId, setOpenMenuUserId] = React.useState(null);
  const [deletingUserId, setDeletingUserId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });

  // Per-user permissions. The backend only knows roles, so each user's extra
  // permissions live in a hidden auto-managed role named "__user_<id>" that is
  // created/updated/deleted here and filtered out of every role list in the UI.
  const PERSONAL_PREFIX = '__user_';
  const isPersonalRole = (r) => (r?.name || '').startsWith(PERSONAL_PREFIX);
  const visibleRoles = roles.filter(r => !isPersonalRole(r));
  const regularRolesOf = (u) => (u.roles || []).filter(r => !isPersonalRole(r));
  const personalRoleOf = (u) => {
    const attached = (u.roles || []).find(isPersonalRole);
    // resolve through the full roles list so we get its permissions
    return roles.find(r => r.name === PERSONAL_PREFIX + u.id) ||
      (attached ? roles.find(r => r.id === attached.id) : null) || attached || null;
  };
  const [permUser, setPermUser] = React.useState(null);
  const [permExtraIds, setPermExtraIds] = React.useState([]);
  const [savingPerms, setSavingPerms] = React.useState(false);

  function rolePermIds(u) {
    const ids = new Set();
    regularRolesOf(u).forEach(ur => {
      const full = roles.find(r => r.id === ur.id);
      (full?.permissions || []).forEach(p => ids.add(p.id));
    });
    return ids;
  }

  function openUserPerms(u) {
    const personal = personalRoleOf(u);
    setPermExtraIds((personal?.permissions || []).map(p => p.id));
    setPermUser(u);
    setOpenMenuUserId(null);
  }

  async function saveUserPerms() {
    if (!permUser) return;
    setSavingPerms(true);
    try {
      const name = PERSONAL_PREFIX + permUser.id;
      const base = rolePermIds(permUser);
      const extras = permExtraIds.filter(id => !base.has(id));
      const regularIds = regularRolesOf(permUser).map(r => r.id);
      const existing = roles.find(r => r.name === name);
      if (extras.length === 0) {
        if (existing) {
          await apiUpdateUserRoles(permUser.id, regularIds);
          await apiDeleteRole(existing.id);
        }
      } else {
        let personalId = existing?.id;
        const description = `${t('users_perms_title')}: ${permUser.full_name || permUser.id}`;
        if (existing) {
          await apiUpdateRole(existing.id, { name, description, permission_ids: extras });
        } else {
          const res = await apiCreateRole({ name, description, permission_ids: extras });
          personalId = res?.data?.id;
          if (!personalId) {
            const rr = await apiGetRoles();
            personalId = (rr?.data || []).find(r => r.name === name)?.id;
          }
        }
        if (!personalId) throw new Error('Personal role not created');
        await apiUpdateUserRoles(permUser.id, [...regularIds, personalId]);
      }
      setPermUser(null);
      onToast?.(t('toast_perms_saved'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSavingPerms(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [uRes, rRes, pRes] = await Promise.allSettled([
        apiGetUsers({ page_size: 200 }),
        apiGetRoles(),
        apiGetPermissions(),
      ]);
      setUsers(uRes.status === 'fulfilled' ? (uRes.value?.data || []) : []);
      setRoles(rRes.status === 'fulfilled' ? (rRes.value?.data || []) : []);
      setPermissions(pRes.status === 'fulfilled' ? (pRes.value?.data || []) : []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(); }, []);

  React.useEffect(() => {
    const closeMenu = () => setOpenMenuUserId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Role CRUD
  async function createRole() {
    if (!newRole.name.trim()) { onToast?.(t('toast_role_name_required'), 'error'); return; }
    try {
      await apiCreateRole({ name: newRole.name, description: newRole.description, permission_ids: newRole.permission_ids });
      setNewRole({ name: '', description: '', permission_ids: [] });
      onToast?.(t('toast_role_created'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  function openEditRole(role) {
    setEditingRole({
      ...role,
      permission_ids: (role.permissions || []).map(p => p.id),
    });
  }

  async function saveEditRole() {
    if (!editingRole) return;
    try {
      await apiUpdateRole(editingRole.id, { name: editingRole.name, description: editingRole.description, permission_ids: editingRole.permission_ids });
      setEditingRole(null);
      onToast?.(t('toast_role_updated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  async function removeRole(roleId) {
    if (!await confirmDialog(t('delete') + '?')) return;
    try {
      await apiDeleteRole(roleId);
      onToast?.(t('toast_role_deleted'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    }
  }

  // User CRUD
  async function deleteUser(userId) {
    if (!await confirmDialog(t('delete') + '?')) return;
    setDeletingUserId(userId);
    try {
      await apiDeleteUser(userId);
      setOpenMenuUserId(null);
      setSelectedIds(prev => prev.filter(id => id !== userId));
      onToast?.(t('toast_user_deleted'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setDeletingUserId(null);
    }
  }

  async function bulkDeleteUsers() {
    if (selectedIds.length === 0) return;
    if (!await confirmDialog(selectedIds.length + ' ' + t('delete') + '?')) return;
    setBulkDeleting(true);
    try {
      await apiDeleteUsersBulk(selectedIds);
      setSelectedIds([]);
      onToast?.(t('toast_user_deleted'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setBulkDeleting(false);
    }
  }

  function openEditUser(u) {
    setEditingUser(u);
    setEditUserForm({
      full_name: u.full_name || '',
      phone: u.phone || '',
      email: u.email || '',
      password: '',
      status: u.status || 'active',
      role_ids: regularRolesOf(u).map(r => r.id),
    });
    setOpenMenuUserId(null);
  }

  async function saveEditUser() {
    if (!editUserForm.full_name || !editUserForm.phone) { onToast?.(t('toast_required_fields'), 'error'); return; }
    setSavingEditUser(true);
    try {
      const payload = {
        full_name: editUserForm.full_name,
        phone: editUserForm.phone,
        email: editUserForm.email || undefined,
        status: editUserForm.status,
      };
      if (editUserForm.password) payload.password = editUserForm.password;
      await apiUpdateUser(editingUser.id, payload);
      // keep the hidden personal-permissions role attached across role edits
      const personal = personalRoleOf(editingUser);
      const ids = editUserForm.role_ids.map(Number);
      if (personal?.id && !ids.includes(personal.id)) ids.push(personal.id);
      await apiUpdateUserRoles(editingUser.id, ids);
      setEditingUser(null);
      onToast?.(t('toast_user_updated'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSavingEditUser(false);
    }
  }

  async function createUser() {
    if (!userForm.full_name || !userForm.phone || !userForm.password) { onToast?.(t('toast_required_fields'), 'error'); return; }
    setSavingUser(true);
    try {
      const res = await apiCreateUser({
        full_name: userForm.full_name,
        phone: userForm.phone,
        email: userForm.email || undefined,
        password: userForm.password,
        status: userForm.status,
        is_super_admin: userForm.is_super_admin,
      });
      const newUserId = res?.data?.id;
      if (newUserId && userForm.role_ids.length > 0) {
        await apiUpdateUserRoles(newUserId, userForm.role_ids.map(Number));
      }
      setShowCreateUser(false);
      setUserForm({ full_name: '', phone: '', email: '', password: '', status: 'active', is_super_admin: false, role_ids: [] });
      onToast?.(t('toast_user_created'));
      load();
    } catch (e) {
      onToast?.(e.message, 'error');
    } finally {
      setSavingUser(false);
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const selectableUsers = users.filter(u => !u.is_super_admin);
  const allSelected = selectableUsers.length > 0 && selectableUsers.every(u => selectedIds.includes(u.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableUsers.map(u => u.id));
    }
  }

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.UserGear}/>
        <div>
          <h1 className="page-title">{t('users_heading')}</h1>
          <div className="page-sub">{users.length} {t('users_tab_users').toLowerCase()} · {roles.length} {t('users_tab_roles').toLowerCase()}</div>
        </div>
        {tab === 'users' && (
          <div className="page-actions">
            {selectedIds.length > 0 && (
              <button className="btn danger" onClick={bulkDeleteUsers} disabled={bulkDeleting}>
                <I.Trash2 size={14} /> {bulkDeleting ? t('deleting') : `${selectedIds.length} ${t('delete')}`}
              </button>
            )}
            <button className="btn primary" onClick={() => setShowCreateUser(true)}><I.UserPlus size={15} /> {t('users_new')}</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tabs">
          <button type="button" className={'tab' + (tab === 'users' ? ' active' : '')} onClick={() => setTab('users')}><I.Users size={15}/> {t('users_tab_users')} <span className="chip" style={{ height: 20 }}>{users.length}</span></button>
          <button type="button" className={'tab' + (tab === 'roles' ? ' active' : '')} onClick={() => setTab('roles')}><I.Shield size={15}/> {t('users_tab_roles')} <span className="chip" style={{ height: 20 }}>{visibleRoles.length}</span></button>
        </div>
      </div>

      {tab === 'users' && (
        <div>
          <div className="table-toolbar" style={{ marginBottom: 14 }}>
            <label className="check-line">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              {t('all')}
            </label>
            {selectedIds.length > 0 && <span className="chip solid">{selectedIds.length}</span>}
            <span className="toolbar-meta"><I.Users size={16}/> {users.length} {tp('team_members', users.length)}</span>
          </div>
          {users.length === 0 && <div className="card empty">{t('users_not_found')}</div>}
          <div className="user-grid">
            {users.map((u) => {
              const isSelected = selectedIds.includes(u.id);
              const roleList = regularRolesOf(u);
              const personal = personalRoleOf(u);
              return (
                <div key={u.id} className={'user-card' + (isSelected ? ' selected' : '')}>
                  {u.is_super_admin && <span className="crown">Super Admin</span>}
                  <div className="uc-top">
                    {!u.is_super_admin
                      ? <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(u.id)} aria-label={u.full_name} />
                      : <I.Sealed size={20} weight="fill" color="var(--accent-ink)"/>}
                    <div style={{ position: 'relative' }}>
                      <button className="icon-btn plain" aria-label="Actions" onClick={(e) => {
                        e.stopPropagation();
                        if (openMenuUserId === u.id) {
                          setOpenMenuUserId(null);
                        } else {
                          setMenuPos(menuPosition(e.currentTarget, u.is_super_admin ? 1 : 3));
                          setOpenMenuUserId(u.id);
                        }
                      }}><I.More size={18} /></button>
                      {openMenuUserId === u.id && (
                        <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                          <button className="menu-item" onClick={() => openEditUser(u)}>
                            <I.Edit size={15} /> {t('edit')}
                          </button>
                          {!u.is_super_admin && (
                            <button className="menu-item" onClick={() => openUserPerms(u)}>
                              <I.Key size={15} /> {t('users_perms_menu')}
                            </button>
                          )}
                          {!u.is_super_admin && (
                            <button className="menu-item danger" onClick={() => deleteUser(u.id)} disabled={deletingUserId === u.id}>
                              <I.Trash2 size={15} /> {deletingUserId === u.id ? t('deleting') : t('delete')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="uc-who">
                    <div className="avatar lg" style={{ background: u.is_super_admin ? 'var(--ink)' : avatarColor(u.id), color: u.is_super_admin ? 'var(--accent)' : '#fff' }}>
                      {getInitials(u.full_name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="uc-name">{u.full_name}</div>
                      <div className="uc-roles">
                        {u.is_super_admin
                          ? <Badge tone="accent" icon={I.Sealed}>Super Admin</Badge>
                          : (roleList.length > 0 || personal)
                            ? <>
                                {roleList.map(r => <span key={r.id} className="chip navy"><I.Shield size={13}/> {r.name}</span>)}
                                {personal && <span className="chip accent" title={t('users_perms_menu')}><I.Key size={13}/> +{(personal?.permissions || []).length}</span>}
                              </>
                            : <span className="chip">—</span>}
                      </div>
                    </div>
                  </div>
                  <div className="uc-contact">
                    <span><I.Phone size={15}/> {u.phone || '—'}</span>
                    <span><I.Mail size={15}/> {u.email || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {userStatusBadge(u.status, t)}
                    <button className="btn sm ghost" onClick={() => openEditUser(u)}><I.Edit size={14}/> {t('edit')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="split">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('users_role_name_col')}</th><th>{t('users_perms_col')}</th><th style={{ width: 72 }}></th></tr></thead>
              <tbody>
                {visibleRoles.length === 0 && <tr className="static"><td colSpan={3} className="empty-cell">{t('users_role_no_found')}</td></tr>}
                {visibleRoles.map((r) => (
                  <tr key={r.id} className="static">
                    <td>
                      <div style={{ fontWeight: 750 }}>{r.name}</div>
                      {r.description && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 1 }}>{r.description}</div>}
                    </td>
                    <td>
                      {(r.permissions || []).length === 0
                        ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {(r.permissions || []).slice(0, 5).map(p => (
                              <span key={p.id} className="perm-tag">{p.description}</span>
                            ))}
                            {(r.permissions || []).length > 5 && (
                              <span className="perm-tag" style={{ background: 'var(--text)', color: 'var(--bg)' }}>+{(r.permissions || []).length - 5}</span>
                            )}
                          </div>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="icon-btn plain" aria-label={t('edit')} title={t('edit')} onClick={() => openEditRole(r)}><I.Edit size={15} /></button>
                        <button className="icon-btn plain danger" aria-label={t('delete')} title={t('delete')} onClick={() => removeRole(r.id)}><I.Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>{t('users_new_role_card')}</div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>{t('users_role_name_req')}</label>
              <input value={newRole.name} onChange={(e) => setNewRole((p) => ({ ...p, name: e.target.value }))} placeholder="" />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>{t('users_role_desc')}</label>
              <input value={newRole.description} onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))} placeholder="" />
            </div>
            <div className="section-label" style={{ marginTop: 4 }}>{t('users_perms_label')}</div>
            <PermSelector
              ids={newRole.permission_ids}
              onChange={ids => setNewRole(p => ({ ...p, permission_ids: ids }))}
              permissions={permissions}
            />
            <button className="btn primary block" style={{ marginTop: 14 }} onClick={createRole}><I.Check size={15} /> {t('save')}</button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUser && (
        <Modal icon={I.UserPlus}
          onClose={() => setShowCreateUser(false)}
          title={t('users_create_user_modal')}
          footer={
            <>
              <button className="btn ghost" onClick={() => setShowCreateUser(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={createUser} disabled={savingUser}>
                {savingUser ? t('saving') : t('users_create_action')}
              </button>
            </>
          }
        >
          <div className="form-row">
            <div className="field col-span-2">
              <label>{t('users_fio_label')} *</label>
              <input value={userForm.full_name} onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))} placeholder="" />
            </div>
            <div className="field">
              <label>{t('profile_phone')} *</label>
              <input value={userForm.phone} onChange={e => setUserForm(p => ({ ...p, phone: e.target.value }))} placeholder="+998901234567" />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="field">
              <label>{t('users_pwd_label')}</label>
              <input type="password" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <div className="field">
              <label>{t('users_col_status')}</label>
              <SearchableSelect
                value={userForm.status}
                onChange={v => setUserForm(p => ({ ...p, status: v }))}
                options={[{ value: 'active', label: t('users_active_chip') }, { value: 'inactive', label: t('users_inactive_chip') }]}
              />
            </div>
            <div className="field col-span-2">
              <label>{t('users_role_select_label')}</label>
              <RolePicker roles={visibleRoles} value={userForm.role_ids} onChange={ids => setUserForm(p => ({ ...p, role_ids: ids }))}/>
            </div>
            <div className="field col-span-2">
              <label className="check-line">
                <input type="checkbox" checked={userForm.is_super_admin} onChange={e => setUserForm(p => ({ ...p, is_super_admin: e.target.checked }))} />
                Super Admin
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <Modal icon={I.UserGear}
          onClose={() => setEditingUser(null)}
          title={t('users_edit_user_modal')}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditingUser(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveEditUser} disabled={savingEditUser}>
                {savingEditUser ? t('saving') : t('save')}
              </button>
            </>
          }
        >
          <div className="form-row">
            <div className="field col-span-2">
              <label>{t('users_fio_label')} *</label>
              <input value={editUserForm.full_name} onChange={e => setEditUserForm(p => ({ ...p, full_name: e.target.value }))} placeholder="" />
            </div>
            <div className="field">
              <label>{t('profile_phone')} *</label>
              <input value={editUserForm.phone} onChange={e => setEditUserForm(p => ({ ...p, phone: e.target.value }))} placeholder="+998901234567" />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={editUserForm.email} onChange={e => setEditUserForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="field">
              <label>{t('users_new_pwd_label')}</label>
              <input type="password" value={editUserForm.password} onChange={e => setEditUserForm(p => ({ ...p, password: e.target.value }))} placeholder="" />
            </div>
            <div className="field">
              <label>{t('users_col_status')}</label>
              <SearchableSelect
                value={editUserForm.status}
                onChange={v => setEditUserForm(p => ({ ...p, status: v }))}
                options={[{ value: 'active', label: t('users_active_chip') }, { value: 'inactive', label: t('users_inactive_chip') }]}
              />
            </div>
            {!editingUser.is_super_admin && (
              <div className="field col-span-2">
                <label>{t('users_tab_roles')}</label>
                <RolePicker roles={visibleRoles} value={editUserForm.role_ids} onChange={ids => setEditUserForm(p => ({ ...p, role_ids: ids }))}/>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Per-user permissions modal */}
      {permUser && (
        <Modal icon={I.Key}
          onClose={() => setPermUser(null)}
          title={t('users_perms_title')}
          subtitle={permUser.full_name}
          footer={
            <>
              <button className="btn ghost" onClick={() => setPermUser(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveUserPerms} disabled={savingPerms}>
                {savingPerms ? t('saving') : t('save')}
              </button>
            </>
          }
        >
          {(() => {
            const base = rolePermIds(permUser);
            const basePerms = permissions.filter(p => base.has(p.id));
            const extraCandidates = permissions.filter(p => !base.has(p.id));
            return (
              <>
                {basePerms.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div className="section-label">{t('users_perms_from_roles')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {basePerms.map(p => (
                        <span key={p.id} className="chip navy" style={{ fontSize: 10.5 }}>{p.description}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="section-label" style={{ marginBottom: 4 }}>{t('users_perms_extra')}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>{t('users_perms_hint')}</div>
                <PermSelector
                  ids={permExtraIds}
                  onChange={setPermExtraIds}
                  permissions={extraCandidates}
                />
              </>
            );
          })()}
        </Modal>
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <Modal icon={I.Shield}
          onClose={() => setEditingRole(null)}
          title={t('users_edit_role_modal')}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditingRole(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveEditRole}><I.Check size={14} /> {t('save')}</button>
            </>
          }
        >
          <div className="field" style={{ marginBottom: 10 }}>
            <label>{t('users_role_name_req')}</label>
            <input value={editingRole.name} onChange={e => setEditingRole(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>{t('users_role_desc')}</label>
            <input value={editingRole.description || ''} onChange={e => setEditingRole(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="section-label" style={{ marginTop: 4 }}>{t('users_perms_label')}</div>
          <PermSelector
            ids={editingRole.permission_ids}
            onChange={ids => setEditingRole(p => ({ ...p, permission_ids: ids }))}
            permissions={permissions}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

