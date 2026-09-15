// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

/**
 * Shared modal. Centers on desktop, becomes a bottom sheet on phones
 * (styling in index.css: .modal-overlay / .modal / .modal-*).
 *
 * <Modal open={!!editing} onClose={...} title="..." size="lg"
 *        footer={<><button className="btn ghost">Cancel</button>...</>}>
 *   body
 * </Modal>
 */
export function Modal({ open = true, onClose, title, subtitle, size, footer, children, headerExtra }) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Portal to <body>: no page container (sticky toolbars, transformed/filtered
  // ancestors, table cells) can trap the overlay in a lower stacking context.
  return createPortal(
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'modal' + (size ? ' ' + size : '')} role="dialog" aria-modal="true">
        {(title || onClose) && (
          <div className="modal-header">
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              {title && <h3 className="modal-title">{title}</h3>}
              {subtitle && <div className="modal-sub">{subtitle}</div>}
            </div>
            {headerExtra}
            {onClose && (
              <button className="icon-btn plain modal-close" onClick={onClose} aria-label="Close">
                <Icon.X size={17} />
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

/** Label/value pairs laid out in an ordered grid. items: [{label, value}] */
export function DetailGrid({ items, cols }) {
  return (
    <div className={'detail-grid' + (cols === 3 ? ' cols-3' : '')}>
      {items.filter(Boolean).map((it, i) => (
        <div className="detail-item" key={i}>
          <div className="label">{it.label}</div>
          <div className="value">{it.value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}
