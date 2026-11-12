// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { AlphaShield } from '@/shared/ui/logo';
import { apiLogin } from '@/shared/api';
import { useT } from '@/shared/i18n/lang';

/*
 * Login — one quiet card on the brand green.
 * Motion is limited to a short fade-in, the button press, a spinner while
 * the request runs and a small shake on a wrong password. Success goes
 * straight to the dashboard. prefers-reduced-motion turns all of it off.
 */

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function LoginScreen({ onLogin }) {
  const I = Icon;
  const { t, lang, setLang } = useT();
  const [showPw, setShowPw] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [invalid, setInvalid] = React.useState({ phone: false, pw: false });

  const shakeRef = React.useRef(null);
  const phoneRef = React.useRef(null);
  const pwRef = React.useRef(null);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  function shake() {
    if (reducedMotion()) return;
    shakeRef.current?.animate?.([
      { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' },
      { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
    ], { duration: 300, easing: 'ease-out' });
  }

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
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
    try {
      await apiLogin(phone.trim(), pw);
      if (!mounted.current) return;
      onLogin();
    } catch (err) {
      if (!mounted.current) return;
      setLoading(false);
      setInvalid({ phone: true, pw: true });
      setError(err.message || t('login_error_default'));
      shake();
    }
  }

  const errProps = (bad) => (bad && error
    ? { 'aria-invalid': true, 'aria-describedby': 'login-error' }
    : {});

  return (
    <div className="auth-min">
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

          <div className="auth-min-crest"><AlphaShield size={52}/></div>
          <h1 className="auth-min-title">{t('login_title')}</h1>

          <form onSubmit={submit} noValidate aria-busy={loading}>
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
              disabled={loading} aria-busy={loading || undefined}>
              {loading && <span className="auth-min-spinner" aria-hidden="true"/>}
              {loading ? t('login_checking') : t('login_btn')}
            </button>

            <p className="auth-min-error" id="login-error" aria-live="assertive">{error}</p>
          </form>
        </div>
      </main>
    </div>
  );
}
