// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';

/**
 * Switch between the roster and the queue of children whose documents have not
 * arrived yet. Both are the Students section, so the strip sits on both pages.
 * Rendered only when the host passes onChange — a screen without the pending
 * route stays exactly as it was.
 */
export function StudentsTabs({ active, onChange }) {
  const I = Icon;
  const { t } = useT();
  if (!onChange) return null;
  const tabs = [
    { key: 'students', label: t('ps_students_tab'), icon: I.Student },
    { key: 'pending', label: t('ps_tab'), icon: I.Clipboard },
  ];
  return (
    <div className="seg" style={{ marginBottom: 14 }} role="tablist">
      {tabs.map(tb => (
        <button key={tb.key} type="button" role="tab" aria-selected={active === tb.key}
          className={active === tb.key ? 'active' : ''}
          onClick={() => active !== tb.key && onChange(tb.key)}>
          <tb.icon size={16} weight={active === tb.key ? 'fill' : 'duotone'}/> {tb.label}
        </button>
      ))}
    </div>
  );
}
