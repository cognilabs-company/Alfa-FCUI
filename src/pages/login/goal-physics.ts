// @ts-nocheck
/*
 * Small, dependency-free physics for the login goal (part of the lazy 3D chunk).
 *
 *  - Ball: rigid sphere with gravity, quadratic air drag and Magnus lift from
 *    spin; collides with the ground (restitution + friction → rolling) and with
 *    the posts/crossbar (capsules). Integrated with semi-implicit Euler at a
 *    fixed 1/240 s step by the caller, so it looks the same at any frame rate.
 *  - Net: Verlet cloth. Back, roof and side panels share their edge particles;
 *    structural, shear and bend constraints act like cords (they resist
 *    stretching, not compression). Edges on the frame and the ground are pinned.
 *    The ball pushes particles out of its sphere and takes the reaction back, so
 *    the net bellies, catches the ball and snaps back.
 *  - Camera spring: critically damped, implicit form (stable for any dt).
 *
 * Units are the scene's (metres, but the ball and goal are stylised: the ball
 * radius is ~1). Constants are tuned for the look, not for FIFA accuracy.
 */

export const PHYS = {
  G: 30,            // gravity
  DRAG: 0.0042,     // a = −k |v| v
  MAGNUS: 0.0045,   // a = k (ω × v)
  SPIN_DECAY: 0.35, // ω *= e^(−k t) in the air
  GROUND_E: 0.5,    // ground restitution
  POST_E: 0.62,     // post restitution
  POST_R: 0.13,
  ROLL_DRAG: 1.1,
  STEP: 1 / 240,
};

/* ---------------- vectors on plain arrays ---------------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/* ------------------------------------------------------------------ */
/* Ball                                                                 */
/* ------------------------------------------------------------------ */

export function makeBall(p, r) {
  return { p: [...p], v: [0, 0, 0], w: [0, 0, 0], r, grounded: false };
}

/** Free flight only (no collisions): used by the kick solver and the integrator. */
function accel(b) {
  const v = b.v;
  const s = len(v);
  const m = cross(b.w, v);
  return [
    -PHYS.DRAG * s * v[0] + PHYS.MAGNUS * m[0],
    -PHYS.G - PHYS.DRAG * s * v[1] + PHYS.MAGNUS * m[1],
    -PHYS.DRAG * s * v[2] + PHYS.MAGNUS * m[2],
  ];
}

export function integrateBall(b, dt) {
  const a = accel(b);
  b.v[0] += a[0] * dt; b.v[1] += a[1] * dt; b.v[2] += a[2] * dt;
  b.p[0] += b.v[0] * dt; b.p[1] += b.v[1] * dt; b.p[2] += b.v[2] * dt;
  const k = Math.exp(-PHYS.SPIN_DECAY * dt);
  b.w[0] *= k; b.w[1] *= k; b.w[2] *= k;
}

/** Ground contact. Returns the impact speed (0 if no new impact). */
export function collideGround(b, dt) {
  if (b.p[1] >= b.r) { b.grounded = false; return 0; }
  b.p[1] = b.r;
  let hit = 0;
  if (b.v[1] < 0) {
    hit = -b.v[1];
    b.v[1] = hit > 1.2 ? hit * PHYS.GROUND_E : 0;
  }
  // friction pulls the contact point toward rolling: v_t → rolling, ω → v/r
  const roll = [b.v[2] / b.r, b.w[1], -b.v[0] / b.r]; // up × v / r, keeping yaw spin
  const slip = 1 - Math.exp(-14 * dt);
  // spin feeds back into the travel a little (backspin checks the ball)
  const spinVel = [-b.w[2] * b.r, 0, b.w[0] * b.r];
  b.v[0] += (spinVel[0] - b.v[0]) * slip * 0.25;
  b.v[2] += (spinVel[2] - b.v[2]) * slip * 0.25;
  b.w[0] += (roll[0] - b.w[0]) * slip;
  b.w[2] += (roll[2] - b.w[2]) * slip;
  const d = Math.exp(-PHYS.ROLL_DRAG * dt);
  b.v[0] *= d; b.v[2] *= d;
  b.grounded = true;
  return hit;
}

