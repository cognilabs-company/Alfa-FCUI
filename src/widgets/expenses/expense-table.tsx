// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { menuPosition } from '@/shared/ui/pager';
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate } from '@/shared/lib/format';
import { CATEGORY_COLOR, categoryLabel, expenseStatus, expenseUnpaid, personName } from '@/shared/lib/expenses';
import { ExpenseStatusBadge, PeriodText, useMoney } from './parts';

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function ExpenseTable({ rows, loading, subject, canManage, selected, onSelectedChange, onRowClick, onPay, onView, viewLabel, onEdit, onDelete, emptyText, footer }) {
  const I = Icon;
  const { t } = useT();
  const money = useMoney();
  const [openMenuId, setOpenMenuId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const selectable = rows.filter(r => expenseStatus(r) !== 'paid');
  const allSelected = selectable.length > 0 && selectable.every(r => selected.has(r.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) selectable.forEach(r => next.delete(r.id));
    else selectable.forEach(r => next.add(r.id));
    onSelectedChange(next);
  };
  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedChange(next);
  };

  const cols = (canManage ? 1 : 0) + 6 + (canManage ? 1 : 0);

  return (
    <div className={'table-wrap' + (loading ? ' is-loading' : '')}>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {canManage && (
                <th style={{ width: 36, paddingRight: 0 }}>
                  <input type="checkbox" checked={allSelected} disabled={selectable.length === 0} onChange={toggleAll}/>
                </th>
              )}
              <th>{subject === 'person' ? t('exp_col_employee') : t('exp_col_name')}</th>
              <th>{t('exp_col_period')}</th>
              <th style={{ textAlign: 'right' }}>{t('exp_col_amount')}</th>
              <th style={{ textAlign: 'right' }}>{t('exp_col_paid')}</th>
              <th style={{ textAlign: 'right' }}>{t('exp_col_unpaid')}</th>
              <th>{t('exp_col_status')}</th>
              {canManage && <th style={{ width: 84 }}/>}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr className="static"><td colSpan={cols} className="empty-cell">{emptyText}</td></tr>
            )}
            {rows.map(r => {
              const status = expenseStatus(r);
              const left = expenseUnpaid(r);
              const person = personName(r);
              const cat = categoryLabel(t, r.category, r.category_label);
              const name = subject === 'person' ? (person || r.title || '—') : (r.title || person || cat);
              const sub = subject === 'person'
                ? [cat, r.title && person ? r.title : null].filter(Boolean).join(' · ')
                : [cat, r.kind === 'additional' ? t('exp_kind_additional') : null].filter(Boolean).join(' · ');
              const paidAmount = Number(r.paid_amount) || 0;
              return (
                <tr key={r.id} className={selected.has(r.id) ? 'selected' : undefined} onClick={() => onRowClick?.(r)} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                  {canManage && (
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} disabled={status === 'paid'} onChange={() => toggleOne(r.id)}/>
                    </td>
                  )}
                  <td>
                    <div className="row-name">
                      {subject === 'person'
                        ? <div className="avatar sm" style={{ background: avatarColor(r.coach_id || r.id) }}>{initials(name)}</div>
                        : <span className="cat-dot" style={{ background: CATEGORY_COLOR[r.category] || 'var(--viz-other)' }}/>}
                      <div className="meta">
                        <span className="name">{name}</span>
                        <span className="sub">{sub || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td><PeriodText year={r.period_year} month={r.period_month}/></td>
                  <td className="money" style={{ textAlign: 'right' }}>{money(r.amount)}</td>
                  <td className="money" style={{ textAlign: 'right' }}>
                    {paidAmount > 0
                      ? <div style={{ display: 'grid', justifyItems: 'inherit' }}>
                          <span style={{ color: 'var(--success)' }}>{money(paidAmount)}</span>
                          <small style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{fmtDate(r.paid_at)}</small>
                        </div>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td className="money" style={{ textAlign: 'right', color: left > 0 ? 'var(--danger)' : 'var(--muted)' }}>{left > 0 ? money(left) : '—'}</td>
                  <td><ExpenseStatusBadge status={status}/></td>
                  {canManage && (
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        {status !== 'paid' && (
                          <button className="icon-btn plain" aria-label={t('exp_pay')} title={t('exp_pay')} onClick={() => onPay(r)}>
                            <I.HandCoins size={16}/>
                          </button>
                        )}
                        <button className="icon-btn plain" aria-label={t('actions')} onClick={(e) => {
                          e.stopPropagation();
                          if (openMenuId === r.id) setOpenMenuId(null);
                          else { setMenuPos(menuPosition(e.currentTarget, onView ? 3 : 2)); setOpenMenuId(r.id); }
                        }}><I.More size={16}/></button>
                      </div>
                      {openMenuId === r.id && (
                        <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }} onClick={e => e.stopPropagation()}>
                          {onView && <button className="menu-item" onClick={() => { setOpenMenuId(null); onView(r); }}><I.Receipt size={14}/> {viewLabel}</button>}
                          <button className="menu-item" onClick={() => { setOpenMenuId(null); onEdit(r); }}><I.Edit size={14}/> {t('edit')}</button>
                          <button className="menu-item danger" onClick={() => { setOpenMenuId(null); onDelete(r); }}><I.Trash2 size={14}/> {t('delete')}</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
