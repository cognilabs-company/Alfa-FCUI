// @ts-nocheck
import * as THREE from 'three';

/*
 * "Night stadium" — the 3D backdrop of the login screen.
 *
 * Loaded lazily (dynamic import) after the form has rendered, so three.js
 * lives in its own chunk and never delays first paint or typing.
 *
 *  - World: metres, pitch along z (goal line at z = −52.5), camera near the
 *    halfway line looking at the far goal. Field lines are real geometry on
 *    the ground, so they recede in true perspective.
 *  - Ball: a textured sphere. The truncated-icosahedron panels, seams and
 *    the club crest are painted into an equirectangular texture at start-up
 *    (same look as the side-nav ball, just much bigger).
 *  - Four floodlight towers along the far stand; light cones, glow sprites
 *    and drifting dust make the haze.
 *  - Timelines (intro, goal, miss) are sampled from elapsed time every
 *    frame; small state (juggle, spin, dimming) is integrated with dt.
 *
 * The scene never touches the DOM outside its own container. It talks back
 * through callbacks: onIntro, onFlash, onTunnel, onDegrade.
 */

const PITCH_L = 105;
const PITCH_W = 68;
const GOAL_Z = -PITCH_L / 2;
const GOAL_W = 12;
const GOAL_H = 4.4;
const GOAL_D = 2.6;
const BALL_R = 1;
const HOVER = new THREE.Vector3(-3.2, 2.3, 0);
const INTRO = 1.5;

const CAM_START = { pos: new THREE.Vector3(0, 21, 34), look: new THREE.Vector3(0, 0, -6) };
const CAM_BASE = { pos: new THREE.Vector3(0, 4.1, 14.5), look: new THREE.Vector3(0, 3.6, -22) };

const TOWERS = [
  { x: -27, z: -66, h: 21 },
  { x: -7, z: -72, h: 23 },
  { x: 14, z: -72, h: 23 },
  { x: 36, z: -64, h: 21 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2.2);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */

/** Ball colour / bump / roughness-metalness maps, crest drawn on the front pentagon. */
function buildBallMaps() {
  const W = 1024, H = 512;
  const P = (1 + Math.sqrt(5)) / 2;
  let V = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) V.push([0, s1, s2 * P], [s1, s2 * P, 0], [s2 * P, 0, s1]);
  V = V.map(v => new THREE.Vector3(...v).normalize());

  // Rotate so vertex 0 faces +z (toward the camera) with a pentagon corner straight up.
  const adj = V.map(() => []);
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
    if (V[i].distanceTo(V[j]) < 1.1) { adj[i].push(j); adj[j].push(i); }
  }
  const qa = new THREE.Quaternion().setFromUnitVectors(V[0], new THREE.Vector3(0, 0, 1));
  V.forEach(v => v.applyQuaternion(qa));
  const c0 = V[0].clone().lerp(V[adj[0][0]], 1 / 3).normalize();
  const ang = Math.atan2(c0.x, c0.y);
  const qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
  V.forEach(v => v.applyQuaternion(qb));

  const cut = (i, j) => V[i].clone().lerp(V[j], 1 / 3).normalize();
  const cells = V.map((v, i) => {
    const t1 = new THREE.Vector3().crossVectors(v, Math.abs(v.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(v, t1);
    const corners = adj[i].map(j => cut(i, j)).sort((a, b) => Math.atan2(a.dot(t2), a.dot(t1)) - Math.atan2(b.dot(t2), b.dot(t1)));
    const planes = corners.map((a, k) => {
      const n = new THREE.Vector3().crossVectors(a, corners[(k + 1) % 5]).normalize();
      if (n.dot(v) < 0) n.negate();
      return n;
    });
    const seams = adj[i].map(j => {
      const m = new THREE.Vector3().crossVectors(v, V[j]).normalize();
      const t = V[j].clone().addScaledVector(v, -V[j].dot(v)).normalize();
      return { m, t };
    });
    return { v, planes, seams };
  });

  const [cc, cx] = canvas(W, H);
  const [bc, bx] = canvas(W, H);
  const [rc, rx] = canvas(W, H);
  const col = cx.createImageData(W, H);
  const bum = bx.createImageData(W, H);
  const rm = rx.createImageData(W, H);
  const p = new THREE.Vector3();
  const SEAM = 0.011;
  const AA = 0.006;
  for (let y = 0; y < H; y++) {
    const th = ((y + 0.5) / H) * Math.PI;
    const st = Math.sin(th), ct = Math.cos(th);
    for (let x = 0; x < W; x++) {
      const ph = ((x + 0.5) / W) * Math.PI * 2;
      p.set(-Math.cos(ph) * st, ct, Math.sin(ph) * st);
      let best = 0, bd = -2;
      for (let i = 0; i < 12; i++) { const d = p.dot(V[i]); if (d > bd) { bd = d; best = i; } }
      const cell = cells[best];
      let minIn = 9, allIn = true;
      for (const n of cell.planes) { const d = p.dot(n); if (d < minIn) minIn = d; if (d < -SEAM) allIn = false; }
      const inside = smooth((minIn + AA) / (2 * AA)); // 0 outside → 1 inside
      let seam = allIn ? 1 - smooth((Math.abs(minIn) - SEAM * 0.55) / AA) : 0;
      if (!allIn) {
        for (const s of cell.seams) {
          if (p.dot(s.t) <= 0) continue;
          const d = Math.abs(p.dot(s.m));
          seam = Math.max(seam, 1 - smooth((d - SEAM * 0.45) / AA));
        }
      }
      const front = best === 0;
      const pent = front ? 0 : inside;
      // leather → dark panel → seam
      const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const lea = 236 + noise * 6;
      let r = lerp(lea, 27, pent), g = lerp(lea - 3, 33, pent), b = lerp(lea - 10, 32, pent);
      r = lerp(r, 70, seam * 0.75); g = lerp(g, 76, seam * 0.75); b = lerp(b, 74, seam * 0.75);
      const o = (y * W + x) * 4;
      col.data[o] = r; col.data[o + 1] = g; col.data[o + 2] = b; col.data[o + 3] = 255;
      const h = 255 - seam * 200 - pent * 10;
      bum.data[o] = bum.data[o + 1] = bum.data[o + 2] = h; bum.data[o + 3] = 255;
      const frontIn = front && inside > 0.5;
      rm.data[o] = 0;
      rm.data[o + 1] = frontIn ? 70 : seam > 0.5 ? 230 : pent > 0.5 ? 105 : 125; // roughness
      rm.data[o + 2] = frontIn ? 110 : 0; // metalness: the crest glints
      rm.data[o + 3] = 255;
    }
  }
  cx.putImageData(col, 0, 0);
  bx.putImageData(bum, 0, 0);
  rx.putImageData(rm, 0, 0);

  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bc);
  const rough = new THREE.CanvasTexture(rc);

  /** Draw the crest (an <img> of the club SVG) onto the front pentagon. */
  function drawCrest(img) {
    const size = W * 0.1;
    const x0 = W * 0.25, y0 = H * 0.5;
    cx.save();
    cx.translate(x0, y0);
    cx.drawImage(img, -size / 2, -size / 2 - size * 0.02, size, size);
    cx.restore();
    map.needsUpdate = true;
  }
  return { map, bump, rough, drawCrest };
}

