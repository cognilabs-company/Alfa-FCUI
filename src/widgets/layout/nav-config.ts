// @ts-nocheck
export const NAV_ITEMS = [
  { sectionKey: 'nav_main', items: [
    { id: 'dashboard', labelKey: 'nav_dashboard', icon: 'Dashboard', perm: 'reports:dashboard:view' },
  ]},
  { sectionKey: 'nav_study', items: [
    { id: 'students', labelKey: 'nav_students', icon: 'Student', perm: 'students:view' },
    { id: 'groups', labelKey: 'nav_groups', icon: 'UsersFour', perm: 'groups:view' },
    { id: 'sessions', labelKey: 'nav_sessions', icon: 'Calendar', perm: 'attendance:view' },
    { id: 'performance', labelKey: 'nav_performance', icon: 'Trophy', perm: 'sessions:manage' },
  ]},
  { sectionKey: 'nav_docs_finance', items: [
    { id: 'contracts', labelKey: 'nav_contracts', icon: 'FileText', perm: 'contracts:view' },
    { id: 'transactions', labelKey: 'nav_transactions', icon: 'Wallet', perm: 'finance:transactions:view' },
    { id: 'expenses', labelKey: 'nav_expenses', icon: 'Coins', perm: 'finance:expenses:view' },
    { id: 'reports', labelKey: 'nav_reports', icon: 'Reports', perm: 'finance:transactions:view' },
    // { id: 'gate', labelKey: 'gate_title', icon: 'Gate', perm: 'gate:logs:view' },
  ]},
  { sectionKey: 'nav_management', items: [
    { id: 'waiting-list', labelKey: 'nav_waiting_list', icon: 'Queue', perm: 'students:view' },
    { id: 'users', labelKey: 'nav_users', icon: 'UserGear', perm: 'users:manage' },
    { id: 'audit-logs', labelKey: 'nav_audit_logs', icon: 'Shield', perm: 'settings:system:view' },
    { id: 'settings', labelKey: 'nav_settings', icon: 'Settings', perm: 'settings:system:view' },
  ]},
];
