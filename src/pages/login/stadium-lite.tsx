// @ts-nocheck
import React from 'react';
import { SoccerBall, QI, qAxis, qMul } from '@/widgets/layout/nav-ball';

/*
 * The lightweight stadium: CSS/SVG only, no WebGL.
 *
 *  - variant "compact": the phone version — floodlight beams, the goal at the
 *    top and the crest ball, form below.
 *  - variant "wide": the desktop fallback when WebGL is missing or the device
 *    is too weak. No idle motion; only the short event animations.
 *  - still: prefers-reduced-motion — the same picture with no motion at all.
 *
 * The goal is a small simulation, cheap enough for phones:
 *  - the back net is a 10×6 spring cloth (pinned on the frame) drawn as SVG
 *    polylines, so it bellies when the ball arrives and wobbles back;
 *  - the ball flies a gravity arc with depth (its scale shrinks toward the
 *    goal), meets the net, is caught and drops to the floor inside it;
 *  - the stage "camera" zooms out a little for the shot.
 * Same imperative API as the 3D scene (juggle, setSecret, setLoading, goal,
 * miss, setPointer, setTarget), so the login screen doesn't care which stage
 * is mounted.
 */

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

/* Goal drawing, in the SVG's 120×60 units. */
const VB_W = 120, VB_H = 60;
const FRONT = { l: 6, r: 114, top: 4, floor: 58 };
const BACK = { l: 18, r: 102, top: 12, floor: 55 };
const COLS = 10, ROWS = 6;
const VP = [60, 110]; // the viewer's vanishing point: deeper net points slide toward it

function makeCloth() {
  const pts = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const x = BACK.l + (BACK.r - BACK.l) * (i / (COLS - 1));
    const y = BACK.top + (BACK.floor - BACK.top) * (j / (ROWS - 1));
    pts.push({ x, y, z: 0, rx: x, ry: y, vx: 0, vy: 0, vz: 0, pin: i === 0 || j === 0 || i === COLS - 1 || j === ROWS - 1 });
  }
  const springs = [];
  const at = (i, j) => j * COLS + i;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (i < COLS - 1) springs.push([at(i, j), at(i + 1, j)]);
    if (j < ROWS - 1) springs.push([at(i, j), at(i, j + 1)]);
  }
  springs.forEach(s => {
    const a = pts[s[0]], b = pts[s[1]];
    s.push(Math.hypot(a.x - b.x, a.y - b.y));
  });
  return { pts, springs };
}

/** Screen position of a cloth point: depth pulls it toward VP and down (sag). */
function proj(p) {
  const k = Math.min(0.3, p.z * 0.016);
  return [p.x + (VP[0] - p.x) * k * 0.5, p.y + (VP[1] - p.y) * k * 0.5 + p.z * 0.12];
}

function clothStep(c, dt) {
  const K = 900, D = 7, G = 40;
  let e = 0;
  for (const p of c.pts) { p.fx = 0; p.fy = p.pin ? 0 : G * 0.15; p.fz = 0; }
  for (const [a, b, rest] of c.springs) {
    const A = c.pts[a], B = c.pts[b];
    const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
    const L = Math.hypot(dx, dy, dz) || 1e-6;
    const f = K * (L - rest) / L;
    A.fx += dx * f; A.fy += dy * f; A.fz += dz * f;
    B.fx -= dx * f; B.fy -= dy * f; B.fz -= dz * f;
  }
  for (const p of c.pts) {
    if (p.pin || p.held) continue;
    // a weak pull back to the rest shape (the net's own tension)
    p.fx += (p.rx - p.x) * 60; p.fy += (p.ry - p.y) * 60; p.fz += -p.z * 60;
    p.vx += (p.fx - D * p.vx) * dt; p.vy += (p.fy - D * p.vy) * dt; p.vz += (p.fz - D * p.vz) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    e += p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
  }
  return e;
}

function clothPaths(c) {
  const P = c.pts.map(proj);
  const f = (v) => v.toFixed(2);
  let d = '';
  for (let j = 0; j < ROWS; j++) {
    d += 'M' + Array.from({ length: COLS }, (_, i) => { const q = P[j * COLS + i]; return f(q[0]) + ' ' + f(q[1]); }).join('L');
  }
  for (let i = 0; i < COLS; i++) {
    d += 'M' + Array.from({ length: ROWS }, (_, j) => { const q = P[j * COLS + i]; return f(q[0]) + ' ' + f(q[1]); }).join('L');
  }
  return d;
}

