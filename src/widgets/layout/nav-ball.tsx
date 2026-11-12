// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import { AlphaShield } from '@/shared/ui/logo';

/*
 * The active side-nav link is marked by a small soccer ball with the club
 * crest on it. There is one ball, absolutely positioned inside the scrolling
 * <nav>. When the active link changes, the ball moves in two steps: it jumps
 * a little above the old link, then drops in one arc onto the new one.
 *
 *  - Look: a truncated icosahedron projected onto a sphere every frame, so the
 *    panels foreshorten toward the rim and roll across the face. Fixed
 *    lighting sits on top: a highlight at the top left, a core shadow, and
 *    rim occlusion at the lower right. Below the ball is a contact shadow.
 *  - Motion: each trip is solved once and then sampled every frame (rAF).
 *    Under constant gravity it is a short lift-off and then one accelerating
 *    descent onto the link, with no hops on the way. A single tiny rebound
 *    settles it in place. Spin is steady in the air, and the ball squashes
 *    and stretches.
 *  - Landing: burst lines, a ground shockwave and some dust. They are drawn
 *    in a fixed overlay so the nav's overflow can't clip them. Contact
 *    shadows fade off the takeoff link and sharpen on the landing link.
 *
 * Purely decorative: aria-hidden, pointer-events: none, no layout impact.
 * Per-frame writes are limited to transform, opacity and the ball's own
 * SVG path data.
 */

const BALL_EXPANDED = 22;
const BALL_COLLAPSED = 15;

/* ------------------------------------------------------------------ */
/* Geometry: truncated icosahedron on the unit sphere                  */
/* ------------------------------------------------------------------ */

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const SUB = 3; // each seam is drawn as SUB great-circle sub-segments

const GEO = (() => {
  const P = (1 + Math.sqrt(5)) / 2;
  const V = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    V.push([0, s1, s2 * P], [s1, s2 * P, 0], [s2 * P, 0, s1]);
  }
  const n = V.length;
  const adj = V.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]);
    if (Math.abs(d - 2) < 1e-6) { adj[i].push(j); adj[j].push(i); }
  }
  const cut = (i, j) => lerp3(V[i], V[j], 1 / 3);

  // Front pentagon: around V[0]; pointing up on screen.
  const front = 0;
  const ez = norm(V[front]);
  const firstCorner = norm(cut(front, adj[front][0]));
  const up = norm(lerp3(firstCorner, ez, 0).map((c, k) => c - dot(firstCorner, ez) * ez[k]));
  const ey = up.map(c => -c);
  const ex = cross(ey, ez);
  const toView = (p) => { const q = norm(p); return [dot(q, ex), dot(q, ey), dot(q, ez)]; };

  // An edge, curved onto the sphere.
  const arc = (a, b) => {
    const pts = [];
    for (let k = 0; k <= SUB; k++) pts.push(toView(lerp3(a, b, k / SUB)));
    return pts;
  };

  const pentagons = [];
  for (let i = 0; i < n; i++) {
    const c = norm(V[i]);
    const t1 = norm(cross(c, Math.abs(c[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const t2 = cross(c, t1);
    const corners = adj[i].map(j => cut(i, j))
      .sort((a, b) => Math.atan2(dot(a, t2), dot(a, t1)) - Math.atan2(dot(b, t2), dot(b, t1)));
    const ring = [];
    corners.forEach((a, k) => { ring.push(...arc(a, corners[(k + 1) % corners.length]).slice(0, SUB)); });
    pentagons.push({ ring, front: i === front });
  }
  // Hexagon–hexagon seams: the middle third of every icosahedron edge.
  const seams = [];
  for (let i = 0; i < n; i++) for (const j of adj[i]) if (i < j) seams.push(arc(cut(i, j), cut(j, i)));
  return { pentagons, seams };
})();

/* Rotation helpers (quaternions: [w, x, y, z]) */
export const QI = [1, 0, 0, 0];
export const qAxis = (a, ang) => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), a[0] * s, a[1] * s, a[2] * s]; };
export const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map(c => -c); }
  if (d > 0.9995) {
    const r = a.map((c, k) => c + (bb[k] - c) * t);
    const l = Math.hypot(...r);
    return r.map(c => c / l);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((c, k) => c * wa + bb[k] * wb);
}
const qMat = ([w, x, y, z]) => [
  1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
  2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
  2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
];
const mApply = (m, p) => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
  m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
  m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
];

