// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { Sidebar, Topbar } from '@/widgets/layout';
import { normalizeRoleName } from '@/shared/lib/rbac';
import { LoginScreen } from '@/pages/login';
import { Dashboard } from '@/pages/dashboard';
import { StudentsList, StudentProfile, StudentNew } from '@/pages/students';
import { GroupsScreen } from '@/pages/groups';
import { SessionsScreen } from '@/pages/sessions';
import { AttendanceMark } from '@/pages/attendance';
import { PerformanceTable } from '@/pages/performance';
import { ContractsScreen, ContractView } from '@/pages/contracts';
import { GateScreen } from '@/pages/gate';
import { UsersScreen } from '@/pages/users';
import { SettingsScreen } from '@/pages/settings';
import { TransactionsScreen } from '@/pages/transactions';
import { ReportsScreen } from '@/pages/reports';
import { WaitingListScreen } from '@/pages/waiting-list';
import { AuditLogsScreen } from '@/pages/audit-logs';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect } from '@/shared/ui/tweaks-panel';
import { BrandMark } from '@/shared/ui/logo';
import { DialogHost } from '@/shared/ui/dialogs';
import { NAV_ITEMS } from '@/widgets/layout/nav-config';
import { MaintenanceScreen } from '@/pages/maintenance';
import { MAINTENANCE_MODE, isMaintenanceExempt } from '@/shared/lib/maintenance';
import { apiGetMe, apiLogout, getToken, setUnauthorizedHandler } from '@/shared/api';
import { applyAppearance } from '@/shared/lib/appearance';
import { LangProvider, useT } from '@/shared/i18n/lang';

const __TWEAK_DEFAULTS = {
  theme: localStorageGet('alpha_theme') || 'light',
  density: 'default',
  accent: 'volt',
  role: 'Super Admin',
};

function localStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function useMediaQuery(query) {
  const [matches, setMatches] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Apply theme + accent before the first paint so the splash never flashes
// the wrong palette.
document.documentElement.setAttribute('data-theme', __TWEAK_DEFAULTS.theme);
applyAppearance();

export default function App() {
  return (
    <LangProvider>
      <AppShell/>
    </LangProvider>
  );
}

function AppShell() {
  const { t } = useT();
  const [tw, setTweak] = useTweaks(__TWEAK_DEFAULTS);
  const T = { ...tw, setTweak };
  const [loggedIn, setLoggedIn] = React.useState(() => !!getToken());
  const [currentUser, setCurrentUser] = React.useState(null);
  const [permissions, setPermissions] = React.useState([]);
  const [authLoading, setAuthLoading] = React.useState(() => !!getToken());
  const [meChecked, setMeChecked] = React.useState(false);
  const [route, setRoute] = React.useState(() => localStorage.getItem('alpha_route') || 'dashboard');
  const [studentId, setStudentId] = React.useState(() => localStorage.getItem('alpha_student_id'));
  const [sessionId, setSessionId] = React.useState(() => localStorage.getItem('alpha_session_id'));
  const [groupId, setGroupId] = React.useState(() => localStorage.getItem('alpha_group_id'));
  const [contractId, setContractId] = React.useState(() => localStorage.getItem('alpha_contract_id'));
  const [navCollapsed, setNavCollapsed] = React.useState(() => localStorageGet('alpha_nav') === 'collapsed');
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);
  const contentRef = React.useRef(null);
  const isNarrow = useMediaQuery('(max-width: 900px)');

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      setLoggedIn(false);
      setCurrentUser(null);
      setPermissions([]);
    });
  }, []);

  React.useEffect(() => {
    if (!loggedIn) { setAuthLoading(false); setMeChecked(false); return; }
    setMeChecked(false);
    apiGetMe().then(res => {
      if (res?.user) {
        setCurrentUser(res.user);
        setPermissions(res.permissions || []);
        let roleName;
        if (res.user?.is_super_admin) {
          roleName = 'Super Admin';
        } else {
          // ignore hidden per-user permission roles ("__user_<id>")
          const rawRole = res.user?.roles?.filter(r => !String(r?.name || '').startsWith('__user_'))?.[0]?.name;
          roleName = (rawRole ? normalizeRoleName(rawRole) : null) || rawRole || 'Coach';
        }
        setTweak('role', roleName);
      } else {
        setLoggedIn(false);
      }
    }).catch(() => setLoggedIn(false))
      .finally(() => { setAuthLoading(false); setMeChecked(true); });
  }, [loggedIn]);

  React.useEffect(() => { localStorage.setItem('alpha_route', route); }, [route]);
  React.useEffect(() => {
    if (studentId == null) {
      localStorage.removeItem('alpha_student_id');
    } else {
      localStorage.setItem('alpha_student_id', String(studentId));
    }
  }, [studentId]);
  // Persist selected ids so detail routes survive a page refresh
  React.useEffect(() => {
    if (sessionId == null) localStorage.removeItem('alpha_session_id');
    else localStorage.setItem('alpha_session_id', String(sessionId));
  }, [sessionId]);
  React.useEffect(() => {
    if (groupId == null) localStorage.removeItem('alpha_group_id');
    else localStorage.setItem('alpha_group_id', String(groupId));
  }, [groupId]);
  React.useEffect(() => {
    if (contractId == null) localStorage.removeItem('alpha_contract_id');
    else localStorage.setItem('alpha_contract_id', String(contractId));
  }, [contractId]);
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', T.theme);
    try { localStorage.setItem('alpha_theme', T.theme); } catch { /* private mode */ }
  }, [T.theme]);
  React.useEffect(() => { document.documentElement.setAttribute('data-density', T.density); }, [T.density]);
  React.useEffect(() => {
    try { localStorage.setItem('alpha_nav', navCollapsed ? 'collapsed' : 'expanded'); } catch { /* private mode */ }
  }, [navCollapsed]);

  // Every route change starts at the top of the page
  React.useEffect(() => { contentRef.current?.scrollTo?.(0, 0); }, [route, studentId, contractId, sessionId]);

  React.useEffect(() => () => clearTimeout(toastTimer.current), []);

  // notify.success / notify.error from anywhere in the app land in the toast
  React.useEffect(() => {
    const onToast = (e) => showToast(e.detail?.message, e.detail?.type);
    window.addEventListener('alpha:toast', onToast);
    return () => window.removeEventListener('alpha:toast', onToast);
  }, []);

  function navigate(r) {
    setRoute(r);
    setMobileNavOpen(false);
    setStudentId(null);
    setSessionId(null);
    setGroupId(null);
  }

  function showToast(msg, type = 'success') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), type === 'error' ? 4200 : 2600);
  }

  function handleSignOut() {
    apiLogout();
    setLoggedIn(false);
    setCurrentUser(null);
    setPermissions([]);
  }

  if (authLoading || (loggedIn && !meChecked)) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <BrandMark size={64}/>
          <div className="splash-bar" aria-hidden="true"/>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--frame-muted)' }}>{t('loading')}</span>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)}/>;
  }

  // Maintenance: only the owner account may use the system right now
  if (MAINTENANCE_MODE && !isMaintenanceExempt(currentUser)) {
    return <MaintenanceScreen onSignOut={handleSignOut}/>;
  }

  let crumbKeys = ['app_name'];
  let activeNav = route;
  if (route === 'dashboard') crumbKeys.push('nav_dashboard');
  if (route === 'students') crumbKeys.push('nav_students');
  if (route === 'students-profile') { crumbKeys.push('nav_students'); crumbKeys.push('crumb_profile'); activeNav = 'students'; }
  if (route === 'students-new') { crumbKeys.push('nav_students'); crumbKeys.push('crumb_new'); activeNav = 'students'; }
  if (route === 'groups') crumbKeys.push('nav_groups');
  if (route === 'sessions') crumbKeys.push('nav_sessions');
  if (route === 'attendance') crumbKeys.push('crumb_attendance');
  if (route === 'attendance-mark') { crumbKeys.push('nav_sessions'); crumbKeys.push('crumb_attendance'); activeNav = 'sessions'; }
  if (route === 'performance') crumbKeys.push('nav_performance');
  if (route === 'contracts') crumbKeys.push('nav_contracts');
  if (route === 'contracts-view') { crumbKeys.push('nav_contracts'); crumbKeys.push('crumb_view'); activeNav = 'contracts'; }
  if (route === 'transactions') crumbKeys.push('nav_transactions');
  if (route === 'gate') crumbKeys.push('nav_gate');
  if (route === 'users') crumbKeys.push('nav_users');
  if (route === 'roles') crumbKeys.push('crumb_roles');
  if (route === 'settings') crumbKeys.push('nav_settings');
  if (route === 'reports') crumbKeys.push('nav_reports');
  if (route === 'reports-debtors') { crumbKeys.push('nav_reports'); crumbKeys.push('rpt_debtors'); activeNav = 'reports'; }
  if (route === 'waiting-list') crumbKeys.push('nav_waiting_list');
  if (route === 'audit-logs') crumbKeys.push('nav_audit_logs');

  // Section name shown above each page title ("O'quv jarayoni", …)
  const section = NAV_ITEMS.find(sec => sec.items.some(it => it.id === activeNav));
  const eyebrow = section ? JSON.stringify(t(section.sectionKey)) : 'none';
  const pageKey = [route, studentId, contractId, sessionId].join(':');

  return (
    <div className="app" data-nav={navCollapsed && !isNarrow ? 'collapsed' : 'expanded'}>
      <Sidebar
        active={activeNav}
        onNav={(id) => {
          navigate(id);
        }}
        role={T.role}
        userPermissions={permissions}
        collapsed={navCollapsed && !isNarrow}
        onToggle={() => mobileNavOpen ? setMobileNavOpen(false) : setNavCollapsed(!navCollapsed)}
        user={currentUser}
        mobileOpen={mobileNavOpen}
        onSignOut={handleSignOut}
      />
      {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <div className="main">
        <Topbar
          crumbs={crumbKeys}
          role={T.role}
          onRoleSwitch={(r) => { T.setTweak('role', r); showToast(`${t('toast_role_switched')}: ${r}`); }}
          canSwitchRole={!!(currentUser?.is_super_admin || currentUser?.roles?.some(r => normalizeRoleName(r.name) === 'Super Admin'))}
          theme={T.theme}
          onTheme={(th) => T.setTweak('theme', th)}
          onSignOut={handleSignOut}
          user={currentUser}
          onMenu={() => setMobileNavOpen(true)}
          onNavigate={(type, id) => {
            if (type === 'student') { setStudentId(id); setRoute('students-profile'); }
          }}
        />
        <div className="content" ref={contentRef} style={{ '--page-eyebrow': eyebrow }}>
          <div key={pageKey} className="page-enter">
          {route === 'dashboard' && <Dashboard role={T.role} user={currentUser} onNav={navigate} onOpenGroup={(id) => { setGroupId(id); setRoute('groups'); }}/>}
          {route === 'students' && <StudentsList onOpen={(id) => { setStudentId(id); setRoute('students-profile'); }} onNew={() => setRoute('students-new')} onToast={showToast}/>}
          {route === 'students-profile' && <StudentProfile studentId={studentId} onBack={() => navigate('students')}/>}
          {route === 'students-new' && <StudentNew onBack={() => navigate('students')} onCreated={() => { showToast(t('toast_student_created')); navigate('students'); }} onViewContract={(cid) => { setContractId(cid); navigate('contracts-view'); }}/>}
          {route === 'groups' && <GroupsScreen onOpen={(id) => { setGroupId(id); }} selectedGroupId={groupId} onCloseGroup={() => setGroupId(null)} onToast={showToast} onOpenStudent={(id) => { setStudentId(id); setRoute('students-profile'); }} />}
          {(route === 'sessions' || route === 'attendance') && <SessionsScreen onMark={(id) => { setSessionId(id); setRoute('attendance-mark'); }}/>}
          {route === 'attendance-mark' && <AttendanceMark sessionId={sessionId} onBack={() => navigate('sessions')}/>}
          {route === 'performance' && <PerformanceTable/>}
          {route === 'contracts' && <ContractsScreen onOpenContract={(id) => { setContractId(id); setRoute('contracts-view'); }} onNavigateToStudent={(id) => { setStudentId(id); setRoute('students-profile'); }} onToast={showToast}/>}
          {route === 'contracts-view' && <ContractView contractId={contractId} onBack={() => navigate('contracts')} onToast={showToast} onNavigateToStudent={(id) => { setStudentId(id); setRoute('students-profile'); }}/>}
          {route === 'transactions' && <TransactionsScreen onToast={showToast}/>}
          {route === 'gate' && <GateScreen/>}
          {(route === 'users' || route === 'roles') && (
            <UsersScreen
              initialView={route === 'roles' ? 'roles' : 'users'}
              onToast={showToast}
            />
          )}
          {route === 'settings' && <SettingsScreen theme={T.theme} setTheme={(th) => T.setTweak('theme', th)}/>}
          {route === 'reports' && <ReportsScreen onNav={navigate}/>}
          {route === 'reports-debtors' && <ReportsScreen initialTab="debtors" onNav={navigate}/>}
          {route === 'waiting-list' && <WaitingListScreen onToast={showToast}/>}
          {route === 'audit-logs' && <AuditLogsScreen/>}
          </div>
        </div>
      </div>

      {toast && (
        <div key={toast.key} className={'toast' + (toast.type === 'error' ? ' error' : '')} role={toast.type === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon">
            {toast.type === 'error' ? <Icon.AlertTriangle size={17} weight="fill"/> : <Icon.CheckCircle size={18} weight="fill"/>}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}

      <DialogHost/>
      <AlphaTweaks T={T}/>
    </div>
  );
}

function AlphaTweaks({ T }) {
  return (
    <TweaksPanel title="Tweaks · Alpha CIMS">
      <TweakSection label="Tema">
        <TweakRadio label="Rejim" value={T.theme} options={[{ label: 'Yorugʼ', value: 'light' }, { label: "Qorong'i", value: 'dark' }]} onChange={v => T.setTweak('theme', v)}/>
        <TweakRadio label="Zichlik" value={T.density} options={[{ label: 'Compact', value: 'compact' }, { label: 'Default', value: 'default' }, { label: 'Roomy', value: 'comfortable' }]} onChange={v => T.setTweak('density', v)}/>
      </TweakSection>
      <TweakSection label="Foydalanuvchi roli">
        <TweakSelect label="Rol" value={T.role}
          options={[
            { label: 'Super Admin (barchasi)', value: 'Super Admin' },
            { label: "Admin (o'quvchilar, guruh)", value: 'Admin' },
            { label: "Director (faqat ko'rish)", value: 'Director' },
            { label: 'Head Coach (sessiya, davomat)', value: 'Head Coach' },
            { label: "Coach (o'z guruhi)", value: 'Coach' },
            { label: 'Accountant (moliya)', value: 'Accountant' },
          ]}
          onChange={v => T.setTweak('role', v)}/>
      </TweakSection>
    </TweaksPanel>
  );
}