const STATIC_SIDES = (() => {
  // side and roof nets: from the front frame to the back-net border
  let d = '';
  for (let k = 0; k <= 5; k++) {
    const u = k / 5;
    const fy = FRONT.top + (FRONT.floor - FRONT.top) * u, by = BACK.top + (BACK.floor - BACK.top) * u;
    d += `M${FRONT.l} ${fy.toFixed(1)}L${BACK.l} ${by.toFixed(1)}M${FRONT.r} ${fy.toFixed(1)}L${BACK.r} ${by.toFixed(1)}`;
  }
  for (let k = 0; k <= 9; k++) {
    const u = k / 9;
    const fx = FRONT.l + (FRONT.r - FRONT.l) * u, bx = BACK.l + (BACK.r - BACK.l) * u;
    d += `M${fx.toFixed(1)} ${FRONT.top}L${bx.toFixed(1)} ${BACK.top}`;
  }
  d += `M${FRONT.l} ${FRONT.top}L${BACK.l} ${BACK.top}L${BACK.r} ${BACK.top}L${FRONT.r} ${FRONT.top}`;
  return d;
})();

export const StadiumLite = React.forwardRef(function StadiumLite({ variant = 'wide', still = false, onFlash, onTunnel }, ref) {
  const ballRef = React.useRef(null);
  const spotRef = React.useRef(null);
  const netGoalRef = React.useRef(null);
  const netPathRef = React.useRef(null);
  const postRef = React.useRef(null);
  const drawRef = React.useRef(null);
  const clothRef = React.useRef(null);
  if (!clothRef.current) clothRef.current = makeCloth();
  const st = React.useRef({ q: QI, w: 0, wT: 0, raf: 0, last: 0, busy: false, simRaf: 0 });
  const [secret, setSecret] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [shot, setShot] = React.useState(false);
  const initialNet = React.useMemo(() => clothPaths(clothRef.current), []);

  // Spin loop: only runs while the ball is actually turning.
  const spin = React.useCallback(() => {
    const s = st.current;
    if (s.raf || still) return;
    s.last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      s.w += (s.wT - s.w) * (1 - Math.exp(-4 * dt));
      s.q = qMul(qAxis([0, 1, 0], s.w * dt), s.q);
      drawRef.current?.(s.q);
      if (Math.abs(s.w) < 0.05 && s.wT === 0) {
        s.raf = 0;
        s.w = 0;
        // settle the crest back to the front
        const from = s.q;
        const t0 = performance.now();
        const settle = (n) => {
          const k = Math.min(1, (n - t0) / 420);
          const e = k * k * (3 - 2 * k);
          const q = from.map((c, i) => c + (QI[i] - c) * e);
          const l = Math.hypot(...q);
          s.q = q.map(c => c / l);
          drawRef.current?.(s.q);
          if (k < 1 && !s.raf) requestAnimationFrame(settle);
        };
        requestAnimationFrame(settle);
        return;
      }
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  }, [still]);

  React.useEffect(() => () => { cancelAnimationFrame(st.current.raf); cancelAnimationFrame(st.current.simRaf); }, []);

  /** Run the cloth (and an optional per-frame hook) until it has settled. */
  const runCloth = React.useCallback((hook, minMs = 0) => {
    const s = st.current;
    cancelAnimationFrame(s.simRaf);
    const c = clothRef.current;
    const t0 = performance.now();
    let last = t0, acc = 0;
    const H = 1 / 120;
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      let e = 0;
      while (acc >= H) { hook?.step?.(H); e = clothStep(c, H); acc -= H; }
      hook?.frame?.((now - t0) / 1000);
      netPathRef.current?.setAttribute('d', clothPaths(c));
      if (now - t0 < minMs || e > 0.02 || hook?.active?.()) s.simRaf = requestAnimationFrame(frame);
      else s.simRaf = 0;
    };
    s.simRaf = requestAnimationFrame(frame);
  }, []);

  /** Local (unscaled) geometry of the shot: ball spot centre and the goal box. */
  const geometry = React.useCallback(() => {
    const spot = spotRef.current, goalEl = netGoalRef.current;
    if (!spot || !goalEl) return null;
    const sx = spot.offsetLeft, sy = spot.offsetTop; // both are centred with translate(-50%, -50%)
    const size = spot.offsetWidth;
    const gw = goalEl.offsetWidth, gh = gw * (VB_H / VB_W);
    const gx = goalEl.offsetLeft - gw / 2, gy = goalEl.offsetTop - gh / 2;
    const u = gw / VB_W;
    // a point of the goal SVG → px relative to the ball's rest centre
    const toBall = (x, y) => [gx + x * u - sx, gy + y * u - sy];
    const toSvg = (x, y) => [(x + sx - gx) / u, (y + sy - gy) / u];
    return { size, u, toBall, toSvg };
  }, []);

  React.useImperativeHandle(ref, () => ({
    setPointer() {},
    setTarget() {},
    juggle() {
      const s = st.current;
      if (still || s.busy || !ballRef.current) return;
      ballRef.current.animate([
        { transform: 'translateY(0)' },
        { transform: 'translateY(-26%)', offset: 0.45, easing: 'cubic-bezier(0.5, 0, 1, 1)' },
        { transform: 'translateY(0) scale(1.06, 0.93)', offset: 0.88 },
        { transform: 'translateY(0)' },
      ], { duration: 380, easing: 'cubic-bezier(0, 0, 0.4, 1)' });
      s.q = qMul(qAxis([1, 0, 0], -0.9), s.q);
      drawRef.current?.(s.q);
      if (!s.raf) { s.wT = 0; s.w = 0.06; spin(); }
    },
    setSecret(on) { setSecret(!!on); },
    setLoading(on) {
      setLoading(!!on);
      const s = st.current;
      s.wT = on ? 9 : 0;
      if (on) spin();
    },
    async goal() {
      const s = st.current;
      s.wT = 0;
      setLoading(false);
      const geo = geometry();
      if (still || !geo || !ballRef.current) return;
      s.busy = true;
      setShot(true);
      s.w = 14; s.wT = 14; spin();

      // --- the shot: gravity arc + depth toward the back net
      const T = 0.5;
      const target = geo.toBall(64, 33);           // where it meets the back net (px from rest)
      const floorY = geo.toBall(0, BACK.floor - 4)[1];
      const sNet = Math.max(0.1, (11 * geo.u) / geo.size); // ball ≈ 11 svg units across in the net
      const g = Math.max(900, geo.size * 22);
      const b = {
        x: 0, y: 0, d: 0,
        vx: target[0] / T, vy: (target[1] - 0.5 * g * T * T) / T, vd: 1 / T,
        caught: false, impactAt: 0, settled: false,
      };
      const c = clothRef.current;
      const ballEl = ballRef.current;
      let flashed = false, tunneled = false, done = false;
      const scaleAt = (d) => (d <= 1 ? 1 + (sNet / 0.92 - 1) * Math.pow(d, 0.8) : (sNet / 0.92) * (1 - 0.08 * (d - 1) * 10));
      runCloth({
        step(h) {
          b.vy += g * h;
          if (!b.caught) {
            b.x += b.vx * h; b.y += b.vy * h; b.d += b.vd * h;
            if (b.d >= 1) {
              // meets the back net: the net catches it and takes most of the momentum
              b.caught = true; b.impactAt = performance.now();
              b.vx *= 0.25; b.vy *= 0.2; b.vd = 0.9;
            }
          } else {
            b.x += b.vx * h; b.y += b.vy * h;
            b.vx *= Math.exp(-6 * h);
            // the net pushes the ball back (spring), the ball pushes the net out
            const pen = b.d - 1;
            b.vd += (-140 * pen - 9 * b.vd) * h;
            b.d += b.vd * h;
            if (b.y > floorY) { b.y = floorY; b.vy = b.vy > 60 ? -b.vy * 0.35 : 0; }
            const [px, py] = geo.toSvg(b.x, b.y);
            const R = 18;
            for (const p of c.pts) {
              if (p.pin) continue;
              const dist = Math.hypot(p.rx - px, p.ry - py);
              const fall = Math.max(0, 1 - dist / R);
              const want = Math.max(0, pen) * 260 * fall * fall;
              if (want > p.z) { p.vz = Math.max(p.vz, (want - p.z) / h * 0.5); p.z = want; }
            }
          }
        },
        frame() {
          const sc = scaleAt(Math.min(1.1, b.d));
          ballEl.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
          if (b.caught && !flashed && performance.now() - b.impactAt > 420) { flashed = true; onFlash?.(); }
          if (flashed && !tunneled) { tunneled = true; setTimeout(() => onTunnel?.(), 60); }
        },
        active: () => !done,
      }, 400);
      // resolve: flash ~0.42 s after the net catch, tunnel, then hand over
      const tStart = performance.now();
      await new Promise((r) => {
        const check = () => {
          const now = performance.now();
          if ((b.caught && now - b.impactAt > 1000) || now - tStart > 2000) r();
          else setTimeout(check, 30);
        };
        check();
      });
      done = true;
    },
    async miss() {
      const s = st.current;
      setLoading(false);
      if (still) { s.wT = 0; return; }
      s.busy = true;
      s.w = 12; s.wT = 12; spin();
      const ball = ballRef.current;
      const a = ball && center(ball);
      const p = postRef.current && center(postRef.current);
      let anim = null;
      if (a && p) {
        const dx = p.x - a.x, dy = p.y - a.y;
        const end = Math.max(0.3, (p.w * 4) / a.w);
        anim = ball.animate([
          { transform: 'translate(0, 0) scale(1)' },
          { offset: 0.5, transform: `translate(${dx * 0.42}px, ${dy * 0.62 - Math.min(90, Math.abs(dy) * 0.5 + 30)}px) scale(${(1 + end) / 2})` },
          { transform: `translate(${dx}px, ${dy}px) scale(${end})` },
        ], { duration: 460, easing: 'cubic-bezier(0.45, 0, 0.8, 0.6)', fill: 'forwards' });
      }
      await wait(460);
      postRef.current?.classList.remove('is-hit');
      void postRef.current?.getBoundingClientRect();
      postRef.current?.classList.add('is-hit');
      // the side of the net shakes a little
      const c = clothRef.current;
      c.pts.forEach((q, i) => { if (!q.pin && q.rx < 40) q.vz += 30 * (1 - (q.rx - BACK.l) / 22) + (i % 3) * 4; });
      runCloth(null, 300);
      s.wT = -6;
      if (ball && anim) {
        const from = getComputedStyle(ball).transform;
        anim.cancel();
        ball.animate([
          { transform: from === 'none' ? 'none' : from },
          { transform: 'translate(-18%, -30%) scale(0.85)', offset: 0.45 },
          { transform: 'translate(0, 0) scale(1.04, 0.94)', offset: 0.85 },
          { transform: 'none' },
        ], { duration: 620, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' });
      }
      setTimeout(() => { s.wT = 0; s.busy = false; }, 640);
    },
  }), [still, spin, runCloth, geometry, onFlash, onTunnel]);

  const floods = variant === 'compact' ? [0, 1] : [0, 1, 2, 3];
  return (
    <div className={`sl sl-${variant}${still ? ' is-still' : ''}${secret ? ' is-secret' : ''}${loading ? ' is-loading' : ''}${shot ? ' is-shot' : ''}`} aria-hidden="true">
      <div className="sl-sky"/>
      <div className="sl-stand"/>
      <div className="sl-lights">
        {floods.map(i => (
          <span key={i} className="sl-flood" style={{ '--i': i }}><i className="sl-beam"/></span>
        ))}
      </div>
      <div className="sl-cam">
        <div className="sl-pitch">
          <svg viewBox="0 0 680 1050" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="3">
            <rect x="10" y="10" width="660" height="1030"/>
            <line x1="10" y1="525" x2="670" y2="525"/>
            <circle cx="340" cy="525" r="91.5"/>
            <circle cx="340" cy="525" r="4" fill="currentColor"/>
            <rect x="138" y="10" width="404" height="165"/>
            <rect x="248" y="10" width="184" height="55"/>
            <path d="M267 175 A91.5 91.5 0 0 0 413 175"/>
            <rect x="138" y="875" width="404" height="165"/>
            <rect x="248" y="985" width="184" height="55"/>
            <path d="M267 875 A91.5 91.5 0 0 1 413 875"/>
          </svg>
        </div>
        <div className="sl-haze"/>
        {/* net layer (behind the ball) */}
        <div ref={netGoalRef} className="sl-goal sl-goal-net">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none">
            <path d={STATIC_SIDES} stroke="rgba(230,240,232,0.3)" strokeWidth="0.6"/>
            <path ref={netPathRef} className="sl-net" d={initialNet} stroke="rgba(230,240,232,0.62)" strokeWidth="0.75" strokeLinejoin="round"/>
          </svg>
        </div>
        <div ref={spotRef} className="sl-ball-spot">
          <span className="sl-shadow"/>
          <span className="sl-halo"/>
          <div ref={ballRef} className="sl-ball">
            <SoccerBall size={160} drawRef={drawRef}/>
          </div>
        </div>
        {/* frame layer (in front of the ball once it is in the goal) */}
        <div className="sl-goal sl-goal-frame">
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none">
            <path d={`M${FRONT.l} ${FRONT.floor} V${FRONT.top} H${FRONT.r} V${FRONT.floor}`} stroke="#F5F7F2" strokeWidth="2.6" strokeLinejoin="round"/>
            <rect ref={postRef} className="sl-post" x={FRONT.l - 1.3} y={FRONT.top} width="2.6" height={FRONT.floor - FRONT.top} fill="#F5F7F2"/>
          </svg>
        </div>
      </div>
    </div>
  );
});
