// @ts-nocheck
import React from 'react';
import { Icon } from './icons';
import { CountUp } from './count-up';

/**
 * Scoreboard tile.
 * tone: default | success | warning | danger | accent | info | navy (legacy alias of default)
 * feature: dark "floodlight" variant for the headline number of a page.
 * Numeric `value` rolls up from 0; pass `format(current, target)` for money etc.
 * `unit` renders a small suffix (e.g. so'm) next to an animated value.
 */
export function Stat({ label, value, sub, tone = 'default', icon: Ic, feature = false, onClick, format, unit, children, delay = 0 }) {
  const toneClass = tone && tone !== 'default' && tone !== 'navy' ? ' tone-' + tone : '';
  const interactive = typeof onClick === 'function';
  const animated = typeof value === 'number' && Number.isFinite(value);
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
        {Ic && <div className="stat-icon"><Ic size={20} weight={feature ? 'fill' : 'duotone'} /></div>}
      </div>
      <div className="stat-value">
        {animated ? <CountUp value={value} format={format} delay={delay}/> : value}
        {unit && <small> {unit}</small>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      {children}
      {interactive && <span className="stat-arrow"><Icon.ArrowUpRight size={16}/></span>}
    </div>
  );
}
