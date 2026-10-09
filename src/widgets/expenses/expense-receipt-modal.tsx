// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { Badge } from '@/shared/ui/status';
import { fmtDate, monthLabel } from '@/shared/lib/format';
import { categoryLabel, expensePayments, expenseStatus, expenseUnpaid, hasPaymentHistory, methodLabel, personName } from '@/shared/lib/expenses';
import { ActionTile, ExpenseStatusBadge, useMoney } from './parts';

export function ExpenseReceiptModal({ expense, canManage, onClose, onPay, onEdit }) {
  const I = Icon;
  const { t, lang } = useT();
  const money = useMoney();

  const status = expenseStatus(expense);
  const unpaid = expenseUnpaid(expense);
  const pays = expensePayments(expense);
  const authoritative = hasPaymentHistory(expense);
  const person = personName(expense);
  const cat = categoryLabel(t, expense.category, expense.category_label);
  const name = expense.title || person || cat;

  return (
    <Modal icon={I.Receipt} size="md" onClose={onClose} title={name}
      subtitle={[cat, person && person !== name ? person : null].filter(Boolean).join(' · ')}
      headerExtra={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {expense.kind === 'additional' && <Badge tone="warning" icon={I.Sparkle}>{t('exp_kind_additional')}</Badge>}
        <ExpenseStatusBadge status={status}/>
      </div>}>
      <div className="receipt">
        <div className="receipt-head">
          <span className="receipt-label">{t('exp_receipt')}</span>
          <span className="receipt-label">{monthLabel(expense.period_month - 1, lang)} {expense.period_year}</span>
        </div>
        <div className="receipt-line"><span>{t('exp_totals_payable')}</span><b>{money(expense.amount)}</b></div>
        <div className="receipt-tear"/>
        <div className="receipt-head" style={{ marginBottom: 4 }}>
          <span className="receipt-label">{t('exp_instalments')}</span>
          {pays.length > 0 && <span className="receipt-label">{pays.length}</span>}
        </div>
        {pays.length === 0 && <div className="empty" style={{ padding: 14 }}>{t('exp_no_payments')}</div>}
        {pays.map((p, i) => (
          <div key={p.id ?? i} className="receipt-line">
            <span className="rl-left rl-stack">
              <span>
                <span className="rl-num">{String(i + 1).padStart(2, '0')}</span> {fmtDate(p.paid_at)}
                <small style={{ marginLeft: 8 }}>{methodLabel(t, p.method)}</small>
              </span>
              {p.paid_by_name && <small>{t('exp_paid_by').replace('{name}', p.paid_by_name)}</small>}
              {p.note && <small>{p.note}</small>}
            </span>
            <span className="rl-right"><b style={{ color: 'var(--success)' }}>{money(p.amount)}</b></span>
          </div>
        ))}
        {!authoritative && Number(expense.paid_amount) > 0 && (
          <div className="hint" style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 600, marginTop: 6 }}>{t('exp_history_missing')}</div>
        )}
        <div className="receipt-tear"/>
        <div className="receipt-line"><span className="rl-muted">{t('exp_totals_paid')}</span><b style={{ color: 'var(--success)' }}>{money(expense.paid_amount)}</b></div>
        <div className="receipt-line receipt-total">
          <span className="receipt-label">{t('exp_totals_unpaid')}</span>
          <b style={{ color: unpaid > 0 ? 'var(--danger)' : 'var(--muted)' }}>{money(unpaid)}</b>
        </div>
        {(expense.note || expense.created_by_name) && (
          <div className="receipt-meta">
            {expense.note && <div>{expense.note}</div>}
            {expense.created_by_name && <div>{t('exp_created_by').replace('{name}', expense.created_by_name)}</div>}
          </div>
        )}
      </div>

      {canManage && (
        <div className="action-list">
          {status !== 'paid' && (
            <ActionTile primary icon={I.HandCoins} label={t('exp_pay_title')} hint={`${t('exp_outstanding')}: ${money(unpaid)}`} onClick={() => onPay(expense)}/>
          )}
          <ActionTile icon={I.Edit} label={t('exp_edit')} onClick={() => onEdit(expense)}/>
        </div>
      )}
    </Modal>
  );
}
