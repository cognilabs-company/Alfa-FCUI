// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { BrandMark } from '@/shared/ui/logo';
import { useT } from '@/shared/i18n/lang';

/** Shown to every account except the owner while maintenance mode is on. */
export function MaintenanceScreen({ onSignOut }) {
  const { t } = useT();
  return (
    <div className="maint" role="alertdialog" aria-modal="true" aria-labelledby="maint-title" aria-describedby="maint-text">
      <div className="maint-card">
        <BrandMark size={52}/>
        <span className="maint-icon"><Icon.Wrench size={38} weight="duotone"/></span>
        <h1 id="maint-title">{t('maint_title')}</h1>
        <p id="maint-text">{t('maint_message')}</p>
        <div className="maint-eta"><Icon.Clock size={16} weight="fill"/> ~2 {t('maint_hours')}</div>
        <button className="btn lg" onClick={onSignOut}><Icon.Logout size={18}/> {t('topbar_logout')}</button>
      </div>
    </div>
  );
}
