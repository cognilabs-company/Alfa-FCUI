// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { AlphaWordmark, BrandMark } from '@/shared/ui/logo';
import { useT } from '@/shared/i18n/lang';
import { hasPerm } from '@/shared/lib/rbac';
import { getInitials } from '@/shared/lib/avatar';
import { NAV_ITEMS } from './nav-config';

export function Sidebar({ active, onNav, role, userPermissions = [], collapsed, onToggle, user, mobileOpen, onSignOut }) {
  const I = Icon;
  const { t } = useT();
  const fullName = user?.full_name || user?.name || user?.email || 'Alpha User';
  // Backend permissions (incl. per-user grants) extend the local role map,
  // so personally-granted sections appear in the nav too.
  const grantedPerms = React.useMemo(
    () => new Set((userPermissions || []).map(p => typeof p === 'string' ? p : (p?.code || p?.name)).filter(Boolean)),
    [userPermissions]
  );

  const sections = React.useMemo(() => {
    const seen = new Set();
    return NAV_ITEMS.map(section => ({
      ...section,
      items: section.items.filter(it => {
        if (!hasPerm(role, it.perm) && !grantedPerms.has(it.perm)) return false;
        if (seen.has(it.id)) return false;
        seen.add(it.id);
        return true;
      }),
    })).filter(section => section.items.length > 0);
  }, [role, grantedPerms]);

  const toggleLabel = collapsed ? t('nav_expand') : t('nav_collapse');

  return (
    <aside className={'sidebar' + (mobileOpen ? ' mobile-open' : '')} aria-label="Main navigation">
      <div className="sidebar-header">
        {collapsed ? <BrandMark size={40}/> : <AlphaWordmark height={40}/>}
        <button className="sidebar-toggle" onClick={onToggle} title={toggleLabel} aria-label={toggleLabel}>
          {mobileOpen ? <I.X size={18}/> : collapsed ? <I.ChevronRight size={18}/> : <I.ChevronLeft size={18}/>}
        </button>
      </div>

      <nav className="nav">
        {sections.map(section => (
          <React.Fragment key={section.sectionKey}>
            <div className="nav-section">{collapsed ? '' : t(section.sectionKey)}</div>
            {section.items.map(it => {
              const Ic = I[it.icon];
              const label = t(it.labelKey);
              const isActive = active === it.id;
              return (
                <button key={it.id}
                  type="button"
                  className={'nav-item' + (isActive ? ' active' : '')}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNav(it.id)}
                  title={collapsed ? label : undefined}>
                  <Ic size={18} strokeWidth={isActive ? 2.1 : 1.8}/>
                  {!collapsed && <>
                    <span>{label}</span>
                    {it.badge && <span className="nav-badge">{it.badge}</span>}
                  </>}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar" title={collapsed ? `${fullName} · ${role}` : undefined}>
          {getInitials(fullName)}
        </div>
        {!collapsed && (
          <div className="sidebar-user">
            <span className="name">{fullName}</span>
            <span className="role">{role}</span>
          </div>
        )}
        {onSignOut && (
          <button className="sidebar-toggle" onClick={onSignOut} title={t('topbar_logout')} aria-label={t('topbar_logout')}>
            <I.Logout size={17}/>
          </button>
        )}
      </div>
    </aside>
  );
}