const R_SVG = 48; // sphere radius in the ball's 100×100 viewBox
const CREST = 58; // crest decal width, viewBox units

/** Project the panels for orientation q; returns SVG data for drawBall. */
function projectBall(q) {
  const m = qMat(q);
  const f = (v) => v.toFixed(1);
  // Points behind the horizon are pushed onto the rim, which clips a panel
  // where it turns away from the viewer.
  const proj = (p) => {
    const r = mApply(m, p);
    if (r[2] >= 0) return [r[0] * R_SVG, r[1] * R_SVG, r[2]];
    const l = Math.hypot(r[0], r[1]) || 1;
    return [(r[0] / l) * R_SVG, (r[1] / l) * R_SVG, r[2]];
  };
  let pent = '';
  for (const pg of GEO.pentagons) {
    if (pg.front) continue; // the crest covers it
    const pts = pg.ring.map(proj);
    if (pts.every(p => p[2] < 0)) continue;
    pent += 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  }
  let seam = '';
  for (const s of GEO.seams) {
    const pts = s.map(proj);
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (a[2] < 0 && b[2] < 0) continue;
      seam += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
    }
  }
  // Crest decal on the front panel, laid flat on the sphere's tangent plane.
  const n = [m[2], m[5], m[8]];
  const e1 = [m[0], m[3]];
  const e2 = [m[1], m[4]];
  const s = CREST / 64;
  const cx = n[0] * R_SVG * 0.97;
  const cy = n[1] * R_SVG * 0.97;
  const crestT = `matrix(${(e1[0] * s).toFixed(4)} ${(e1[1] * s).toFixed(4)} ${(e2[0] * s).toFixed(4)} ${(e2[1] * s).toFixed(4)} ${(cx - (e1[0] + e2[0]) * 32 * s).toFixed(2)} ${(cy - (e1[1] + e2[1]) * 32 * s).toFixed(2)})`;
  const crestO = Math.max(0, Math.min(1, (n[2] - 0.02) / 0.3));
  return { pent, seam, crestT, crestO };
}

/* ------------------------------------------------------------------ */
/* The ball face                                                        */
/* ------------------------------------------------------------------ */

