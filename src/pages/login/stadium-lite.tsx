// @ts-nocheck
import React from 'react';
import { SoccerBall, QI, qAxis, qMul } from '@/widgets/layout/nav-ball';

/*
 * The lightweight stadium: CSS/SVG only, no WebGL.
 *
 *  - variant "compact": the phone version — one floodlight beam, a small
 *    goal at the top and the crest ball, form below.
 *  - variant "wide": the desktop fallback when WebGL is missing or the
 *    device is too weak — four floodlights, a perspective pitch, the goal
 *    on the horizon. No idle motion; only the short event animations.
 *  - still: prefers-reduced-motion — the same picture with no motion at all.
 *
 * Same imperative API as the 3D scene (juggle, setSecret, setLoading,
 * goal, miss, setPointer, setTarget), so the login screen doesn't care
 * which stage is mounted. Event animations use the Web Animations API.
 */

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

export const StadiumLite = React.forwardRef(function StadiumLite({ variant = 'wide', still = false, onFlash, onTunnel }, ref) {
  const rootRef = React.useRef(null);
  const ballRef = React.useRef(null);
  const spotRef = React.useRef(null);
  const goalRef = React.useRef(null);
  const netRef = React.useRef(null);
  const postRef = React.useRef(null);
  const drawRef = React.useRef(null);
  const st = React.useRef({ q: QI, w: 0, wT: 0, raf: 0, last: 0, busy: false });
  const [secret, setSecret] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

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

  React.useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  const flyTo = React.useCallback((toEl, kind) => {
    const ball = ballRef.current;
    if (!ball || !toEl) return null;
    const a = center(ball);
    const b = center(toEl);
    const dx = b.x - a.x, dy = b.y - a.y;
    const end = kind === 'goal' ? Math.max(0.28, (b.h * 0.42) / a.h) : Math.max(0.3, (b.w * 4) / a.w);
    const lift = Math.min(90, Math.abs(dy) * 0.5 + 30);
    return ball.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { offset: 0.5, transform: `translate(${dx * 0.42}px, ${dy * 0.62 - lift}px) scale(${(1 + end) / 2})` },
      { transform: `translate(${dx}px, ${dy}px) scale(${end})` },
    ], { duration: 460, easing: 'cubic-bezier(0.45, 0, 0.8, 0.6)', fill: 'forwards' });
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
      spotRef.current?.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.55, transform: 'scale(0.82)', offset: 0.45 }, { opacity: 1, transform: 'scale(1)' }], { duration: 380 });
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
      if (still) return;
      s.busy = true;
      s.w = 14; s.wT = 14; spin();
      const anim = flyTo(netRef.current, 'goal');
      await wait(460);
      goalRef.current?.classList.add('is-scored');
      onFlash?.();
      anim?.commitStyles?.();
      ballRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      await wait(200);
      onTunnel?.();
      await wait(640);
    },
    async miss() {
      const s = st.current;
      setLoading(false);
      if (still) { s.wT = 0; return; }
      s.busy = true;
      s.w = 12; s.wT = 12; spin();
      const anim = flyTo(postRef.current, 'post');
      await wait(460);
      postRef.current?.classList.remove('is-hit');
      void postRef.current?.getBoundingClientRect();
      postRef.current?.classList.add('is-hit');
      s.wT = -6;
      // back home with one bounce
      const ball = ballRef.current;
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
  }), [still, spin, flyTo, onFlash, onTunnel]);

  const floods = variant === 'compact' ? [0, 1] : [0, 1, 2, 3];
  return (
    <div ref={rootRef} className={`sl sl-${variant}${still ? ' is-still' : ''}${secret ? ' is-secret' : ''}${loading ? ' is-loading' : ''}`} aria-hidden="true">
      <div className="sl-sky"/>
      <div className="sl-stand"/>
      <div className="sl-lights">
        {floods.map(i => (
          <span key={i} className="sl-flood" style={{ '--i': i }}><i className="sl-beam"/></span>
        ))}
      </div>
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
      <div ref={goalRef} className="sl-goal">
        <svg viewBox="0 0 120 46" fill="none">
          <g ref={netRef} className="sl-net" stroke="rgba(230,240,232,0.42)" strokeWidth="0.8">
            {Array.from({ length: 13 }, (_, i) => <line key={'v' + i} x1={12 + i * 8} y1="6" x2={12 + i * 8} y2="42"/>)}
            {Array.from({ length: 5 }, (_, i) => <line key={'h' + i} x1="12" y1={6 + i * 9} x2="108" y2={6 + i * 9}/>)}
          </g>
          <path d="M6 44 V3 H114 V44" stroke="#F5F7F2" strokeWidth="3" strokeLinejoin="round"/>
          <rect ref={postRef} className="sl-post" x="4.5" y="3" width="3" height="41" fill="#F5F7F2"/>
        </svg>
      </div>
      <div className="sl-ball-spot">
        <span ref={spotRef} className="sl-shadow"/>
        <span className="sl-halo"/>
        <div ref={ballRef} className="sl-ball">
          <SoccerBall size={160} drawRef={drawRef}/>
        </div>
      </div>
    </div>
  );
});
