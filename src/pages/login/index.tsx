// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { AlphaWordmark, BrandMark } from '@/shared/ui/logo';
import { apiLogin } from '@/shared/api';
import { useT } from '@/shared/i18n/lang';
import { revealFrom } from '@/shared/lib/view-transition';
import { StadiumLite } from './stadium-lite';

/*
 * Login — "Tungi stadion" (night stadium).
 *
 * The form is plain HTML and works on its own. The stadium behind it is
 * decoration (aria-hidden) and is picked per device:
 *   webgl — desktop/tablet: three.js scene, loaded lazily after first paint
 *   lite  — phones, no WebGL, weak hardware or low FPS: CSS/SVG stadium
 *   still — prefers-reduced-motion: the lite picture with no motion
 * Every stage has the same small API (juggle, setSecret, setLoading, goal,
 * miss, setPointer, setTarget). Animations are fire-and-forget; the only
 * things that wait on them are capped by timeouts (goal ≤ 2.5 s before
 * onLogin, post hit ≤ 0.7 s before the error shows), and a click, Enter,
 * Esc or Space during the goal skips straight to the dashboard.
 */

const MOBILE_Q = '(max-width: 767.98px)';
const REDUCED_Q = '(prefers-reduced-motion: reduce)';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Resolves on the first click / tap / Enter / Esc / Space; `off()` removes the listeners. */
function skipSignal() {
  let off = () => {};
  const promise = new Promise((resolve) => {
    const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); resolve('skip'); } };
    const onPtr = () => resolve('skip');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPtr, true);
    off = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPtr, true); };
  });
  return { promise, off: () => off() };
}
const mq = (q) => typeof window !== 'undefined' && window.matchMedia?.(q).matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

function weakDevice() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  return cores <= 2 || mem <= 2;
}

