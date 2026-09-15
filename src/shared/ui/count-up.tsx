// @ts-nocheck
import React from 'react';
import { fmt } from '@/shared/lib/format';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// easeOutExpo: fast start, long soft landing — reads like money piling up
const ease = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

export const intFormat = (n) => fmt.format(Math.round(n));

/**
 * Animated number: rolls from 0 (or the previously shown value) to `value`.
 * format(current, target) renders each frame; defaults to a grouped integer.
 */
export function CountUp({ value, format = intFormat, duration = 1600, delay = 0, className }) {
  const target = Number(value) || 0;
  const [shown, setShown] = React.useState(() => (reducedMotion() ? target : 0));
  const current = React.useRef(reducedMotion() ? target : 0);

  React.useEffect(() => {
    if (reducedMotion()) { current.current = target; setShown(target); return; }
    const from = current.current;
    if (from === target) return;
    let raf = 0;
    let start = 0;
    const tick = (ts) => {
      if (!start) start = ts + delay;
      const p = Math.max(0, Math.min(1, (ts - start) / duration));
      const v = from + (target - from) * ease(p);
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay]);

  return <span className={'count-up' + (className ? ' ' + className : '')}>{format(shown, target)}</span>;
}
