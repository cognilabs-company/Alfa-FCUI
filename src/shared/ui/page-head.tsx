// @ts-nocheck
import React from 'react';

/**
 * Icon tile shown at the start of a `.page-head`. The section eyebrow above
 * the title comes from App (CSS variable --page-eyebrow on .content).
 */
export function PageIcon({ icon: Ic }) {
  if (!Ic) return null;
  return (
    <span className="page-icon" aria-hidden="true">
      <Ic size={26} weight="duotone"/>
    </span>
  );
}
