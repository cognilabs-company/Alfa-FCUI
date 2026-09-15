// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { AlphaWordmark, BrandMark } from '@/shared/ui/logo';
import { apiLogin } from '@/shared/api';
import { useT } from '@/shared/i18n/lang';
import { revealFrom } from '@/shared/lib/view-transition';

export function LoginScreen({ onLogin }) {
  const I = Icon;
  const { t, lang, setLang } = useT();
  const [showPw, setShowPw] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiLogin(phone.trim(), pw);
      onLogin();
    } catch (err) {
      setError(err.message || t('login_error_default'));
    } finally {
      setLoading(false);
    }
  }

  const modules = [
    { icon: I.Users, label: t('nav_students') },
    { icon: I.Calendar, label: t('nav_sessions') },
    { icon: I.Trophy, label: t('nav_performance') },
    { icon: I.FileText, label: t('nav_contracts') },
    { icon: I.Wallet, label: t('nav_transactions') },
  ];

  return (
    <div className="auth">
      <section className="auth-art" aria-hidden="true">
        <AlphaWordmark height={52} sub="Football Club"/>
        <div>
          <h2 className="auth-headline">{t('login_art_title')}</h2>
          <p className="auth-lede">{t('login_hero_sub')}</p>
          <div className="auth-modules">
            {modules.map(m => (
              <span key={m.label}><m.icon size={16}/> {m.label}</span>
            ))}
          </div>
        </div>
        <div className="auth-foot">© {new Date().getFullYear()} Alpha Football Club · CIMS</div>
      </section>

      <section className="auth-panel">
        <form onSubmit={submit} className="auth-form">
          <div className="mobile-brand">
            <BrandMark size={48}/>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>ALPHA FC</div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--muted)' }}>CIMS</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
            <div className="seg" role="group" aria-label="Language">
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
              <input id="login-phone" autoComplete="username" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+998 90 123 45 67" autoFocus/>
            </div>
          </div>
          <div className="field">
            <label htmlFor="login-password">{t('login_password_label')}</label>
            <div className="input-icon">
              <span className="icon-l"><I.Lock size={16}/></span>
              <input id="login-password" autoComplete="current-password" type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" style={{ paddingRight: 44 }}/>
              <button type="button" className="input-trail" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'}>
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
            <div className="alert danger" role="alert" style={{ marginBottom: 16 }}>
              <I.AlertTriangle size={16}/> <span>{error}</span>
            </div>
          )}

          <button className="btn primary lg block" type="submit" disabled={loading}>
            {loading ? t('login_checking') : t('login_btn')} {!loading && <I.ArrowRight size={17}/>}
          </button>
        </form>
      </section>
    </div>
  );
}
