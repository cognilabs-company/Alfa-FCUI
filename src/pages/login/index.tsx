// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { AlphaShield } from '@/shared/ui/logo';
import { apiLogin } from '@/shared/api';
import { useT } from '@/shared/i18n/lang';
import { StadiumLite } from './stadium-lite';

/*
 * Login — one quiet card in front of a calm night stadium.
 *
 * The form is plain HTML and works on its own. The stadium behind it is
 * decoration (aria-hidden), picked per device:
 *   webgl — desktop/tablet: three.js scene, imported lazily after first paint
 *   lite  — phones, no WebGL, weak hardware or low FPS: CSS/SVG stadium
 *   still — prefers-reduced-motion: the lite picture with no motion, and
 *           success goes straight to the dashboard
 * At idle the crest ball only turns slowly on the centre spot. Loading spins
 * it; success plays the physics goal (card fades out as the ball is kicked,
 * capped at 2.4 s, click / Enter / Esc / Space skips); a wrong password hits
 * the post and the error shows within 0.5 s.
 */

const MOBILE_Q = '(max-width: 767.98px)';
const REDUCED_Q = '(prefers-reduced-motion: reduce)';
const GOAL_CAP_MS = 2400;
const MISS_CAP_MS = 480;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const mq = (q) => typeof window !== 'undefined' && window.matchMedia?.(q).matches;

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
  const [invalid, setInvalid] = React.useState({ phone: false, pw: false });

  const [compact, setCompact] = React.useState(() => mq(MOBILE_Q));
  const [reduced, setReduced] = React.useState(() => mq(REDUCED_Q));
  const [degraded, setDegraded] = React.useState(false);
  const webglOk = React.useMemo(() => !compact && !reduced && !weakDevice() && hasWebGL(), [compact, reduced]);
  const fx = reduced ? 'still' : (compact || degraded || !webglOk) ? 'lite' : 'webgl';

  const [sceneReady, setSceneReady] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [flash, setFlash] = React.useState(false);
  const [tunnel, setTunnel] = React.useState(false);

  const rootRef = React.useRef(null);
  const hostRef = React.useRef(null);
  const shakeRef = React.useRef(null);
  const crestRef = React.useRef(null);
  const liteRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const phoneRef = React.useRef(null);
  const pwRef = React.useRef(null);
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

  // Where the ball rests on screen: in the open space left of the card (desktop/tablet).
  const pushTarget = React.useCallback(() => {
    const root = rootRef.current;
    const card = shakeRef.current;
    if (!root || !card) return;
    const W = window.innerWidth, H = window.innerHeight;
    const left = compact ? W : card.getBoundingClientRect().left;
    const x = left / 2;
    const y = H * 0.56;
    const d = Math.max(96, Math.min(left * 0.3, H * 0.2, 180));
    root.style.setProperty('--ball-x', `${x.toFixed(1)}px`);
    root.style.setProperty('--ball-y', `${y.toFixed(1)}px`);
    root.style.setProperty('--ball-d', `${d.toFixed(1)}px`);
    root.style.setProperty('--art-w', `${left.toFixed(1)}px`);
    sceneRef.current?.setTarget(compact ? null : { x, y, d });
  }, [compact]);

  React.useLayoutEffect(() => {
    pushTarget();
    const ro = new ResizeObserver(pushTarget);
    if (rootRef.current) ro.observe(rootRef.current);
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

  function shake() {
    if (fx === 'still' || reduced) return;
    shakeRef.current?.animate?.([
      { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' },
      { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
    ], { duration: 300, easing: 'ease-out' });
  }

  async function submit(e) {
    e.preventDefault();
    if (loading || leaving) return;
    const emptyPhone = !phone.trim();
    const emptyPw = !pw;
    if (emptyPhone || emptyPw) {
      setInvalid({ phone: emptyPhone, pw: emptyPw });
      setError(t('toast_required'));
      (emptyPhone ? phoneRef : pwRef).current?.focus();
      return;
    }
    setInvalid({ phone: false, pw: false });
    setError('');
    setLoading(true);
    stage()?.setLoading(true);
    try {
      await apiLogin(phone.trim(), pw);
      if (!mounted.current) return;
      stage()?.setLoading(false);
      const s = stage();
      if (s && fx !== 'still') {
        setLeaving(true); // the card fades out as the ball is kicked
        const skip = skipSignal();
        try { await Promise.race([s.goal(), wait(GOAL_CAP_MS), skip.promise]); } finally { skip.off(); }
      }
      onLogin();
    } catch (err) {
      if (!mounted.current) return;
      const msg = err.message || t('login_error_default');
      const s = stage();
      s?.setLoading(false);
      setLoading(false);
      if (s && fx !== 'still') await Promise.race([s.miss(), wait(MISS_CAP_MS)]);
      if (!mounted.current) return;
      setInvalid({ phone: true, pw: true });
      setError(msg);
      shake();
    }
  }

  const errProps = (bad) => (bad && error
    ? { 'aria-invalid': true, 'aria-describedby': 'login-error' }
    : {});

  const cls = [
    'auth-min',
    `fx-${fx}`,
    sceneReady && 'is-scene-ready',
    leaving && 'is-leaving',
    flash && 'is-flash',
    tunnel && 'is-tunnel',
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

      <div className="auth-min-layout">
        <main className="auth-min-shake" ref={shakeRef}>
          <div className="auth-min-card">
            <div className="auth-min-lang" role="group" aria-label={t('lang_label')}>
              {[['uz', 'UZ'], ['ru', 'RU']].map(([code, label]) => (
                <button key={code} type="button" aria-pressed={lang === code}
                  className={lang === code ? 'active' : ''} onClick={() => setLang(code)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="auth-min-crest" ref={crestRef}><AlphaShield size={52}/></div>
            <h1 className="auth-min-title">{t('login_title')}</h1>

            <form onSubmit={submit} noValidate aria-busy={loading || leaving}>
              <div className="field">
                <label htmlFor="login-phone">{t('login_phone_label')}</label>
                <input id="login-phone" ref={phoneRef} autoComplete="username"
                  value={phone} onChange={e => { setPhone(e.target.value); if (invalid.phone) setInvalid(v => ({ ...v, phone: false })); }}
                  placeholder="+998 90 123 45 67" autoFocus {...errProps(invalid.phone)}/>
              </div>

              <div className="field">
                <label htmlFor="login-password">{t('login_password_label')}</label>
                <div className="input-icon auth-min-pw">
                  <input id="login-password" ref={pwRef} autoComplete="current-password"
                    type={showPw ? 'text' : 'password'} value={pw}
                    onChange={e => { setPw(e.target.value); if (invalid.pw) setInvalid(v => ({ ...v, pw: false })); }}
                    placeholder="••••••••" {...errProps(invalid.pw)}/>
                  <button type="button" className="input-trail" onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? t('pwd_hide') : t('pwd_show')} aria-pressed={showPw}>
                    {showPw ? <I.EyeOff size={17}/> : <I.Eye size={17}/>}
                  </button>
                </div>
              </div>

              <label className="check-line auth-min-remember">
                <input type="checkbox" defaultChecked/> {t('login_remember')}
              </label>

              <button className="btn primary lg block auth-min-btn" type="submit"
                disabled={loading || leaving} aria-busy={loading || undefined}>
                {loading && <span className="auth-min-spinner" aria-hidden="true"/>}
                {loading ? t('login_checking') : t('login_btn')}
              </button>

              <p className="auth-min-error" id="login-error" aria-live="assertive">{error}</p>
            </form>
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
