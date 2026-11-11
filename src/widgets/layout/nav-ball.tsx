// @ts-nocheck
import React from 'react';
import { AlphaShield } from '@/shared/ui/logo';

/*
 * The active side-nav link is marked by a small soccer ball carrying the
 * club crest. There is exactly one ball, absolutely positioned inside the
 * scrolling <nav>, so it can travel: when the active link changes it hops
 * from the old link to the new one (decaying bounces + spin) and sends a
 * soft ripple across the link it lands on.
 *
 * Purely decorative: aria-hidden, pointer-events: none, no layout impact.
 */

const BALL_EXPANDED = 22;
const BALL_COLLAPSED = 15;

/** Ball face: white leather, ink panels, the crest on the centre panel. */
export function SoccerBall({ size = 22 }) {
  const id = React.useId().replace(/:/g, '');
  const C = 32;
  const pt = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  // Seams leave the (hidden) centre pentagon and meet the outer panels.
  const seams = [];
  const panels = [];
  for (let k = 0; k < 5; k++) {
    const a = -90 + 72 * k;
    const [x1, y1] = pt(13, a);
    const [x2, y2] = pt(20, a);
    seams.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
    // Outer black panel between two seams, partly clipped by the rim.
    const pa = a + 36;
    const [cx, cy] = pt(28, pa);
    const verts = [];
    for (let j = 0; j < 5; j++) {
      const va = pa + 180 + 72 * j;
      const vx = cx + 9 * Math.cos((va * Math.PI) / 180);
      const vy = cy + 9 * Math.sin((va * Math.PI) / 180);
      verts.push(`${vx.toFixed(2)},${vy.toFixed(2)}`);
    }
    panels.push(verts.join(' '));
    // Seams from the junction to the two nearest panel corners.
    const [jx, jy] = pt(20, a);
    const [p1x, p1y] = pt(23.5, a + 22);
    const [p2x, p2y] = pt(23.5, a - 22);
    seams.push(`M${jx.toFixed(2)} ${jy.toFixed(2)}L${p1x.toFixed(2)} ${p1y.toFixed(2)}`);
    seams.push(`M${jx.toFixed(2)} ${jy.toFixed(2)}L${p2x.toFixed(2)} ${p2y.toFixed(2)}`);
  }
  return (
    <span className="soccer-ball" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-leather`} cx="38%" cy="32%" r="72%">
            <stop offset="0" stopColor="#FFFFFF"/>
            <stop offset="0.62" stopColor="#F1EEE4"/>
            <stop offset="1" stopColor="#C9C4B4"/>
          </radialGradient>
          <clipPath id={`${id}-clip`}><circle cx="32" cy="32" r="27.6"/></clipPath>
        </defs>
        <circle cx="32" cy="32" r="31" fill={`url(#${id}-leather)`}/>
        <g clipPath={`url(#${id}-clip)`}>
          <g fill="#1E2421">
            {panels.map((p, i) => <polygon key={i} points={p} strokeLinejoin="round"/>)}
          </g>
          <path d={seams.join('')} stroke="#121614" strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        </g>
        <circle cx="32" cy="32" r="30.4" fill="none" stroke="#0E1311" strokeOpacity="0.38" strokeWidth="1.2"/>
      </svg>
      <span className="soccer-ball-crest">
        <AlphaShield size={Math.round(size * 0.56)}/>
      </span>
    </span>
  );
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where the ball rests on a link, in nav-content coordinates. */
function restingSpot(item, collapsed) {
  const size = collapsed ? BALL_COLLAPSED : BALL_EXPANDED;
  // Rail: tucked into the link's bottom-right corner, clear of the icon.
  const x = collapsed
    ? item.offsetLeft + item.offsetWidth - 4
    : item.offsetLeft + item.offsetWidth - 12 - size / 2;
  const y = collapsed
    ? item.offsetTop + item.offsetHeight - 6
    : item.offsetTop + item.offsetHeight / 2;
  return { x, y, size };
}

const ballTransform = (x, y, sx, sy, rot) =>
  `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;

/**
 * Keyframes for a physical hop: n travelling hops of decaying height
 * (duration ∝ √height, constant ground speed) followed by two small settle
 * bounces on the spot, with a squash at each contact and a steady spin.
 * "Height" reads as the ball rising toward the viewer: it grows, drifts
 * sideways on an arc and its shadow drops away.
 */
function hopKeyframes(from, to, rot0, rot1, size) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const hops = dist > 320 ? 3 : dist > 140 ? 2 : 1;
  const decay = 0.5;
  const heights = [];
  for (let k = 0; k < hops + 2; k++) heights.push(Math.pow(decay, k));
  const durs = heights.map(h => Math.sqrt(h));
  const travelW = durs.slice(0, hops).reduce((a, b) => a + b, 0);
  const totalW = durs.reduce((a, b) => a + b, 0);
  const total = 560 + 80 * hops; // 640–800 ms
  const arc = Math.min(12, 6 + dist / 60); // sideways drift at the apex, px
  const sizeScale = size / BALL_EXPANDED;

  const frames = [];
  const push = (t, x, y, lift, squash, rot) => {
    const s = 1 + 0.42 * lift;
    const sx = s * (1 + 0.16 * squash);
    const sy = s * (1 - 0.16 * squash);
    const sh = (1 + 7 * lift) * sizeScale;
    frames.push({
      offset: Math.min(1, Math.max(0, t / totalW)),
      transform: ballTransform(x - arc * lift, y - 3 * lift, sx, sy, rot),
      filter: `drop-shadow(${(sh * 0.7).toFixed(2)}px ${(1.5 + sh).toFixed(2)}px ${(1.5 + sh * 0.9).toFixed(2)}px rgba(0,0,0,${(0.42 - 0.18 * lift).toFixed(3)}))`,
    });
  };

  let t = 0;
  for (let k = 0; k < heights.length; k++) {
    const travelling = k < hops;
    const steps = travelling ? 10 : 6;
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      const tt = t + durs[k] * u;
      const g = travelling ? Math.min(1, tt / travelW) : 1;
      const x = from.x + (to.x - from.x) * g;
      const y = from.y + (to.y - from.y) * g;
      const lift = heights[k] * 4 * u * (1 - u);
      const squash = i === 0 && k > 0 ? heights[k - 1] * 0.9 : 0;
      const spinP = Math.min(1, tt / (travelW + durs[hops] * 0.6));
      const rot = rot0 + (rot1 - rot0) * (1 - Math.pow(1 - spinP, 2));
      push(tt, x, y, lift, squash, rot);
    }
    t += durs[k];
  }
  push(totalW, to.x, to.y, 0, 0, rot1);
  // offsets must be strictly increasing for some engines
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].offset <= frames[i - 1].offset) frames[i].offset = Math.min(1, frames[i - 1].offset + 1e-4);
  }
  frames[frames.length - 1].offset = 1;
  return { frames, duration: total, landAt: (travelW / totalW) * total };
}

export function NavBall({ navRef, active, collapsed }) {
  const ballRef = React.useRef(null);
  const rippleRef = React.useRef(null);
  const state = React.useRef({ active: null, spot: null, rot: 0, anim: null, collapsed });

  const findItem = React.useCallback(
    (id) => navRef.current?.querySelector(`[data-nav-id="${CSS.escape(String(id))}"]`) || null,
    [navRef]
  );

  const setRest = React.useCallback((spot, rot) => {
    const ball = ballRef.current;
    if (!ball) return;
    ball.style.setProperty('--ball', `${spot.size}px`);
    ball.style.transform = ballTransform(spot.x, spot.y, 1, 1, rot);
  }, []);

  const ripple = React.useCallback((item, spot, delay) => {
    const host = rippleRef.current;
    if (!host || !item) return;
    const w = item.offsetWidth;
    const h = item.offsetHeight;
    host.style.left = `${item.offsetLeft}px`;
    host.style.top = `${item.offsetTop}px`;
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;
    const wave = host.firstChild;
    const cx = spot.x - item.offsetLeft;
    const cy = spot.y - item.offsetTop;
    const r = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
    wave.style.left = `${cx - r}px`;
    wave.style.top = `${cy - r}px`;
    wave.style.width = wave.style.height = `${2 * r}px`;
    host.getAnimations().forEach(a => a.cancel());
    wave.getAnimations().forEach(a => a.cancel());
    const opts = { duration: 520, delay, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'none' };
    wave.animate(
      [{ transform: 'scale(0.04)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 0 }],
      opts
    );
    host.animate(
      [
        { opacity: 1, boxShadow: '0 0 0 0 color-mix(in srgb, var(--accent) 70%, transparent)' },
        { opacity: 1, boxShadow: '0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent)' },
      ],
      opts
    );
  }, []);

  const sync = React.useCallback((animate) => {
    const ball = ballRef.current;
    const s = state.current;
    if (!ball) return;
    const item = active != null ? findItem(active) : null;
    if (!item) {
      s.anim?.cancel();
      s.anim = null;
      s.active = null;
      s.spot = null;
      ball.style.opacity = '0';
      return;
    }
    const spot = restingSpot(item, collapsed);
    const changed = s.active !== active;
    const wasHidden = !s.spot;
    if (!changed) {
      // Same link: just follow layout (resize, collapse, language…).
      if (!s.anim && (!s.spot || s.spot.x !== spot.x || s.spot.y !== spot.y || s.spot.size !== spot.size)) setRest(spot, s.rot);
      if (s.anim && s.collapsed !== collapsed) { s.anim.cancel(); s.anim = null; setRest(spot, s.rot); }
      s.spot = spot;
      s.collapsed = collapsed;
      return;
    }

    // Start from wherever the ball is right now (it may be mid-flight).
    let from = s.spot;
    if (s.anim) {
      const m = new DOMMatrixReadOnly(getComputedStyle(ball).transform);
      from = { x: m.m41, y: m.m42, size: spot.size };
      s.anim.cancel();
      s.anim = null;
    }

    s.active = active;
    s.collapsed = collapsed;
    ball.style.opacity = '1';

    if (!animate || wasHidden || !from || prefersReducedMotion()) {
      s.spot = spot;
      setRest(spot, s.rot);
      return;
    }

    const dir = spot.y >= from.y ? 1 : -1;
    const dist = Math.hypot(spot.x - from.x, spot.y - from.y);
    const rot1 = s.rot + dir * (220 + Math.min(320, dist * 0.9));
    const { frames, duration, landAt } = hopKeyframes(from, spot, s.rot, rot1, spot.size);
    s.rot = rot1 % 360;
    s.spot = spot;
    ball.style.setProperty('--ball', `${spot.size}px`);
    ball.style.transform = ballTransform(spot.x, spot.y, 1, 1, s.rot);
    // keep the end rotation equivalent to the resting one (mod 360)
    const anim = ball.animate(frames, { duration, easing: 'linear' });
    s.anim = anim;
    anim.onfinish = anim.oncancel = () => { if (s.anim === anim) s.anim = null; };
    ripple(item, spot, landAt);
  }, [active, collapsed, findItem, setRest, ripple]);

  // Every commit: animate if the active link changed, otherwise follow layout.
  React.useLayoutEffect(() => { sync(state.current.active != null); });

  // Layout changes that don't re-render us: window resize, the sidebar's
  // width transition, fonts settling.
  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => sync(false));
    });
    ro.observe(nav);
    nav.querySelectorAll('.nav-item').forEach(el => ro.observe(el));
    document.fonts?.ready?.then(() => sync(false)).catch(() => {});
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [navRef, sync, collapsed]);

  React.useEffect(() => () => state.current.anim?.cancel(), []);

  return (
    <>
      <span className="nav-ripple" ref={rippleRef} aria-hidden="true"><i/></span>
      <span className={'nav-ball' + (collapsed ? ' compact' : '')} ref={ballRef} aria-hidden="true">
        <SoccerBall size={collapsed ? BALL_COLLAPSED : BALL_EXPANDED}/>
      </span>
    </>
  );
}