function grassTexture(maxAniso) {
  const S = 1024;
  const [c, x] = canvas(S, S);
  const span = 150; // metres covered by the texture
  const stripe = PITCH_L / 20;
  for (let py = 0; py < S; py++) {
    const z = (py / S) * span - span / 2;
    const k = Math.floor((z + PITCH_L / 2) / stripe);
    x.fillStyle = k % 2 ? '#15361f' : '#1a4127';
    x.fillRect(0, py, S, 1);
  }
  // fine grain
  const img = x.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n * 1.2; img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return { tex: t, span };
}

function radialTexture(stops, size = 128) {
  const [c, x] = canvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function streakTexture() {
  const [c, x] = canvas(256, 32);
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 12, 256, 8);
  const v = x.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = v;
  x.fillRect(0, 0, 256, 32);
  return new THREE.CanvasTexture(c);
}

function lampTexture() {
  const [c, x] = canvas(128, 64);
  x.fillStyle = '#20261f';
  x.fillRect(0, 0, 128, 64);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
    const cx0 = 12 + k * 20.8, cy0 = 12 + r * 20;
    const g = x.createRadialGradient(cx0, cy0, 0, cx0, cy0, 9);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f4ffe0'); g.addColorStop(1, 'rgba(230,255,200,0)');
    x.fillStyle = g;
    x.fillRect(cx0 - 10, cy0 - 10, 20, 20);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function netTexture() {
  const [c, x] = canvas(64, 64);
  x.clearRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(255,255,255,1)';
  x.lineWidth = 3;
  x.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function standTexture() {
  const [c, x] = canvas(1024, 128);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#05080a'); g.addColorStop(1, '#0c1411');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 128);
  for (let r = 0; r < 14; r++) {
    x.fillStyle = `rgba(255,255,255,${0.018 + r * 0.002})`;
    x.fillRect(0, 30 + r * 7, 1024, 1);
  }
  for (let i = 0; i < 380; i++) {
    x.fillStyle = Math.random() < 0.12 ? 'rgba(200,240,60,0.55)' : `rgba(255,255,240,${0.12 + Math.random() * 0.3})`;
    x.fillRect(Math.random() * 1024, 30 + Math.random() * 96, 1.3, 1.3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

/* ------------------------------------------------------------------ */
/* Pitch markings as real ground geometry                              */
/* ------------------------------------------------------------------ */

function lineGeometry() {
  const pos = [];
  const W = 0.2;
  const seg = (x1, z1, x2, z2) => {
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * W / 2, nz = (dx / l) * W / 2;
    pos.push(x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz, x2 + nx, 0, z2 + nz,
      x2 + nx, 0, z2 + nz, x1 - nx, 0, z1 - nz, x2 - nx, 0, z2 - nz);
  };
  const rect = (x1, z1, x2, z2) => { seg(x1, z1, x2, z1); seg(x2, z1, x2, z2); seg(x2, z2, x1, z2); seg(x1, z2, x1, z1); };
  const arc = (cx, cz, r, a0, a1, n = 64) => {
    for (let i = 0; i < n; i++) {
      const t0 = a0 + (a1 - a0) * (i / n), t1 = a0 + (a1 - a0) * ((i + 1) / n);
      seg(cx + Math.cos(t0) * r, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cz + Math.sin(t1) * r);
    }
  };
  const disc = (cx, cz, r, n = 20) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      pos.push(cx, 0, cz, cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r);
    }
  };
  const hw = PITCH_W / 2, hl = PITCH_L / 2;
  rect(-hw, -hl, hw, hl);
  seg(-hw, 0, hw, 0);
  arc(0, 0, 9.15, 0, Math.PI * 2, 96);
  disc(0, 0, 0.3);
  for (const s of [-1, 1]) {
    const gz = s * hl;
    rect(-20.16, gz, 20.16, gz - s * 16.5);
    rect(-9.16, gz, 9.16, gz - s * 5.5);
    disc(0, gz - s * 11, 0.25);
    const a = Math.acos(5.5 / 9.15);
    if (s < 0) arc(0, gz + 11, 9.15, Math.PI / 2 - (Math.PI / 2 - a), Math.PI / 2 + (Math.PI / 2 - a), 32);
    else arc(0, gz - 11, 9.15, -Math.PI / 2 - (Math.PI / 2 - a), -Math.PI / 2 + (Math.PI / 2 - a), 32);
    arc(-hw, gz, 1, s < 0 ? 0 : -Math.PI / 2, s < 0 ? Math.PI / 2 : 0, 8);
    arc(hw, gz, 1, s < 0 ? Math.PI / 2 : Math.PI, s < 0 ? Math.PI : Math.PI * 1.5, 8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // All ground quads face up.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/* ------------------------------------------------------------------ */
/* Light cone shader                                                    */
/* ------------------------------------------------------------------ */

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#f2ffd8') }, uOpacity: { value: 0 } },
    vertexShader: `
      varying float vAlong;
      varying float vFacing;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlong;
      varying float vFacing;
      void main() {
        float a = pow(vAlong, 2.2) * pow(vFacing, 1.6) * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

export function createStadium({ container, crestSvg, onIntro, onFlash, onTunnel, onDegrade }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor('#05090a');
  const cv = renderer.domElement;
  cv.className = 'auth-scene-canvas';
  cv.setAttribute('aria-hidden', 'true');
  container.appendChild(cv);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05090a');
  scene.fog = new THREE.FogExp2('#0a1310', 0.0115);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // --- lights
  const hemi = new THREE.HemisphereLight('#6f8a7c', '#060c09', 0);
  scene.add(hemi);
  const key = new THREE.PointLight('#ffffff', 0, 8, 1);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#d8ff9a', 0);
  rim.position.set(-6, 10, -20);
  scene.add(rim);

  // --- pitch
  const grass = grassTexture(maxAniso);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(grass.span, grass.span),
    new THREE.MeshStandardMaterial({ map: grass.tex, roughness: 0.93, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const lineMat = new THREE.MeshStandardMaterial({
    color: '#d6f7c4', emissive: '#7fbf68', emissiveIntensity: 0, roughness: 0.7, side: THREE.DoubleSide,
    transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const lines = new THREE.Mesh(lineGeometry(), lineMat);
  lines.position.y = 0.02;
  scene.add(lines);

  // --- stands + crowd glints
  const stands = new THREE.Mesh(
    new THREE.CylinderGeometry(96, 82, 26, 72, 1, true),
    new THREE.MeshBasicMaterial({ map: standTexture(), side: THREE.BackSide, fog: true })
  );
  stands.position.set(0, 11, -6);
  stands.scale.set(1, 1, 0.98);
  scene.add(stands);

  // --- floodlights
  const glowTex = radialTexture([[0, 'rgba(255,255,245,1)'], [0.18, 'rgba(240,255,215,0.6)'], [0.5, 'rgba(200,240,160,0.12)'], [1, 'rgba(0,0,0,0)']]);
  const streakTex = streakTexture();
  const lampTex = lampTexture();
  const towers = TOWERS.map((tw, i) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, tw.h, 8), new THREE.MeshStandardMaterial({ color: '#141a17', roughness: 0.8 }));
    pole.position.y = tw.h / 2;
    g.add(pole);
    const head = new THREE.Group();
    head.position.y = tw.h + 1.4;
    const lampMat = new THREE.MeshBasicMaterial({ map: lampTex, color: new THREE.Color(0.08, 0.08, 0.08), fog: false });
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), lampMat);
    head.add(lamp);
    const back = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.9, 0.5), new THREE.MeshStandardMaterial({ color: '#101512' }));
    back.position.z = -0.3;
    head.add(back);
    g.add(head);
    g.position.set(tw.x, 0, tw.z);
    head.lookAt(new THREE.Vector3(0, 0, 0).sub(g.position).setY(-tw.h * 0.6).add(g.position));
    scene.add(g);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 }));
    glow.position.set(tw.x, tw.h + 1.6, tw.z + 1);
    glow.scale.setScalar(22);
    scene.add(glow);
    const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0, color: '#eaffc8' }));
    streak.position.copy(glow.position);
    streak.scale.set(30, 2.2, 1);
    scene.add(streak);

    const target = new THREE.Vector3(tw.x * 0.18, 0, lerp(-10, 6, i % 2 ? 0.2 : 0.8));
    const spot = new THREE.SpotLight('#f3ffe6', 0, 0, 0.42, 0.75, 0);
    spot.position.copy(glow.position);
    spot.target.position.copy(target);
    scene.add(spot, spot.target);

    // volumetric cone from the lamp to the target
    const len = glow.position.distanceTo(target) * 0.95;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, len * Math.tan(0.36), len, 40, 1, true), beamMaterial());
    beam.position.copy(glow.position).lerp(target, 0.5 * 0.95);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), glow.position.clone().sub(target).normalize());
    scene.add(beam);

    return { lampMat, glow, streak, spot, beam, on: 0.18 + i * 0.24, level: 0 };
  });

  // --- haze: dust motes in the light
  const dustN = 420;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 70;
    dustPos[i * 3 + 1] = 1 + Math.random() * 26;
    dustPos[i * 3 + 2] = -60 + Math.random() * 70;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.22, map: radialTexture([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], 32),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: '#e6ffd0',
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  const hazeTex = radialTexture([[0, 'rgba(190,230,170,0.5)'], [1, 'rgba(0,0,0,0)']]);
  const hazes = [[-22, 9, -48, 60], [20, 8, -50, 64], [0, 4, -30, 70]].map(([x, y, z, s]) => {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    h.position.set(x, y, z);
    h.scale.set(s, s * 0.45, 1);
    scene.add(h);
    return h;
  });

  // --- goal
  const goal = new THREE.Group();
  goal.position.z = GOAL_Z;
  scene.add(goal);
  const postMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.08, roughness: 0.35 });
  const postGeo = new THREE.CylinderGeometry(0.13, 0.13, GOAL_H, 12);
  const posts = [-1, 1].map(s => {
    const m = new THREE.Mesh(postGeo, postMat);
    m.position.set(s * GOAL_W / 2, GOAL_H / 2, 0);
    goal.add(m);
    return m;
  });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, GOAL_W + 0.26, 12), postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = GOAL_H;
  goal.add(bar);

  const netTex = netTexture();
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, color: '#dfe8e0' });
  const mkNet = (w, h, rx, ry) => {
    const t = netTex.clone();
    t.repeat.set(w / 0.5, h / 0.5);
    t.needsUpdate = true;
    const mat = netMat.clone();
    mat.map = t;
    const g = new THREE.PlaneGeometry(w, h, Math.round(w * 2.5), Math.round(h * 2.5));
    const m = new THREE.Mesh(g, mat);
    m.rotation.set(rx, ry, 0);
    m.userData.base = Float32Array.from(g.attributes.position.array);
    goal.add(m);
    return m;
  };
  const netBack = mkNet(GOAL_W, GOAL_H, 0, 0);
  netBack.position.set(0, GOAL_H / 2, -GOAL_D);
  const netTop = mkNet(GOAL_W, GOAL_D, -Math.PI / 2, 0);
  netTop.position.set(0, GOAL_H, -GOAL_D / 2);
  const netSides = [-1, 1].map(s => {
    const m = mkNet(GOAL_D, GOAL_H, 0, Math.PI / 2);
    m.position.set(s * GOAL_W / 2, GOAL_H / 2, -GOAL_D / 2);
    return m;
  });
  const nets = [netBack, netTop, ...netSides];

  // --- ball
  const maps = buildBallMaps();
  const ballMat = new THREE.MeshPhysicalMaterial({
    map: maps.map, bumpMap: maps.bump, bumpScale: 2.2,
    roughnessMap: maps.rough, metalnessMap: maps.rough, roughness: 1, metalness: 1,
    clearcoat: 0.55, clearcoatRoughness: 0.22,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 96, 64), ballMat);
  scene.add(ball);
  if (crestSvg) {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([crestSvg], { type: 'image/svg+xml' }));
    img.onload = () => { if (!disposed) maps.drawCrest(img); URL.revokeObjectURL(url); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  scene.add(shadow);

  const lime = new THREE.Color('#C8F03C');
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 1.55, 64),
    new THREE.MeshBasicMaterial({ color: lime, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.05;
  scene.add(halo);

  // --- fx sprites
  const ringTex = radialTexture([[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [0.8, 'rgba(230,255,170,1)'], [1, 'rgba(0,0,0,0)']]);
  const kickRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: lime, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  scene.add(kickRing);
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: '#ffffff' }));
  scene.add(spark);
  const trail = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lime, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    scene.add(s);
    return s;
  });
  const trailPts = [];

  /* ---------------- state ---------------- */
  const S = {
    w: 1, h: 1,
    pointer: new THREE.Vector2(), pointerS: new THREE.Vector2(),
    target: null, // desired screen point for the ball {x, y, d}
    off: new THREE.Vector2(), offT: new THREE.Vector2(),
    scale: 1, scaleT: 1,
    secret: 0, secretT: 0,
    loading: false,
    hoverY: 0, vy: 0,
    angVel: new THREE.Vector3(0, 13, 0),
    q: new THREE.Quaternion(),
    haloPulse: 0,
    seq: null, // {kind, t0, resolve, hitDone, flashDone, tunnelDone, from}
    master: 1,
  };

  let t = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;
  let introFired = false;
  const fps = { n: 0, time: 0, checked: 0 };

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  function resize() {
    const r = container.getBoundingClientRect();
    S.w = Math.max(1, Math.round(r.width));
    S.h = Math.max(1, Math.round(r.height));
    renderer.setSize(S.w, S.h, false);
    cv.style.width = '100%';
    cv.style.height = '100%';
  }
  resize();

  const baseCam = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  const tmpV = new THREE.Vector3();

  /** Base framing: where the hover point lands with the resting camera and no view offset. */
  function frameTargets() {
    const { w, h } = S;
    baseCam.aspect = w / h;
    baseCam.fov = 38;
    baseCam.position.copy(CAM_BASE.pos);
    baseCam.lookAt(CAM_BASE.look);
    baseCam.updateProjectionMatrix();
    baseCam.updateMatrixWorld();
    const hov = tmpV.copy(HOVER);
    const dist = baseCam.position.distanceTo(hov);
    hov.project(baseCam);
    const bx = (hov.x + 1) / 2 * w, by = (1 - hov.y) / 2 * h;
    const focal = h / (2 * Math.tan((38 * Math.PI) / 360));
    const projD = (2 * BALL_R * focal) / dist;
    const tg = S.target;
    const leaving = S.seq && S.seq.kind === 'goal';
    if (tg && !leaving) {
      S.offT.set(tg.x - bx, tg.y - by);
      S.scaleT = clamp(tg.d / projD, 0.45, 1.3);
    } else {
      S.offT.set(0, leaving ? 0 : h * 0.06);
      S.scaleT = leaving ? S.scaleT : 1;
    }
  }

  function applyCamera(pos, look, fov) {
    const { w, h } = S;
    const dx = S.off.x, dy = S.off.y;
    const W = w + 2 * Math.abs(dx), H = h + 2 * Math.abs(dy);
    camera.fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (H / h)) * 180) / Math.PI;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, Math.abs(dx) - dx, Math.abs(dy) - dy, w, h);
    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  function flick(tt) {
    // staggered switch-on: two stutters, then full
    if (tt < 0) return 0;
    if (tt < 0.05) return 0.75;
    if (tt < 0.11) return 0.08;
    if (tt < 0.15) return 0.9;
    if (tt < 0.2) return 0.25;
    return Math.min(1, 0.7 + (tt - 0.2) * 3);
  }

  const restQ = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const dq = new THREE.Quaternion();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const ballPos = new THREE.Vector3();

  function bez(a, c, b, u, out) {
    const v = 1 - u;
    return out.set(
      v * v * a.x + 2 * v * u * c.x + u * u * b.x,
      v * v * a.y + 2 * v * u * c.y + u * u * b.y,
      v * v * a.z + 2 * v * u * c.z + u * u * b.z,
    );
  }

  function rippleNets(amp, cx, cy, age) {
    for (const m of nets) {
      const pos = m.geometry.attributes.position;
      const base = m.userData.base;
      const isBack = m === netBack;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        let d = 0;
        if (amp > 0.001) {
          const lx = isBack ? x - cx : x, ly = isBack ? y - (cy - GOAL_H / 2) : y;
          const r = Math.hypot(lx, ly);
          const bulge = isBack ? Math.exp(-(r * r) / 3.2) * Math.max(0, 1 - age * 2.2) * 1.3 : 0;
          const wave = Math.sin(r * 2.4 - age * 18) * Math.exp(-r * 0.35) * Math.exp(-age * 2.6) * (isBack ? 0.38 : 0.2);
          d = (bulge + wave) * amp;
        }
        pos.setZ(i, base[i * 3 + 2] - d);
      }
      pos.needsUpdate = true;
    }
  }

  function step(dt, realDt) {
    t += dt;
    const intro = clamp(t / INTRO, 0, 1);
    frameTargets();
    S.off.x = damp(S.off.x, S.offT.x, introFired ? 6 : 50, dt);
    S.off.y = damp(S.off.y, S.offT.y, introFired ? 6 : 50, dt);
    S.scale = damp(S.scale, S.scaleT, introFired ? 6 : 50, dt);
    S.pointerS.x = damp(S.pointerS.x, S.pointer.x, 4, dt);
    S.pointerS.y = damp(S.pointerS.y, S.pointer.y, 4, dt);
    S.secret = damp(S.secret, S.secretT, 5, dt);
    if (!introFired) { introFired = true; onIntro?.(); }

    // --- lights
    let total = 0;
    towers.forEach((tw, i) => {
      tw.level = flick(t - tw.on);
      const L = tw.level * S.master * (1 - 0.42 * S.secret);
      total += L;
      tw.spot.intensity = 1.25 * L;
      tw.lampMat.color.setScalar(0.08 + 1.6 * L);
      tw.glow.material.opacity = 0.95 * L;
      tw.streak.material.opacity = 0.22 * L;
      tw.beam.material.uniforms.uOpacity.value = 0.2 * L;
    });
    const amb = total / towers.length;
    hemi.intensity = 0.03 + 0.34 * amb;
    rim.intensity = 0.9 * amb;
    lineMat.emissiveIntensity = 0.08 + 0.55 * amb;
    dustMat.opacity = 0.45 * amb;
    hazes.forEach(hz => { hz.material.opacity = 0.14 * amb; });
    dust.position.y = Math.sin(t * 0.15) * 0.8;
    dust.rotation.y = t * 0.01;

    // --- camera
    const pIn = easeOut(intro);
    camPos.lerpVectors(CAM_START.pos, CAM_BASE.pos, pIn);
    camLook.lerpVectors(CAM_START.look, CAM_BASE.look, pIn);
    camPos.x += S.pointerS.x * 1.3;
    camPos.y += -S.pointerS.y * 0.55;
    camLook.x += S.pointerS.x * 0.35;
    let fov = 38;

    // key light follows the pointer: the ball's highlight and crest glint move

    // --- ball idle physics
    const hover = ballPos.set(HOVER.x, BALL_R * S.scale + 1.25 + Math.sin(t * 1.6) * 0.1, HOVER.z);
    if (S.hoverY > 0 || S.vy > 0) {
      S.vy -= 22 * dt;
      S.hoverY += S.vy * dt;
      if (S.hoverY <= 0) {
        S.hoverY = 0;
        S.vy = Math.abs(S.vy) > 1.5 ? -S.vy * 0.28 : 0;
      }
    }
    hover.y += S.hoverY;

    const wTarget = S.loading ? 11 : 0;
    S.angVel.y = damp(S.angVel.y, wTarget, S.loading ? 3 : 1.6, dt);
    S.angVel.x = damp(S.angVel.x, 0, 2.2, dt);
    S.angVel.z = damp(S.angVel.z, 0, 2.2, dt);
    const spinning = S.angVel.length() > 0.7 || S.loading;
    if (spinning) {
      const a = S.angVel.length() * dt;
      dq.setFromAxisAngle(tmpV.copy(S.angVel).normalize(), a);
      S.q.premultiply(dq);
    } else {
      eul.set(-0.12 + S.pointerS.y * 0.18, Math.sin(t * 0.7) * 0.3 + S.pointerS.x * 0.3, Math.sin(t * 0.5) * 0.05);
      restQ.setFromEuler(eul);
      S.q.slerp(restQ, 1 - Math.exp(-3.2 * dt));
    }

    let bp = hover;
    let squash = 0;
    let shadowK = 1;

    // --- sequences
    const sq = S.seq;
    if (sq) {
      const st = t - sq.t0;
      const start = sq.from;
      if (sq.kind === 'goal') {
        const kickAt = 0.12, hitAt = 0.62;
        const end = new THREE.Vector3(1.6, 1.9, GOAL_Z - GOAL_D + BALL_R * 0.55);
        const ctrl = new THREE.Vector3(0.6, 7.5, (start.z + end.z) / 2);
        if (st < kickAt) {
          squash = Math.sin((st / kickAt) * Math.PI) * 0.12;
          bp = hover;
        } else if (st < hitAt) {
          const u = easeIn((st - kickAt) / (hitAt - kickAt)) * 0.75 + ((st - kickAt) / (hitAt - kickAt)) * 0.25;
          bp = bez(start, ctrl, end, u, ballPos.clone());
          S.angVel.set(-24, 3, 0);
        } else {
          const a = st - hitAt;
          bp = end.clone();
          bp.z -= Math.min(0.9, a * 3) * (1 - Math.min(1, a * 1.5) * 0.3);
          bp.y = Math.max(BALL_R * 0.6, end.y - a * a * 6);
        }
        if (st >= kickAt && !sq.kicked) { sq.kicked = true; sq.kickAt = t; kickRing.position.copy(hover); }
        if (st >= hitAt && !sq.hit) { sq.hit = true; onFlash?.(); }
        if (st >= 0.78 && !sq.tunnel) { sq.tunnel = true; onTunnel?.(); }
        // camera: chase, then dive into the net
        const chase = easeIn(clamp((st - 0.05) / 0.62, 0, 1));
        camPos.lerp(new THREE.Vector3(0.6, 4.2, GOAL_Z + 26), chase);
        camLook.lerp(new THREE.Vector3(0.8, 2.2, GOAL_Z - 2), chase);
        const dive = easeIn(clamp((st - 0.72) / 0.78, 0, 1));
        camPos.lerp(new THREE.Vector3(1.2, 2.3, GOAL_Z - 0.6), dive);
        fov = lerp(38, 98, dive);
        if (sq.hit) rippleNets(1, end.x, end.y, st - hitAt);
        const glowNet = sq.hit ? clamp(1 - (st - hitAt) * 2.2, 0, 1) : 0;
        nets.forEach(n => { n.material.color.set('#dfe8e0').lerp(lime, glowNet); n.material.opacity = 0.5 + 0.4 * glowNet; });
        S.master = st > hitAt ? 1 + Math.max(0, 0.6 - (st - hitAt)) : 1;
        if (st >= 1.5 && !sq.done) { sq.done = true; sq.resolve(); }
      } else if (sq.kind === 'miss') {
        const kickAt = 0.1, hitAt = 0.55, backAt = 1.05, homeAt = 1.6;
        const post = new THREE.Vector3(-GOAL_W / 2 + 0.2, 2.3, GOAL_Z + BALL_R * 0.9);
        const ctrl = new THREE.Vector3(-2.2, 7, (start.z + post.z) / 2);
        const land = new THREE.Vector3(-3.2, BALL_R * S.scale, -16);
        if (st < kickAt) {
          squash = Math.sin((st / kickAt) * Math.PI) * 0.12;
        } else if (st < hitAt) {
          const u = (st - kickAt) / (hitAt - kickAt);
          bp = bez(start, ctrl, post, easeIn(u) * 0.7 + u * 0.3, ballPos.clone());
          S.angVel.set(-20, -4, 0);
        } else if (st < backAt) {
          const u = (st - hitAt) / (backAt - hitAt);
          bp = new THREE.Vector3().lerpVectors(post, land, u);
          bp.y = lerp(post.y, land.y, u) + Math.sin(u * Math.PI) * 3.2;
          S.angVel.set(12, 2, 0);
        } else {
          const u = smooth((st - backAt) / (homeAt - backAt));
          bp = new THREE.Vector3().lerpVectors(land, hover, u);
          bp.y += Math.sin(u * Math.PI) * 1.2;
        }
        if (st >= kickAt && !sq.kicked) { sq.kicked = true; sq.kickAt = t; kickRing.position.copy(hover); }
        if (st >= hitAt && !sq.hit) {
          sq.hit = true;
          sq.hitT = t;
          spark.position.copy(post).add(new THREE.Vector3(0.2, 0, 0.4));
          sq.resolve();
        }
        // post vibration
        const pa = sq.hit ? Math.exp(-(t - sq.hitT) * 7) * Math.sin((t - sq.hitT) * 70) * 0.09 : 0;
        posts[0].position.x = -GOAL_W / 2 + pa;
        bar.position.x = pa * 0.4;
        const out = easeOut(clamp((st - 0.05) / 0.5, 0, 1)) * (1 - smooth((st - 0.9) / 0.7));
        camPos.lerp(new THREE.Vector3(-1.4, 4.6, -6), out * 0.55);
        camLook.lerp(new THREE.Vector3(-4, 2.4, GOAL_Z), out * 0.5);
        if (st >= homeAt) { S.seq = null; posts[0].position.x = -GOAL_W / 2; bar.position.x = 0; }
      }
      // kick ring + spark
      if (sq.kicked) {
        const a = t - sq.kickAt;
        kickRing.scale.setScalar(1.5 + a * 14);
        kickRing.material.opacity = Math.max(0, 0.9 - a * 2.6);
      }
      if (sq.hit && sq.kind === 'miss') {
        const a = t - sq.hitT;
        spark.scale.setScalar(2 + a * 16);
        spark.material.opacity = Math.max(0, 1 - a * 3);
      }
    } else {
      kickRing.material.opacity = 0;
      spark.material.opacity = 0;
    }

    // trail while flying
    const flying = sq && sq.kicked && !(sq.kind === 'goal' && sq.hit && t - sq.t0 > 0.9);
    trailPts.unshift(bp.clone());
    if (trailPts.length > trail.length) trailPts.pop();
    trail.forEach((s, i) => {
      const p = trailPts[i];
      if (!p || !flying) { s.material.opacity = Math.max(0, s.material.opacity - dt * 4); return; }
      s.position.copy(p);
      s.scale.setScalar(BALL_R * S.scale * (1.6 - i * 0.09));
      s.material.opacity = 0.32 * (1 - i / trail.length);
    });

    ball.position.copy(bp);
    // key light rides with the ball and follows the pointer: the highlight and crest glint move
    key.position.set(bp.x + 1 + S.pointerS.x * 2.6, bp.y + 2.2 - S.pointerS.y * 1.6, bp.z + 3.2);
    key.intensity = (4 + 22 * amb) * (1 - 0.3 * S.secret);
    ball.quaternion.copy(S.q);
    const sc = BALL_R * S.scale;
    ball.scale.set(sc * (1 + squash * 0.6), sc * (1 - squash), sc * (1 + squash * 0.6));

    const heightAbove = Math.max(0, bp.y - sc);
    shadowK = clamp(1 - heightAbove / 9, 0, 1);
    shadow.position.set(bp.x, 0.03, bp.z);
    shadow.scale.setScalar(sc * (2.6 + heightAbove * 0.4));
    shadow.material.opacity = 0.9 * shadowK * (0.3 + 0.7 * amb);

    S.haloPulse = Math.max(0, S.haloPulse - dt * 1.8);
    halo.position.set(hover.x, 0.05, hover.z);
    halo.scale.setScalar(S.scale * (1 + S.haloPulse * 0.4));
    halo.material.opacity = (sq ? 0 : (0.18 + 0.1 * Math.sin(t * 2)) * amb) + S.haloPulse * 0.6 + (S.loading ? 0.25 : 0);

    // intro: big spin settles
    if (!S.introDone) {
      if (t < INTRO) { if (!S.loading) S.angVel.y = lerp(13, 0, easeOut(intro)); }
      else { S.introDone = true; if (!S.loading) S.angVel.y = 0; }
    }

    applyCamera(camPos, camLook, fov);
    renderer.render(scene, camera);

    // --- performance watchdog (after the intro settles)
    if (t > INTRO + 0.3 && fps.checked < 2) {
      fps.n++;
      fps.time += Math.min(realDt, 0.5);
      if (fps.time >= 2) {
        const rate = fps.n / fps.time;
        fps.n = 0; fps.time = 0; fps.checked++;
        container.dataset.fps = rate.toFixed(0); // measured rate, handy when checking a device
        if (rate < 30 && dpr > 1) { dpr = 1; renderer.setPixelRatio(1); resize(); }
        else if (rate < 20) onDegrade?.('fps');
      }
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const realDt = last ? (now - last) / 1000 : 1 / 60;
    const dt = Math.min(0.1, realDt);
    last = now;
    step(dt, realDt);
  }
  function start() { if (!raf && !disposed) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  const onVis = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVis);
  const onLost = (e) => { e.preventDefault(); onDegrade?.('context'); };
  cv.addEventListener('webglcontextlost', onLost);
  if (!document.hidden) start();

  function runSeq(kind) {
    return new Promise((resolve) => {
      if (S.seq?.resolve && !S.seq.done) S.seq.resolve();
      if (t < INTRO) t = INTRO; // skip the rest of the intro
      S.loading = false;
      S.hoverY = 0; S.vy = 0;
      S.seq = { kind, t0: t, resolve, from: ball.position.clone() };
    });
  }

  return {
    setPointer(x, y) { S.pointer.set(clamp(x, -1, 1), clamp(y, -1, 1)); },
    setTarget(tg) { S.target = tg; },
    juggle() {
      if (S.seq) return;
      // one small hop per keystroke; fast typing keeps it up, never higher
      S.vy = Math.max(S.vy, S.hoverY > 0.25 ? 1.2 : 3.6);
      if (S.hoverY <= 0) S.hoverY = 0.001;
      S.angVel.x -= 3.5;
      S.haloPulse = 1;
    },
    setSecret(on) { S.secretT = on ? 1 : 0; },
    setLoading(on) { S.loading = !!on; if (on) S.haloPulse = 0.6; },
    goal() { return runSeq('goal'); },
    miss() { return runSeq('miss'); },
    dispose() {
      disposed = true;
      stop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      cv.removeEventListener('webglcontextlost', onLost);
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
          }
          m.dispose();
        }
      });
      [glowTex, streakTex, lampTex, netTex, ringTex, hazeTex, grass.tex, maps.map, maps.bump, maps.rough].forEach(x => x.dispose());
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
    },
  };
}
