// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { apiPayExpense } from '@/shared/api';
import { todayISO } from '@/shared/lib/format';
import { expenseStatus, expenseUnpaid, toPaidAt } from '@/shared/lib/expenses';
import { useMoney } from './parts';

export function BulkPayBar({ rows, selected, onClear, onDone }) {
  const I = Icon;
  const { t, tp } = useT();
  const money = useMoney();
  const [busy, setBusy] = React.useState(false);

  const picked = rows.filter(r => selected.has(r.id) && expenseStatus(r) !== 'paid');
  const total = picked.reduce((s, r) => s + expenseUnpaid(r), 0);
  if (selected.size === 0) return null;

  async function payAll() {
    const msg = t('exp_bulk_confirm').replace('{n}', String(picked.length)).replace('{amount}', money(total));
    if (!await confirmDialog(msg, { title: t('exp_bulk_title'), tone: 'primary', icon: I.HandCoins, confirmText: t('exp_pay_confirm') })) return;
    setBusy(true);
    const paidAt = toPaidAt(todayISO());
    let ok = 0;
    let failed = 0;
    for (const r of picked) {
      try {
        await apiPayExpense(r.id, { paid_at: paidAt, method: 'cash' });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (failed) notify.error(t('exp_bulk_failed').replace('{n}', String(failed)));
    onDone(ok ? t('exp_bulk_done').replace('{n}', String(ok)) : null);
  }

  return (
    <div className="bulk-bar">
      <b>{money(total)}</b>
      <span>{selected.size} {tp('exp_selected_sfx', selected.size)}</span>
      <div className="bulk-actions">
        <button className="btn sm" onClick={onClear} disabled={busy}><I.X size={14}/> {t('cancel')}</button>
        <button className="btn sm primary" onClick={payAll} disabled={busy || picked.length === 0}><I.HandCoins size={14}/> {busy ? t('saving') : t('exp_pay_confirm')}</button>
      </div>
    </div>
  );
}