/** Capsule (post / crossbar) contact. Returns the impact speed (0 if none). */
export function collideSegment(b, a, c, radius = PHYS.POST_R) {
  const ab = sub(c, a);
  const t = Math.max(0, Math.min(1, dot(sub(b.p, a), ab) / dot(ab, ab)));
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  const d = sub(b.p, q);
  const dist = len(d);
  const min = b.r + radius;
  if (dist >= min || dist < 1e-6) return 0;
  const n = [d[0] / dist, d[1] / dist, d[2] / dist];
  b.p[0] = q[0] + n[0] * min; b.p[1] = q[1] + n[1] * min; b.p[2] = q[2] + n[2] * min;
  const vn = dot(b.v, n);
  if (vn >= 0) return 0;
  // normal bounce
  b.v[0] -= (1 + PHYS.POST_E) * vn * n[0];
  b.v[1] -= (1 + PHYS.POST_E) * vn * n[1];
  b.v[2] -= (1 + PHYS.POST_E) * vn * n[2];
  // tangential friction turns sliding into spin
  const vt = [b.v[0] - dot(b.v, n) * n[0], b.v[1] - dot(b.v, n) * n[1], b.v[2] - dot(b.v, n) * n[2]];
  const spin = cross(n, vt);
  const k = 0.35 / b.r;
  b.w[0] += spin[0] * k; b.w[1] += spin[1] * k; b.w[2] += spin[2] * k;
  b.v[0] -= vt[0] * 0.12; b.v[1] -= vt[1] * 0.12; b.v[2] -= vt[2] * 0.12;
  return -vn;
}

/**
 * Solve the kick: the initial velocity that carries the ball from its current
 * position through `target` after roughly `T` seconds, with drag and Magnus
 * included (shooting method on the plane z = target.z).
 */
export function solveKick(b, target, T, spin) {
  let v = [
    (target[0] - b.p[0]) / T,
    (target[1] - b.p[1]) / T + 0.5 * PHYS.G * T,
    (target[2] - b.p[2]) / T,
  ];
  for (let it = 0; it < 8; it++) {
    const s = { p: [...b.p], v: [...v], w: [...spin], r: b.r };
    let tt = 0;
    while (s.p[2] > target[2] && tt < 3) { integrateBall(s, PHYS.STEP); tt += PHYS.STEP; }
    const ex = target[0] - s.p[0];
    const ey = target[1] - s.p[1];
    const et = T - tt;
    v[0] += ex / Math.max(0.2, tt);
    v[1] += ey / Math.max(0.2, tt);
    v[2] *= 1 - 0.5 * et / T; // reach the plane on time
    if (Math.abs(ex) < 0.02 && Math.abs(ey) < 0.02 && Math.abs(et) < 0.01) break;
  }
  b.v = v;
  b.w = [...spin];
}

/* ------------------------------------------------------------------ */
/* Cloth net                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the net box behind a goal whose mouth is at z = z0, posts at x = ±w/2,
 * height h, depth d (going −z). `spacing` sets the mesh size (≈0.5 normal,
 * ≈1 on slow devices).
 */
