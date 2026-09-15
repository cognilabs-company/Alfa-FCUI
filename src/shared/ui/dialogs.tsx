// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { useT } from '@/shared/i18n/lang';

/*
 * Replacements for window.confirm / window.alert that match the app design.
 *
 *   if (!await confirmDialog(t('delete') + '?')) return;
 *   notify.error(e.message);
 *
 * <DialogHost/> (mounted once in App) renders the confirm sheet; toasts are
 * forwarded to App's toast via a window event.
 */

let pushConfirm = null;

export function confirmDialog(message, opts = {}) {
  if (!pushConfirm) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => pushConfirm({ message, ...opts, resolve }));
}

function emitToast(message, type) {
  window.dispatchEvent(new CustomEvent('alpha:toast', { detail: { message: String(message ?? ''), type } }));
}

export const notify = {
  success: (message) => emitToast(message, 'success'),
  error: (message) => emitToast(message, 'error'),
};

export function DialogHost() {
  const { t } = useT();
  const [req, setReq] = React.useState(null);
  const reqRef = React.useRef(null);
  const confirmRef = React.useRef(null);

  React.useEffect(() => {
    pushConfirm = (r) => {
      reqRef.current?.resolve(false); // a newer request cancels an unanswered one
      reqRef.current = r;
      setReq(r);
    };
    return () => { pushConfirm = null; };
  }, []);

  const close = React.useCallback((result) => {
    const r = reqRef.current;
    reqRef.current = null;
    setReq(null);
    r?.resolve(result);
  }, []);

  React.useEffect(() => {
    if (!req) return;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [req, close]);

  if (!req) return null;
  const tone = req.tone || 'danger';
  const Ic = req.icon || (tone === 'danger' ? Icon.Trash : Icon.Question);

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div className={'modal sm confirm-dialog ' + tone} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="confirm-body">
          <span className="confirm-icon"><Ic size={30} weight="duotone"/></span>
          <h3 id="confirm-title" className="modal-title">{req.title || t('confirm_title')}</h3>
          <p className="confirm-text">{req.message}</p>
        </div>
        <div className="confirm-actions">
          <button className="btn lg" onClick={() => close(false)}>{req.cancelText || t('cancel')}</button>
          <button ref={confirmRef} className={'btn lg ' + (tone === 'danger' ? 'danger' : 'primary')} onClick={() => close(true)}>
            {req.confirmText || t('confirm_yes')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
