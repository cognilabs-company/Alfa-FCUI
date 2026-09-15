// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

/**
 * Shared modal. Dark "floodlight" header with an icon tile, light body,
 * sticky footer. Centers on desktop, becomes a bottom sheet on phones.
 *
 * <Modal open={!!editing} onClose={...} title="..." icon={Icon.Edit} size="lg"
 *        tone="danger" footer={<>...</>}>
 *   body
 * </Modal>
 */
export function Modal({ open = true, onClose, title, subtitle, size, footer, children, headerExtra, icon, tone }) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const Ic = icon || Icon.Sparkle;

  // Portal to <body>: no page container (sticky toolbars, transformed/filtered
  // ancestors, table cells) can trap the overlay in a lower stacking context.
  return createPortal(
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'modal' + (size ? ' ' + size : '') + (tone ? ' tone-' + tone : '')} role="dialog" aria-modal="true">
        {(title || onClose) && (
          <div className="modal-header">
            <span className="modal-icon" aria-hidden="true"><Ic size={22} weight="duotone"/></span>
            <div className="modal-heading">
              {title && <h3 className="modal-title">{title}</h3>}
              {subtitle && <div className="modal-sub">{subtitle}</div>}
            </div>
            {headerExtra && <div className="modal-extra">{headerExtra}</div>}
            {onClose && (
              <button className="modal-close" onClick={onClose} aria-label="Close">
                <Icon.X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Label/value pairs laid out in an ordered grid. items: [{label, value, icon}] */
export function DetailGrid({ items, cols }) {
  return (
    <div className={'detail-grid' + (cols === 3 ? ' cols-3' : '')}>
      {items.filter(Boolean).map((it, i) => (
        <div className="detail-item" key={i}>
          <div className="label">{it.icon && <it.icon size={13}/>}{it.label}</div>
          <div className="value">{it.value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}