export function buildNet({ w, h, d, z0, spacing }) {
  const pts = [];
  const key = new Map();
  const nu = Math.max(4, Math.round(w / spacing));
  const nv = Math.max(3, Math.round(h / spacing));
  const nd = Math.max(2, Math.round(d / spacing));
  const P = (x, y, z) => {
    const k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let i = key.get(k);
    if (i == null) { i = pts.length; key.set(k, i); pts.push([x, y, z]); }
    return i;
  };
  const panels = [];
  // grid helper: f(i, j) → position; returns index grid
  const panel = (ni, nj, f) => {
    const g = [];
    for (let i = 0; i <= ni; i++) { g[i] = []; for (let j = 0; j <= nj; j++) g[i][j] = P(...f(i / ni, j / nj)); }
    panels.push(g);
    return g;
  };
  const hw = w / 2;
  panel(nu, nv, (u, v) => [-hw + w * u, h * v, z0 - d]);           // back
  panel(nu, nd, (u, v) => [-hw + w * u, h, z0 - d * v]);            // roof
  panel(nd, nv, (u, v) => [-hw, h * v, z0 - d * u]);                // left side
  panel(nd, nv, (u, v) => [hw, h * v, z0 - d * u]);                 // right side

  const n = pts.length;
  const pos = new Float32Array(n * 3);
  pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
  const inv = new Float32Array(n).fill(1);
  const E = 1e-3;
  pts.forEach(([x, y, z], i) => {
    const ground = y < E;
    const front = Math.abs(z - z0) < E;                      // on the posts / crossbar
    const backCorner = Math.abs(Math.abs(x) - hw) < E && Math.abs(z - (z0 - d)) < E; // stanchions
    if (ground || front || backCorner) inv[i] = 0;
  });

  const pairs = new Map();
  const cons = []; // [a, b, kind] kind 0 structural, 1 shear, 2 bend
  const add = (a, b, kind) => {
    if (a === b) return;
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (pairs.has(k)) return;
    pairs.set(k, 1);
    cons.push([a, b, kind]);
  };
  for (const g of panels) {
    const ni = g.length - 1, nj = g[0].length - 1;
    for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) {
      if (i < ni) add(g[i][j], g[i + 1][j], 0);
      if (j < nj) add(g[i][j], g[i][j + 1], 0);
      if (i < ni && j < nj) { add(g[i][j], g[i + 1][j + 1], 1); add(g[i + 1][j], g[i][j + 1], 1); }
      if (i < ni - 1) add(g[i][j], g[i + 2][j], 2);
      if (j < nj - 1) add(g[i][j], g[i][j + 2], 2);
    }
  }
  const m = cons.length;
  const ca = new Uint16Array(m), cb = new Uint16Array(m), rest = new Float32Array(m), kind = new Uint8Array(m);
  const SLACK = [1.035, 1.035, 1.06];
  cons.forEach(([a, b, k], i) => {
    ca[i] = a; cb[i] = b; kind[i] = k;
    const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    rest[i] = Math.hypot(dx, dy, dz) * SLACK[k];
  });
  const structural = cons.map((c, i) => (c[2] === 0 ? i : -1)).filter(i => i >= 0);

  const net = {
    n, pos, prev: Float32Array.from(pos), inv, ca, cb, rest, kind, structural,
    awake: false, energy: 0,
  };
  // let it hang under gravity once, then freeze: idle frames cost nothing
  for (let i = 0; i < 360; i++) stepNet(net, PHYS.STEP, null);
  net.prev.set(net.pos);
  return net;
}

const STIFF = [1, 0.45, 0.22];

/**
 * One cloth step. `ball` (optional) is pushed against; returns the summed
 * contact impulse direction so the caller can feed it back into the ball.
 */
