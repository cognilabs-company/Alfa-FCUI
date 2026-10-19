// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { Badge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import {
  apiGetExpenseCategories, apiCreateExpenseCategory, apiUpdateExpenseCategory, apiDeleteExpenseCategory,
} from '@/shared/api';
import { CATEGORY_COLOR, EXPENSE_CATEGORIES, isSalaryCategory } from '@/shared/lib/expenses';

/** The categories as they were before the list was managed — for a server without /expense-categories. */
function builtIn(t) {
  return EXPENSE_CATEGORIES.map((key, i) => ({
    id: -1 - i, key, label: t(`exp_cat_${key}`), is_salary: isSalaryCategory(key),
    is_system: isSalaryCategory(key), is_active: true, sort_order: i, in_use: null,
  }));
}

/**
 * The admin-managed expense categories (FRONTEND_EXPENSE_CATEGORIES.md), inactive
 * ones included: old rows keep their category, so lists and filters still need
 * its name. `items` is null until loaded.
 */
export function useExpenseCategories() {
  const { t } = useT();
  const [items, setItems] = React.useState(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    apiGetExpenseCategories({ include_inactive: true })
      .then(res => alive && setItems(res?.data || []))
      .catch(() => alive && setItems(builtIn(t)));
    return () => { alive = false; };
  }, [reloadKey]);
  return { items, reload: () => setReloadKey(k => k + 1) };
}

/** Add, rename, reorder, switch off or delete categories. System ones can only be renamed. */
export function ExpenseCategoriesModal({ canManage, onClose, onChanged }) {
  const I = Icon;
  const { t } = useT();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [order, setOrder] = React.useState('');
  const [editing, setEditing] = React.useState(null); // { id, label, sort_order }
  const [busy, setBusy] = React.useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiGetExpenseCategories({ include_inactive: true });
      setItems(res?.data || []);
    } catch (e) {
      setError(e.status === 404 ? t('ps_unsupported') : e.message);
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => { load(); }, []);

  async function run(action, okText) {
    setBusy(true);
    try {
      await action();
      if (okText) notify.success(okText);
      await load();
      onChanged?.();
      return true;
    } catch (e) {
      notify.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const name = label.trim();
    if (!name) return;
    const body = { label: name };
    if (String(order).trim()) body.sort_order = Number(order);
    if (await run(() => apiCreateExpenseCategory(body), t('exp_catm_added'))) { setLabel(''); setOrder(''); }
  }

  async function saveEdit() {
    const name = editing.label.trim();
    if (!name) return;
    const body = { label: name };
    if (String(editing.sort_order).trim()) body.sort_order = Number(editing.sort_order);
    if (await run(() => apiUpdateExpenseCategory(editing.id, body), t('exp_catm_saved'))) setEditing(null);
  }

  async function remove(c) {
    if (!await confirmDialog(t('exp_catm_delete_confirm').replace('{name}', c.label))) return;
    run(() => apiDeleteExpenseCategory(c.id), t('exp_catm_deleted'));
  }

  return (
    <Modal icon={I.Stack} size="lg" onClose={onClose} title={t('exp_catm_title')} subtitle={t('exp_catm_sub')}>
      {canManage && !error && (
        <div className="form-row" style={{ marginBottom: 14, alignItems: 'end' }}>
          <div className="field"><label>{t('exp_catm_name')} <span className="req">*</span></label>
            <input value={label} onChange={e => setLabel(e.target.value)} maxLength={100} placeholder={t('exp_catm_name_ph')}
              onKeyDown={e => { if (e.key === 'Enter') add(); }}/>
          </div>
          <div className="field"><label>{t('exp_catm_order')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={order} onChange={e => setOrder(e.target.value)} placeholder="100" style={{ maxWidth: 110 }}/>
              <button className="btn primary" onClick={add} disabled={busy || !label.trim()}><I.Plus size={14}/> {t('exp_catm_add')}</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert danger" style={{ marginBottom: 12 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
      {loading && <div className="empty loading" style={{ padding: 20 }}>{t('loading')}</div>}

      {!loading && !error && (
        <div className="rate-list">
          {items.map(c => {
            const isEditing = editing?.id === c.id;
            // in use or built in: deleting would orphan rows or break salaries — switch it off instead
            const deletable = !c.is_system && c.in_use !== true;
            return (
              <div key={c.id} className={'rate-row' + (c.is_active ? '' : ' closed')}>
                <span className="cat-dot" style={{ background: CATEGORY_COLOR[c.key] || 'var(--viz-other)' }}/>
                <div className="rate-main">
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input className="input" value={editing.label} maxLength={100} autoFocus style={{ flex: '1 1 180px' }}
                        onChange={e => setEditing(d => ({ ...d, label: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}/>
                      <input className="input" type="number" value={editing.sort_order} style={{ width: 90 }} aria-label={t('exp_catm_order')}
                        onChange={e => setEditing(d => ({ ...d, sort_order: e.target.value }))}/>
                    </div>
                  ) : (
                    <>
                      <b>{c.label}</b>
                      <small>{c.key} · {t('exp_catm_order').toLowerCase()} {c.sort_order}{c.in_use ? ` · ${t('exp_catm_in_use')}` : ''}</small>
                    </>
                  )}
                </div>
                <div className="rate-amount" style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {c.is_system && <Badge tone="neutral" icon={I.Lock}>{t('exp_catm_system')}</Badge>}
                  {c.is_salary && <Badge tone="info" icon={I.Users}>{t('exp_catm_salary')}</Badge>}
                  {!c.is_active && <Badge tone="warning" icon={I.Pause}>{t('status_inactive')}</Badge>}
                </div>
                {canManage && (
                  <div className="rate-actions">
                    {isEditing ? (
                      <>
                        <button className="icon-btn plain" aria-label={t('save')} title={t('save')} onClick={saveEdit} disabled={busy}><I.Check size={15}/></button>
                        <button className="icon-btn plain" aria-label={t('cancel')} title={t('cancel')} onClick={() => setEditing(null)}><I.X size={15}/></button>
                      </>
                    ) : (
                      <>
                        <button className="icon-btn plain" aria-label={t('edit')} title={t('edit')} onClick={() => setEditing({ id: c.id, label: c.label, sort_order: String(c.sort_order ?? '') })}><I.Edit size={15}/></button>
                        {!c.is_system && (
                          <button className="icon-btn plain" disabled={busy}
                            aria-label={t(c.is_active ? 'exp_catm_deactivate' : 'exp_catm_activate')} title={t(c.is_active ? 'exp_catm_deactivate' : 'exp_catm_activate')}
                            onClick={() => run(() => apiUpdateExpenseCategory(c.id, { is_active: !c.is_active }), t('exp_catm_saved'))}>
                            {c.is_active ? <I.Pause size={15}/> : <I.CheckCircle size={15}/>}
                          </button>
                        )}
                        {deletable && <button className="icon-btn plain danger" aria-label={t('delete')} title={t('delete')} onClick={() => remove(c)} disabled={busy}><I.Trash2 size={15}/></button>}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && <div className="hint" style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{t('exp_catm_hint')}</div>}
    </Modal>
  );
}