/** A shaded 3D soccer ball with the crest; `drawRef` gets a draw(q) handle. */
export function SoccerBall({ size = 22, drawRef = null }) {
  const id = React.useId().replace(/:/g, '');
  const pentRef = React.useRef(null);
  const seamRef = React.useRef(null);
  const crestRef = React.useRef(null);
  const initial = React.useMemo(() => projectBall(QI), []);

  const draw = React.useCallback((q) => {
    const d = projectBall(q);
    pentRef.current?.setAttribute('d', d.pent);
    seamRef.current?.setAttribute('d', d.seam);
    if (crestRef.current) {
      crestRef.current.setAttribute('transform', d.crestT);
      crestRef.current.setAttribute('opacity', d.crestO.toFixed(3));
    }
  }, []);
  React.useImperativeHandle(drawRef, () => draw, [draw]);

  const u = (k) => `url(#${id}-${k})`;
  return (
    <span className="soccer-ball" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true">
        <defs>
          <clipPath id={`${id}-clip`}><circle r={R_SVG}/></clipPath>
          {/* Diffuse light from the top left. */}
          <radialGradient id={`${id}-leather`} cx="-18" cy="-22" r="82" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF"/>
            <stop offset="1" stopColor="#E9E6DD"/>
          </radialGradient>
          {/* Core shadow + rim occlusion on the lower right. */}
          <radialGradient id={`${id}-shade`} cx="-16" cy="-19" r="74" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0B1020" stopOpacity="0"/>
            <stop offset="0.45" stopColor="#0B1020" stopOpacity="0"/>
            <stop offset="0.72" stopColor="#0B1020" stopOpacity="0.22"/>
            <stop offset="0.9" stopColor="#0B1020" stopOpacity="0.5"/>
            <stop offset="1" stopColor="#05070D" stopOpacity="0.7"/>
          </radialGradient>
          {/* Light bounced back up from the floor onto the bottom rim. */}
          <radialGradient id={`${id}-bounce`} cx="6" cy="58" r="36" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28"/>
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0"/>
          </radialGradient>
          {/* Specular highlight: fixed to the light, never spins with the ball. */}
          <radialGradient id={`${id}-spec`} cx="-19" cy="-24" r="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95"/>
            <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.5"/>
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <g clipPath={u('clip')}>
          <circle r={R_SVG} fill={u('leather')}/>
          <path ref={pentRef} d={initial.pent} fill="#1B2120" stroke="#1B2120" strokeWidth="1.5" strokeLinejoin="round"/>
          <path ref={seamRef} d={initial.seam} fill="none" stroke="#2A302E" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round"/>
          <g ref={crestRef} transform={initial.crestT} opacity={initial.crestO}>
            <AlphaShield size={64}/>
          </g>
          <circle r={R_SVG} fill={u('shade')}/>
          <circle r={R_SVG} fill={u('bounce')}/>
          <circle r={R_SVG} fill={u('spec')}/>
          <ellipse cx="-17" cy="-23" rx="6.5" ry="4.5" transform="rotate(-35 -17 -23)" fill="#FFFFFF" fillOpacity="0.85"/>
        </g>
        <circle r={R_SVG - 0.6} fill="none" stroke="#05070D" strokeOpacity="0.45" strokeWidth="1.2"/>
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Physics: a two-step trip                                             */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => t * t * (3 - 2 * t);

/**
 * Plan a trip from `start` ({x, y, vy, q, airborne}) to `to` ({x, y}), in
 * nav-content coordinates with screen y pointing down. Gravity g pulls
 * straight down the screen, so the whole flight is one ballistic arc in two
 * readable steps:
 *
 *  1. Lift-off: the ball jumps a little above the higher of the two links
 *     (H, 11–18 px, scaled for the rail ball), slowing to a stop at the apex.
 *  2. Descent: from the apex it drops onto the target link, speeding up the
 *     whole way. There are no hops on the way.
 *
 * Then it makes one small rebound in place (≤ 2.5 px) and comes to rest.
 * g is solved so the flight takes the time the distance calls for
 * (0.42–0.72 s). Horizontal speed is constant.
 *
 * Interrupts start from the ball's current position and vertical speed. If
 * the new link is below, the ball keeps its motion and falls onto it. If the
 * link is above and the current arc wouldn't clear it, the ball gets a fresh
 * kick upward.
 */
function planTrip(start, to, r) {
  const k = r / 11;
  const dx = to.x - start.x;
  const dy = to.y - start.y;
  const D = Math.hypot(dx, dy);
  const dir = D > 0.01 ? [dx / D, dy / D] : [0, 1];
  const H = clamp(11 + D * 0.016, 11, 18) * k; // lift above the higher link
  const T = clamp(0.42 + D / 1100, 0.42, 0.72); // nominal flight time

  // Gravity from the nominal rest-to-rest flight: rise Hr, fall Hf, in T.
  const yaRest = Math.min(start.y, to.y) - H;
  const Hr = start.y - yaRest;
  const Hf = to.y - yaRest;
  const g = Math.pow((Math.sqrt(2 * Hr) + Math.sqrt(2 * Hf)) / T, 2);

  let vy0;
  if (!start.airborne) {
    vy0 = -Math.sqrt(2 * g * Hr);
  } else {
    vy0 = start.vy;
    if (to.y < start.y) {
      // The link is above: make sure the arc's apex clears it by H.
      const need = to.y - H;
      const natural = vy0 < 0 ? start.y - (vy0 * vy0) / (2 * g) : start.y;
      if (natural > need) vy0 = -Math.sqrt(2 * g * (start.y - need));
    }
  }
  // Apex (only if still rising) and the time of the fall onto the link.
  const t1 = vy0 < 0 ? -vy0 / g : 0;
  const ya = vy0 < 0 ? start.y - (vy0 * vy0) / (2 * g) : start.y;
  const vApex = vy0 < 0 ? 0 : vy0;
  const fall = Math.max(0, to.y - ya);
  const t2 = (-vApex + Math.sqrt(vApex * vApex + 2 * g * fall)) / g;
  const Tf = Math.max(0.05, t1 + t2);
  const vLand = vApex + g * t2;

  // One small rebound on the spot.
  const hReb = 2.5 * k;
  const vReb = Math.sqrt(2 * g * hReb);
  const tReb = (2 * vReb) / g;

  // Constant spin in the air (ω = v / r for the distance), rounded to whole
  // turns so the crest comes back to the front.
  const natural = D / r;
  const turns = natural > 2 ? Math.max(1, Math.round(natural / (2 * Math.PI))) : 0;

  return {
    x0: start.x, y0: start.y, to, vx: dx / Tf, vy0, g, t1, t2, Tf, ya, vLand, vReb, tReb,
    total: Tf + tReb, D, dir, r, k, H,
    q0: start.q || QI, spin: turns * 2 * Math.PI, axis: [-dir[1], dir[0], 0],
    takeoff: !start.airborne,
    impacts: [
      { t: Tf, v: vLand, main: true },
      { t: Tf + tReb, v: vReb, main: false },
    ],
  };
}

/** State of the trip at time t (s). */
function sampleTrip(P, t) {
  const tt = clamp(t, 0, P.total);
  let x, y, vx = 0, vy = 0, air = false;
  if (tt < P.Tf) {
    x = P.x0 + P.vx * tt;
    y = P.y0 + P.vy0 * tt + 0.5 * P.g * tt * tt;
    vx = P.vx;
    vy = P.vy0 + P.g * tt;
    air = true;
  } else {
    const lt = tt - P.Tf;
    const hs = lt < P.tReb ? Math.max(0, P.vReb * lt - 0.5 * P.g * lt * lt) : 0;
    x = P.to.x;
    y = P.to.y - hs;
    vy = lt < P.tReb ? -(P.vReb - P.g * lt) : 0;
  }

  // Orientation: steady spin through the flight, easing out any spin the trip
  // started with (after an interrupt).
  const fp = clamp(tt / P.Tf, 0, 1);
  const q = qMul(qAxis(P.axis, P.spin * fp), qSlerp(P.q0, QI, easeInOut(fp)));

  // Squash: a damped spring kicked by each impact, in proportion to the speed.
  let squash = 0;
  for (const im of P.impacts) {
    const a = tt - im.t;
    if (a < 0 || a > 0.3) continue;
    squash += 0.28 * Math.min(1, im.v / (600 * P.k)) * Math.exp(-a / 0.05) * Math.cos((2 * Math.PI * a) / 0.13);
  }
  // Stretch along the velocity while in flight.
  const speed = Math.hypot(vx, vy);
  const stretch = air ? clamp(speed / (2200 * P.k), 0, 0.16) : 0;
  return {
    x, y, vy, q, air, squash: clamp(squash, -0.12, 0.3), stretch, vAng: Math.atan2(vy, vx),
    done: t >= P.total,
  };
}

/**
 * Contact-shadow opacities for the takeoff link (a) and the landing link (b)
 * at time t. A fades as the ball rises off its link and is gone early in the
 * descent; B fades in during the descent and sharpens as the ball closes in.
 * `lift` is 0 on the floor and 1 when far above it.
 */
function shadowState(P, st, t, fadeFrom) {
  const reach = P.r * 2.2;
  let a;
  if (P.takeoff) {
    const up = clamp((P.y0 - Math.min(st.y, t < P.t1 ? st.y : P.ya)) / reach, 0, 1);
    const gone = t < P.t1 ? 0 : clamp((t - P.t1) / Math.max(0.05, 0.3 * P.t2), 0, 1);
    a = { op: (1 - up) * (1 - gone), lift: up };
  } else {
    a = { op: fadeFrom * (1 - clamp(t / 0.15, 0, 1)), lift: 1 - fadeFrom };
  }
  const liftB = clamp((P.to.y - st.y) / reach, 0, 1);
  const inB = P.t2 > 0 ? clamp((t - P.t1) / Math.max(0.05, 0.35 * P.t2), 0, 1) : 1;
  const b = { op: (1 - liftB) * (t >= P.Tf ? 1 : inB), lift: liftB };
  return { a, b };
}

/* ------------------------------------------------------------------ */
/* Impact effects (fixed overlay)                                       */
/* ------------------------------------------------------------------ */

const LINE_ANGLES = [-180, -152, -124, -102, -78, -56, -28, 0];

/** Spawn the burst lines, shockwave and dust for one impact. */
function spawnBurst(layer, cx, cy, r, strength, main, seed) {
  const el = document.createElement('div');
  el.className = 'nav-burst';
  el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
  const ring = document.createElement('i');
  ring.className = 'nav-burst-ring';
  const ringR = r * (2.2 + 1.4 * strength);
  ring.style.width = ring.style.height = `${(2 * ringR).toFixed(1)}px`;
  ring.style.margin = `${(-ringR).toFixed(1)}px 0 0 ${(-ringR).toFixed(1)}px`;
  el.appendChild(ring);
  const lines = LINE_ANGLES.map((ang, i) => {
    const l = document.createElement('b');
    l.className = 'nav-burst-line';
    const len = r * (0.75 + 0.7 * strength) * (i % 2 ? 0.8 : 1);
    l.style.width = `${len.toFixed(1)}px`;
    l.style.height = `${main ? 2.5 : 2}px`;
    l.style.marginTop = `${main ? -1.25 : -1}px`;
    el.appendChild(l);
    return { el: l, ang, len };
  });
  const dust = [];
  if (main) {
    let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('i');
      d.className = 'nav-burst-dust';
      const side = i % 2 ? 1 : -1;
      el.appendChild(d);
      dust.push({ el: d, vx: side * (40 + 70 * rnd()) * (r / 11), vy: -(50 + 70 * rnd()) * (r / 11), sz: 0.6 + 0.6 * rnd() });
    }
  }
  layer.appendChild(el);
  return { el, ring, lines, dust, r, strength, dur: 0.36 + 0.22 * strength, born: null };
}

/** Advance one burst to age a (s); returns false when it's finished. */
function stepBurst(b, a) {
  const p = a / b.dur;
  if (p >= 1) { b.el.remove(); return false; }
  const out = 1 - Math.pow(1 - p, 3);
  const fade = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
  // Shockwave: a flat ellipse on the floor, spreading out.
  const rs = 0.32 + 0.68 * out;
  b.ring.style.transform = `scale(${rs.toFixed(3)}, ${(rs * 0.34).toFixed(3)})`;
  b.ring.style.opacity = (0.95 * fade * (0.55 + 0.45 * b.strength)).toFixed(3);
  // Speed lines: shoot out from the contact point and shrink as they go.
  for (const ln of b.lines) {
    const d = b.r * (0.95 + (1.2 + 1.1 * b.strength) * out);
    const sc = Math.max(0.05, 1 - 0.85 * p);
    ln.el.style.transform = `rotate(${ln.ang}deg) translateX(${d.toFixed(2)}px) scaleX(${sc.toFixed(3)})`;
    ln.el.style.opacity = (p < 0.08 ? p / 0.08 : fade).toFixed(3);
  }
  // Dust: tiny ballistic specks.
  for (const d of b.dust) {
    const x = d.vx * a;
    const y = d.vy * a + 0.5 * 520 * (b.r / 11) * a * a;
    d.el.style.transform = `translate(${x.toFixed(2)}px, ${Math.min(0, y).toFixed(2)}px) scale(${(d.sz * (1 - 0.5 * p)).toFixed(3)})`;
    d.el.style.opacity = (0.9 * fade).toFixed(3);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* NavBall                                                              */
/* ------------------------------------------------------------------ */

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

const now = () => performance.now() / 1000;

export function NavBall({ navRef, active, collapsed }) {
  const ballRef = React.useRef(null);
  const squashRef = React.useRef(null);
  const stretchRef = React.useRef(null);
  const shadowRefs = [React.useRef(null), React.useRef(null)];
  const fxRef = React.useRef(null);
  const drawRef = React.useRef(null);
  const [fxHost, setFxHost] = React.useState(null);
  const state = React.useRef({
    active: null, spot: null, collapsed, trip: null, t0: 0, raf: 0, bursts: [], q: QI, last: null,
    // Two contact shadows: `land` sits on the landing link, the other on the
    // link the ball took off from. They swap roles on every trip.
    land: 0, from: null, fadeFrom: 1, shOp: [0, 0],
  });

  React.useEffect(() => { setFxHost(document.body); }, []);

  const findItem = React.useCallback(
    (id) => navRef.current?.querySelector(`[data-nav-id="${CSS.escape(String(id))}"]`) || null,
    [navRef]
  );

  /** Draw one contact shadow on the floor at pt: shrinks and fades with lift. */
  const paintShadow = React.useCallback((i, pt, size, op, lift, squash) => {
    const sh = shadowRefs[i].current;
    if (!sh) return;
    state.current.shOp[i] = op;
    if (!pt || op < 0.003) { sh.style.opacity = '0'; return; }
    const r = size / 2;
    sh.style.setProperty('--ball', `${size}px`);
    sh.style.transform = `translate3d(${pt.x.toFixed(2)}px, ${(pt.y + r * 0.92).toFixed(2)}px, 0) scale(${(1 - 0.45 * lift + 0.25 * Math.max(0, squash)).toFixed(3)})`;
    sh.style.opacity = op.toFixed(3);
    sh.style.setProperty('--core', (1 - Math.min(1, lift * 2.2)).toFixed(3));
  }, []);

  /** Write one frame: ball position, squash/stretch, spin. */
  const paint = React.useCallback((x, y, size, squash, stretch, vAng, q) => {
    const s = state.current;
    const ball = ballRef.current;
    if (!ball) return;
    ball.style.setProperty('--ball', `${size}px`);
    ball.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    // Squash about the contact point, volume-preserving.
    const sy = 1 - squash;
    const sx = 1 / Math.sqrt(Math.max(0.5, sy));
    squashRef.current.style.transform = squash ? `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})` : '';
    // Stretch along the direction of travel.
    if (stretch > 0.002) {
      const a = (vAng * 180) / Math.PI;
      const sa = 1 + stretch;
      stretchRef.current.style.transform = `rotate(${a.toFixed(1)}deg) scale(${sa.toFixed(3)}, ${(1 / Math.sqrt(sa)).toFixed(3)}) rotate(${(-a).toFixed(1)}deg)`;
    } else {
      stretchRef.current.style.transform = '';
    }
    if (q !== s.q) { drawRef.current?.(q); s.q = q; }
    s.last = { x, y, size };
  }, []);

  /** At rest on the spot: one sharp shadow under the ball. */
  const paintRest = React.useCallback((spot) => {
    const s = state.current;
    paint(spot.x, spot.y, spot.size, 0, 0, 0, QI);
    paintShadow(s.land, spot, spot.size, 1, 0, 0);
    paintShadow(1 - s.land, null, spot.size, 0, 1, 0);
  }, [paint, paintShadow]);

  const contactToViewport = React.useCallback((x, y) => {
    const nav = navRef.current;
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return [rect.left + nav.clientLeft + x - nav.scrollLeft, rect.top + nav.clientTop + y - nav.scrollTop];
  }, [navRef]);

  const loop = React.useCallback(() => {
    const s = state.current;
    cancelAnimationFrame(s.raf);
    const frame = () => {
      const t = now();
      // Read layout once, before any writes: bursts ride along with the nav
      // (e.g. the phone drawer sliding shut).
      const navRect = s.bursts.length ? navRef.current?.getBoundingClientRect() : null;
      const P = s.trip;
      if (P) {
        const lt = t - s.t0;
        const st = sampleTrip(P, lt);
        paint(st.x, st.y, s.spot.size, st.squash, st.stretch, st.vAng, st.q);
        const sh = shadowState(P, st, lt, s.fadeFrom);
        paintShadow(1 - s.land, s.from, s.spot.size, sh.a.op, sh.a.lift, 0);
        paintShadow(s.land, P.to, s.spot.size, sh.b.op, sh.b.lift, st.squash);
        s.cur = st;
        // Impacts that happened since the last frame.
        for (const im of P.impacts) {
          if (im.fired || lt < im.t) continue;
          im.fired = true;
          // Only the landing gets the burst; the tiny rebound just squashes.
          if (!im.main || !fxRef.current) continue;
          const pt = contactToViewport(P.to.x, P.to.y + P.r);
          if (!pt) continue;
          const b = spawnBurst(fxRef.current, pt[0], pt[1], P.r, 1, true, Math.round(P.D) + 1);
          b.born = s.t0 + im.t;
          b.at = pt;
          const nr = navRef.current.getBoundingClientRect();
          b.nav = [nr.left, nr.top];
          s.bursts.push(b);
        }
        if (st.done) { s.trip = null; s.cur = null; paintRest(s.spot); }
      }
      s.bursts = s.bursts.filter(b => {
        if (navRect && b.nav) {
          const x = b.at[0] + navRect.left - b.nav[0];
          const y = b.at[1] + navRect.top - b.nav[1];
          b.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        }
        return stepBurst(b, t - b.born);
      });
      s.raf = (s.trip || s.bursts.length) ? requestAnimationFrame(frame) : 0;
    };
    s.raf = requestAnimationFrame(frame);
  }, [paint, paintShadow, paintRest, contactToViewport, navRef]);

  const stopTrip = React.useCallback(() => {
    const s = state.current;
    s.trip = null;
    s.cur = null;
  }, []);

  const sync = React.useCallback((animate) => {
    const ball = ballRef.current;
    const s = state.current;
    if (!ball) return;
    const item = active != null ? findItem(active) : null;
    if (!item) {
      stopTrip();
      s.active = null;
      s.spot = null;
      ball.style.opacity = '0';
      shadowRefs.forEach(r => { if (r.current) r.current.style.opacity = '0'; });
      return;
    }
    const spot = restingSpot(item, collapsed);
    const changed = s.active !== active;
    const wasHidden = !s.spot;
    if (!changed) {
      // Same link: just follow layout (resize, collapse, language…).
      const moved = !s.spot || Math.abs(s.spot.x - spot.x) > 0.5 || Math.abs(s.spot.y - spot.y) > 0.5 || s.spot.size !== spot.size;
      if (moved || s.collapsed !== collapsed) {
        if (s.trip) stopTrip();
        s.spot = spot;
        paintRest(spot);
      }
      s.collapsed = collapsed;
      return;
    }

    s.active = active;
    s.collapsed = collapsed;
    ball.style.opacity = '1';

    if (!animate || wasHidden || !s.spot || prefersReducedMotion()) {
      stopTrip();
      s.spot = spot;
      paintRest(spot);
      return;
    }

    // Start from wherever the ball is right now, keeping its vertical speed
    // and spin (it may be mid-flight).
    const inTrip = !!(s.cur && s.trip);
    const cur = inTrip
      ? { x: s.cur.x, y: s.cur.y, vy: s.cur.vy, q: s.cur.q, airborne: true }
      : { x: s.spot.x, y: s.spot.y, vy: 0, q: QI, airborne: false };
    // Shadows: the one showing most becomes the takeoff shadow and stays put;
    // the other moves to the new link.
    if (inTrip) {
      const keep = s.shOp[0] >= s.shOp[1] ? 0 : 1;
      s.from = keep === s.land ? s.trip.to : s.from;
      s.fadeFrom = s.shOp[keep];
      s.land = 1 - keep;
    } else {
      s.from = { x: s.spot.x, y: s.spot.y };
      s.fadeFrom = 1;
      s.land = 1 - s.land;
    }
    s.spot = spot;
    s.trip = planTrip(cur, spot, spot.size / 2);
    s.t0 = now();
    loop();
  }, [active, collapsed, findItem, paintRest, loop, stopTrip]);

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

  React.useEffect(() => () => {
    const s = state.current;
    cancelAnimationFrame(s.raf);
    s.bursts.forEach(b => b.el.remove());
    s.bursts = [];
  }, []);

  return (
    <>
      <span className="nav-ball-shadow" ref={shadowRefs[0]} aria-hidden="true"/>
      <span className="nav-ball-shadow" ref={shadowRefs[1]} aria-hidden="true"/>
      <span className={'nav-ball' + (collapsed ? ' compact' : '')} ref={ballRef} aria-hidden="true">
        <span className="nav-ball-squash" ref={squashRef}>
          <span className="nav-ball-stretch" ref={stretchRef}>
            <SoccerBall size={collapsed ? BALL_COLLAPSED : BALL_EXPANDED} drawRef={drawRef}/>
          </span>
        </span>
      </span>
      {fxHost && createPortal(<div className="nav-ball-fx" ref={fxRef} aria-hidden="true"/>, fxHost)}
    </>
  );
}
