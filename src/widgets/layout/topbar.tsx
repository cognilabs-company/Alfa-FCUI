// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { ROLE_PERMISSIONS } from '@/shared/lib/rbac';
import { getInitials } from '@/shared/lib/avatar';
import { revealFrom } from '@/shared/lib/view-transition';
import { ACCENTS, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, applyAppearance, isDefaultAppearance } from '@/shared/lib/appearance';

/** Open state + close on outside click / Escape for a popover anchored in `ref`. */
function usePopover() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function Topbar({ crumbs, role, onRoleSwitch, canSwitchRole, theme, onTheme, onSignOut, user, onNavigate, onMenu }) {
  const I = Icon;
  const { t, lang, setLang } = useT();
  const userMenu = usePopover();
  const fullName = user?.full_name || user?.name || user?.email || 'Alpha User';
  const initials = getInitials(fullName);

  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu-button" onClick={onMenu} aria-label="Open navigation">
        <I.Menu size={18}/>
      </button>
      <nav className="crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <I.ChevronRight size={13}/>}
            <span className={i === crumbs.length - 1 ? 'current' : ''}>{t(c) || c}</span>
          </React.Fragment>
        ))}
      </nav>
      <div className="topbar-actions">
        <LanguageMenu lang={lang} onSelect={(v, e) => revealFrom(e, () => setLang(v))}/>
        <AppearancePanel t={t}/>
        <button className="icon-btn" title={t('theme_toggle')} aria-label={t('theme_toggle')}
          onClick={(e) => revealFrom(e, () => onTheme(theme === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? <I.Sun size={17}/> : <I.Moon size={17}/>}
        </button>
        <div ref={userMenu.ref} style={{ position: 'relative' }}>
          <button className="user-chip" onClick={() => userMenu.setOpen(o => !o)} aria-haspopup="menu" aria-expanded={userMenu.open}>
            <div className="avatar">{initials}</div>
            <div className="user-chip-details">
              <span className="name">{fullName}</span>
              <span className="role">{role}</span>
            </div>
            <span className="user-chip-chevron"><I.ChevronDown size={14}/></span>
          </button>
          {userMenu.open && (
            <div className="popover" role="menu" style={{ width: 250 }}>
              {canSwitchRole && <>
                <div className="popover-label">{t('topbar_switch_role')}</div>
                {Object.keys(ROLE_PERMISSIONS).map(r => (
                  <button key={r} type="button" role="menuitemradio" aria-checked={r === role}
                    className={'menu-item' + (r === role ? ' selected' : '')}
                    onClick={() => { onRoleSwitch(r); userMenu.setOpen(false); }}>
                    <Icon.User size={15}/>
                    <span style={{ flex: 1 }}>{r}</span>
                    {r === role && <Icon.Check size={15}/>}
                  </button>
                ))}
                <div className="menu-sep"></div>
              </>}
              <button type="button" role="menuitem" className="menu-item danger" onClick={onSignOut}>
                <Icon.Logout size={15}/> {t('topbar_logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function LanguageMenu({ lang, onSelect }) {
  const I = Icon;
  const menu = usePopover();
  const items = [
    { value: 'uz', short: 'UZ', label: "O'zbekcha" },
    { value: 'ru', short: 'RU', label: 'Русский' },
  ];
  return (
    <div ref={menu.ref} style={{ position: 'relative' }}>
      <button type="button" className="language-button" title={lang === 'ru' ? 'Язык' : 'Til'}
        aria-haspopup="menu" aria-expanded={menu.open} onClick={() => menu.setOpen(o => !o)}>
        {lang === 'ru' ? 'RU' : 'UZ'} <I.ChevronDown size={13}/>
      </button>
      {menu.open && (
        <div className="popover" role="menu" style={{ minWidth: 176 }}>
          {items.map(it => {
            const selected = it.value === lang;
            return (
              <button key={it.value} type="button" role="menuitemradio" aria-checked={selected}
                className={'menu-item' + (selected ? ' selected' : '')}
                onClick={(e) => { menu.setOpen(false); if (!selected) onSelect(it.value, e); }}>
                <span className="kbd" style={{ minWidth: 26, textAlign: 'center' }}>{it.short}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {selected && <Icon.Check size={15}/>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AppearancePanel({ t }) {
  const I = Icon;
  const panel = usePopover();
  const [prefs, setPrefs] = React.useState(() => loadAppearance());

  function update(next, e) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveAppearance(merged);
    revealFrom(e, () => applyAppearance(merged));
  }

  return (
    <div ref={panel.ref} style={{ position: 'relative' }}>
      <button type="button" className="icon-btn" title={t('appearance_title')} aria-label={t('appearance_title')}
        aria-expanded={panel.open} onClick={() => panel.setOpen(o => !o)}>
        <I.Palette size={17}/>
        {!isDefaultAppearance(prefs) && <span className="dot" style={{ background: prefs.accent }}/>}
      </button>
      {panel.open && (
        <div className="popover" style={{ width: 236, padding: 8 }}>
          <div className="popover-label">{t('appearance_accent')}</div>
          <div className="swatches">
            {ACCENTS.map(c => {
              const active = prefs.accent.toLowerCase() === c.toLowerCase();
              return (
                <button key={c} type="button" className={'swatch' + (active ? ' active' : '')}
                  onClick={(e) => update({ accent: c }, e)} title={c} aria-label={c} aria-pressed={active}
                  style={{ background: c }}>
                  {active && <I.Check size={15} color="#0E1311" strokeWidth={2.6}/>}
                </button>
              );
            })}
          </div>
          {!isDefaultAppearance(prefs) && (
            <button type="button" className="btn ghost sm block" style={{ marginTop: 2 }}
              onClick={(e) => update({ ...DEFAULT_APPEARANCE }, e)}>
              {t('appearance_reset')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
