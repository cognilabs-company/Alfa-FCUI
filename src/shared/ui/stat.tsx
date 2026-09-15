// @ts-nocheck
import React from 'react';
import { Icon } from './icons';

/**
 * Scoreboard tile.
 * tone: default | success | warning | danger | accent | navy (legacy alias of default)
 * feature: dark "floodlight" variant for the headline number of a page.
 */
export function Stat({ label, value, sub, tone = 'default', icon: Ic, feature = false, onClick }) {
  const toneClass = tone && tone !== 'default' && tone !== 'navy' ? ' tone-' + tone : '';
  const interactive = typeof onClick === 'function';
  return (
    <div
      className={'stat' + toneClass + (feature ? ' feature' : '') + (interactive ? ' clickable' : '')}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
    >
      <div className="stat-head">
        <div className="stat-label">{label}</div>
        {Ic && <div className="stat-icon"><Ic size={18} /></div>}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {interactive && <span className="stat-arrow"><Icon.ArrowRight size={16}/></span>}
    </div>
  );
}