export function LoginScreen({ onLogin }) {
  const I = Icon;
  const { t, lang, setLang } = useT();
  const [showPw, setShowPw] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const [compact, setCompact] = React.useState(() => mq(MOBILE_Q));
  const [reduced, setReduced] = React.useState(() => mq(REDUCED_Q));
  const [degraded, setDegraded] = React.useState(false);
  // Probe WebGL only where the 3D scene could actually be used.
  const webglOk = React.useMemo(() => !compact && !reduced && !weakDevice() && hasWebGL(), [compact, reduced]);
  const fx = reduced ? 'still' : (compact || degraded || !webglOk) ? 'lite' : 'webgl';

  const [sceneReady, setSceneReady] = React.useState(false);
  const [intro, setIntro] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const [tunnel, setTunnel] = React.useState(false);
  const [announce, setAnnounce] = React.useState('');

  const rootRef = React.useRef(null);
  const hostRef = React.useRef(null);
  const slotRef = React.useRef(null);
  const cardRef = React.useRef(null);
  const shakeRef = React.useRef(null);
  const crestRef = React.useRef(null);
  const liteRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const stage = () => (fx === 'webgl' ? sceneRef.current : liteRef.current);

  // Follow breakpoint / motion preference changes.
  React.useEffect(() => {
    const a = window.matchMedia(MOBILE_Q);
    const b = window.matchMedia(REDUCED_Q);
    const on = () => { setCompact(a.matches); setReduced(b.matches); };
    a.addEventListener?.('change', on);
    b.addEventListener?.('change', on);
    return () => { a.removeEventListener?.('change', on); b.removeEventListener?.('change', on); };
  }, []);

  // Where the ball should sit: the empty slot between headline and cards.
  const pushTarget = React.useCallback(() => {
    const root = rootRef.current;
    const slot = slotRef.current;
    if (!root || !slot) return;
    const r = slot.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0;
    const d = visible ? Math.max(90, Math.min(r.width * 0.6, r.height * 0.82, 230)) : 160;
    const x = visible ? r.left + r.width / 2 : window.innerWidth / 2;
    const y = visible ? r.top + r.height / 2 : window.innerHeight / 2;
    root.style.setProperty('--ball-x', `${x.toFixed(1)}px`);
    root.style.setProperty('--ball-y', `${y.toFixed(1)}px`);
    root.style.setProperty('--ball-d', `${d.toFixed(1)}px`);
    const art = cardRef.current?.parentElement?.parentElement?.getBoundingClientRect();
    root.style.setProperty('--art-w', `${(art && !compact ? art.left : window.innerWidth).toFixed(1)}px`);
    sceneRef.current?.setTarget(visible ? { x, y, d } : null);
  }, [compact]);

  React.useLayoutEffect(() => {
    pushTarget();
    const ro = new ResizeObserver(pushTarget);
    if (rootRef.current) ro.observe(rootRef.current);
    if (slotRef.current) ro.observe(slotRef.current);
    window.addEventListener('resize', pushTarget);
    return () => { ro.disconnect(); window.removeEventListener('resize', pushTarget); };
  }, [pushTarget]);

  // Lazy 3D: import after the form has painted; anything that goes wrong → lite.
  React.useEffect(() => {
    if (fx !== 'webgl') { setSceneReady(false); return; }
    let cancelled = false;
    let ctl = null;
    const go = () => import('./stadium-scene').then(({ createStadium }) => {
      if (cancelled || !hostRef.current) return;
      let crestSvg = '';
      const svg = crestRef.current?.querySelector('svg');
      if (svg) {
        const c = svg.cloneNode(true);
        c.setAttribute('width', '256');
        c.setAttribute('height', '256');
        c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        crestSvg = new XMLSerializer().serializeToString(c);
      }
      ctl = createStadium({
        container: hostRef.current,
        crestSvg,
        onIntro: () => mounted.current && setIntro(true),
        onFlash: () => mounted.current && setFlash(true),
        onTunnel: () => mounted.current && setTunnel(true),
        onDegrade: () => mounted.current && setDegraded(true),
      });
      sceneRef.current = ctl;
      pushTarget();
      setSceneReady(true);
    }).catch(() => { if (!cancelled) setDegraded(true); });
    let id2 = 0;
    const id = requestAnimationFrame(() => { id2 = window.setTimeout(go, 30); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      clearTimeout(id2);
      sceneRef.current = null;
      ctl?.dispose();
    };
  }, [fx, pushTarget]);

  // Headline rises with the intro; never waits longer than a beat.
  React.useEffect(() => {
    if (fx !== 'webgl') { setIntro(true); return; }
    const id = setTimeout(() => setIntro(true), 1400);
    return () => clearTimeout(id);
  }, [fx]);

  // Pointer: camera parallax + card tilt with an edge light sweep (mouse only).
  React.useEffect(() => {
    if (fx === 'still' || compact) return;
    let raf = 0;
    let ev = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const w = window.innerWidth, h = window.innerHeight;
      stage()?.setPointer((ev.clientX / w) * 2 - 1, (ev.clientY / h) * 2 - 1);
      const card = cardRef.current;
      if (card) {
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const nx = Math.max(-1, Math.min(1, (ev.clientX - cx) / (w / 2)));
        const ny = Math.max(-1, Math.min(1, (ev.clientY - cy) / (h / 2)));
        card.style.setProperty('--ry', `${(nx * 3.5).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${(-ny * 3.5).toFixed(2)}deg`);
        card.style.setProperty('--sweep', `${(Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90).toFixed(1)}deg`);
        card.style.setProperty('--gx', `${(((ev.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        card.style.setProperty('--gy', `${(((ev.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
        card.classList.add('is-lit');
      }
    };
    const onMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      ev = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => cardRef.current?.classList.remove('is-lit');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [fx, compact]);

  function shake() {
    if (fx === 'still') return;
    shakeRef.current?.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-12px)' }, { transform: 'translateX(10px)' },
      { transform: 'translateX(-8px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-2px)' },
      { transform: 'translateX(0)' },
    ], { duration: 480, easing: 'ease-out' });
  }

  async function submit(e) {
    e.preventDefault();
    if (loading || leaving) return;
    setError('');
    setLoading(true);
    stage()?.setLoading(true);
    try {
      await apiLogin(phone.trim(), pw);
      if (!mounted.current) return;
      stage()?.setLoading(false);
      setLeaving(true);
      setAnnounce(t('login_success'));
      const s = stage();
      if (s && fx !== 'still') {
        const skip = skipSignal();
        try { await Promise.race([s.goal(), wait(2500), skip.promise]); } finally { skip.off(); }
      }
      onLogin();
    } catch (err) {
      const msg = err.message || t('login_error_default');
      stage()?.setLoading(false);
      setLoading(false);
      const s = stage();
      if (s && fx !== 'still') await Promise.race([s.miss(), wait(700)]);
      if (!mounted.current) return;
      setError(msg);
      shake();
    }
  }

  function onPhone(e) {
    const v = e.target.value;
    if (v.length > phone.length) stage()?.juggle();
    setPhone(v);
  }

  const modules = [
    { icon: I.Users, label: t('nav_students'), desc: t('login_card_students_desc') },
    { icon: I.Calendar, label: t('nav_sessions'), desc: t('login_card_sessions_desc') },
    { icon: I.Trophy, label: t('nav_performance'), desc: t('login_card_performance_desc') },
    { icon: I.FileText, label: t('nav_contracts'), desc: t('login_card_contracts_desc') },
    { icon: I.Wallet, label: t('nav_transactions'), desc: t('login_card_transactions_desc') },
  ];

  const words = t('login_art_title').split(' ');
  const cls = [
    'auth3d',
    `fx-${fx}`,
    compact && 'is-compact',
    sceneReady && 'is-scene-ready',
    intro && 'is-intro',
    leaving && 'is-leaving',
    flash && 'is-flash',
    tunnel && 'is-tunnel',
    error && 'has-error',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={cls}>
      <div className="auth3d-stage" aria-hidden="true">
        {fx === 'webgl'
          ? <div ref={hostRef} className="auth3d-scene"/>
          : <StadiumLite ref={liteRef} variant={compact ? 'compact' : 'wide'} still={fx === 'still'}
              onFlash={() => setFlash(true)} onTunnel={() => setTunnel(true)}/>}
        <div className="auth3d-vignette"/>
      </div>

      <div className="auth3d-layout">
        <header className="auth3d-top" ref={crestRef}>
          <AlphaWordmark height={46} sub="Football Club"/>
        </header>

        <section className="auth3d-copy">
          <h2 className="auth3d-headline">
            {words.map((w, i) => (
              <React.Fragment key={i}>
                <span className={`w${i === words.length - 1 ? ' accent' : ''}`} style={{ '--i': i }}>{w}</span>{' '}
              </React.Fragment>
            ))}
          </h2>
          <p className="auth3d-lede">{t('login_hero_sub')}</p>
        </section>

        <div className="auth3d-slot" ref={slotRef} aria-hidden="true"/>

        <ul className="auth3d-cards" aria-label={t('login_cards_label')}>
          {modules.map((m, i) => (
            <li key={i} className="pcard" style={{ '--i': i }}>
              <div className="pcard-sway">
                <div className="pcard-inner">
                  <div className="pcard-face pcard-front">
                    <span className="pcard-no">{String(i + 1).padStart(2, '0')}</span>
                    <span className="pcard-icon"><m.icon size={22}/></span>
                    <b>{m.label}</b>
                  </div>
                  <div className="pcard-face pcard-back">
                    <b>{m.label}</b>
                    <p>{m.desc}</p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="auth3d-foot">© {new Date().getFullYear()} Alpha Football Club · CIMS</div>

        <main className="auth3d-panel">
          <div className="auth3d-shake" ref={shakeRef}>
            <div className="auth3d-card" ref={cardRef}>
              <form onSubmit={submit} className="auth-form" aria-busy={loading || leaving}>
                <div className="mobile-brand">
                  <BrandMark size={44}/>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>ALPHA FC</div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--muted)' }}>CIMS</div>
                  </div>
                </div>

                <div className="auth3d-lang">
                  <div className="seg" role="group" aria-label={t('lang_label')}>
                    {[['uz', 'UZ'], ['ru', 'RU']].map(([code, label]) => (
                      <button key={code} type="button" className={lang === code ? 'active' : ''}
                        onClick={(e) => { if (lang !== code) revealFrom(e, () => setLang(code)); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <h1 className="auth-title">{t('login_title')}</h1>
                <p className="auth-sub">{t('login_subtitle')}</p>

                <div className="field">
                  <label htmlFor="login-phone">{t('login_phone_label')}</label>
                  <div className="input-icon">
                    <span className="icon-l"><I.Phone size={16}/></span>
                    <input id="login-phone" autoComplete="username" value={phone} onChange={onPhone}
                      placeholder="+998 90 123 45 67" autoFocus aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'login-error' : undefined}/>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="login-password">{t('login_password_label')}</label>
                  <div className="input-icon">
                    <span className="icon-l"><I.Lock size={16}/></span>
                    <input id="login-password" autoComplete="current-password" type={showPw ? 'text' : 'password'}
                      value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" style={{ paddingRight: 44 }}
                      onFocus={() => stage()?.setSecret(true)} onBlur={() => stage()?.setSecret(false)}
                      aria-invalid={error ? true : undefined} aria-describedby={error ? 'login-error' : undefined}/>
                    <button type="button" className="input-trail" onClick={() => setShowPw(!showPw)} aria-label={showPw ? t('pwd_hide') : t('pwd_show')}>
                      {showPw ? <I.EyeOff size={16}/> : <I.Eye size={16}/>}
                    </button>
                  </div>
                </div>

                <div className="auth-row">
                  <label className="check-line">
                    <input type="checkbox" defaultChecked/> {t('login_remember')}
                  </label>
                </div>

                {error && (
                  <div className="alert danger auth3d-error" id="login-error" role="alert">
                    <I.AlertTriangle size={16}/> <span>{error}</span>
                  </div>
                )}

                <button className="btn primary lg block" type="submit" disabled={loading || leaving} aria-busy={loading || undefined}>
                  {loading ? t('login_checking') : t('login_btn')} {!loading && <I.ArrowRight size={17}/>}
                </button>
                <div className="sr-only" role="status" aria-live="polite">{announce}</div>
              </form>
            </div>
          </div>
        </main>
      </div>

      <div className="auth3d-fx" aria-hidden="true">
        <i className="fx-flash"/>
        <i className="fx-lines"/>
        <i className="fx-fill"/>
      </div>
    </div>
  );
}