export function stepNet(net, dt, ball, iterations = 3) {
  const { n, pos, prev, inv } = net;
  const g = PHYS.G * 0.45 * dt * dt; // nets are light: slower fall reads better
  const damp = 0.988;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    if (!inv[i]) continue;
    const o = i * 3;
    const vx = (pos[o] - prev[o]) * damp, vy = (pos[o + 1] - prev[o + 1]) * damp, vz = (pos[o + 2] - prev[o + 2]) * damp;
    prev[o] = pos[o]; prev[o + 1] = pos[o + 1]; prev[o + 2] = pos[o + 2];
    pos[o] += vx; pos[o + 1] += vy - g; pos[o + 2] += vz;
    energy += vx * vx + vy * vy + vz * vz;
  }
  const { ca, cb, rest, kind } = net;
  const m = ca.length;
  for (let it = 0; it < iterations; it++) {
    for (let c = 0; c < m; c++) {
      const a = ca[c], b = cb[c];
      const wa = inv[a], wb = inv[b];
      const ws = wa + wb;
      if (!ws) continue;
      const ao = a * 3, bo = b * 3;
      const dx = pos[bo] - pos[ao], dy = pos[bo + 1] - pos[ao + 1], dz = pos[bo + 2] - pos[ao + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r = rest[c];
      if (L <= r) continue; // cords: no push back when slack
      const f = ((L - r) / L) * STIFF[kind[c]] / ws;
      pos[ao] += dx * f * wa; pos[ao + 1] += dy * f * wa; pos[ao + 2] += dz * f * wa;
      pos[bo] -= dx * f * wb; pos[bo + 1] -= dy * f * wb; pos[bo + 2] -= dz * f * wb;
    }
  }
  // ground + ball contact
  let ix = 0, iy = 0, iz = 0, contacts = 0;
  const br = ball ? ball.r + 0.05 : 0;
  const br2 = br * br;
  for (let i = 0; i < n; i++) {
    if (!inv[i]) continue;
    const o = i * 3;
    if (pos[o + 1] < 0.02) pos[o + 1] = 0.02;
    if (!ball) continue;
    const dx = pos[o] - ball.p[0], dy = pos[o + 1] - ball.p[1], dz = pos[o + 2] - ball.p[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= br2 || d2 < 1e-8) continue;
    const d = Math.sqrt(d2);
    const push = (br - d) / d;
    pos[o] += dx * push; pos[o + 1] += dy * push; pos[o + 2] += dz * push;
    ix -= dx * push; iy -= dy * push; iz -= dz * push;
    contacts++;
  }
  net.energy = energy;
  return { ix, iy, iz, contacts };
}

/**
 * Feed a net contact back into the ball: momentum from the pushed particles,
 * plus inelastic loss along the contact normal (netting soaks up the shot
 * instead of acting like a trampoline). Tangential motion and gravity stay.
 */
export function netReaction(b, r, h, massRatio = 0.022, absorb = 40) {
  const k = massRatio / h;
  b.v[0] += r.ix * k; b.v[1] += r.iy * k; b.v[2] += r.iz * k;
  const l = Math.hypot(r.ix, r.iy, r.iz);
  if (l < 1e-9) return;
  const n = [r.ix / l, r.iy / l, r.iz / l];
  const vn = dot(b.v, n);
  const loss = 1 - Math.exp(-absorb * h);
  b.v[0] -= n[0] * vn * loss; b.v[1] -= n[1] * vn * loss; b.v[2] -= n[2] * vn * loss;
}

/** Kick nearby particles (post knock → the side net shakes). */
export function shakeNet(net, at, radius, amount) {
  const { n, pos, prev, inv } = net;
  for (let i = 0; i < n; i++) {
    if (!inv[i]) continue;
    const o = i * 3;
    const d = Math.hypot(pos[o] - at[0], pos[o + 1] - at[1], pos[o + 2] - at[2]);
    if (d > radius) continue;
    const k = amount * (1 - d / radius);
    prev[o] += (Math.sin(i * 12.9898) * 0.6 + 0.4) * k;
    prev[o + 2] += k;
  }
}

/** Write the structural cords into a LineSegments position buffer. */
export function writeNetLines(net, out) {
  const { pos, ca, cb, structural } = net;
  let k = 0;
  for (const c of structural) {
    const a = ca[c] * 3, b = cb[c] * 3;
    out[k++] = pos[a]; out[k++] = pos[a + 1]; out[k++] = pos[a + 2];
    out[k++] = pos[b]; out[k++] = pos[b + 1]; out[k++] = pos[b + 2];
  }
}

/* ------------------------------------------------------------------ */
/* Critically damped spring (implicit Euler, stable for any dt)         */
/* ------------------------------------------------------------------ */

export function springVec(x, v, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const inv = 1 / (f + hhoo);
  for (const k of ['x', 'y', 'z']) {
    const nx = (f * x[k] + dt * v[k] + hhoo * target[k]) * inv;
    const nv = (v[k] + hoo * (target[k] - x[k])) * inv;
    x[k] = nx; v[k] = nv;
  }
}
