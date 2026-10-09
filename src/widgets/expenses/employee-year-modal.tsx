// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Modal } from '@/shared/ui/modal';
import { Badge } from '@/shared/ui/status';
import { apiGetExpenses } from '@/shared/api';
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate, fmtMln, monthLabel } from '@/shared/lib/format';
import { categoryLabel, expensePayments, expenseStatus, expenseUnpaid, methodLabel } from '@/shared/lib/expenses';
import { ActionTile, useMoney } from './parts';

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export function EmployeeYearModal({ seed, year, phone, canManage, reloadKey, onClose, onPay, onEdit }) {
  const I = Icon;
  const { t, lang } = useT();
  const money = useMoney();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const coachId = seed.coach_id;
  const name = seed.coach_name || seed.title || '—';

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    apiGetExpenses({ category: seed.category, coach_id: coachId, year, page: 1, page_size: 100 })
      .then(res => alive && setRows([...(res?.data || [])].sort((a, b) => a.period_month - b.period_month)))
      .catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [coachId, seed.category, year, reloadKey]);

  const totals = rows.reduce((acc, r) => {
    acc.payable += Number(r.amount) || 0;
    acc.paid += Number(r.paid_amount) || 0;
    return acc;
  }, { payable: 0, paid: 0 });
  const unpaid = Math.max(0, totals.payable - totals.paid);
  const outstanding = rows.filter(r => expenseStatus(r) !== 'paid');

  return (
    <Modal icon={I.HandCoins} size="md" onClose={onClose} title={name}
      subtitle={[categoryLabel(t, seed.category, seed.category_label), phone].filter(Boolean).join(' · ')}
      headerExtra={<div className="avatar" style={{ background: avatarColor(coachId || seed.id) }}>{initials(name)}</div>}>
      <div className="receipt">
        <div className="receipt-head">
          <span className="receipt-label">{t('pr_receipt')}</span>
          <span className="receipt-label">{year}</span>
        </div>
        {loading && <div className="empty loading" style={{ padding: 16 }}>{t('loading')}</div>}
        {!loading && error && <div className="alert danger"><I.AlertTriangle size={16}/> <span>{error}</span></div>}
        {!loading && !error && rows.length === 0 && <div className="empty" style={{ padding: 18 }}>{t('pr_no_records')}</div>}
        {!loading && rows.map(r => {
          const status = expenseStatus(r);
          const pays = expensePayments(r);
          const split = pays.length > 1;
          return (
            <div key={r.id}>
              <div className="receipt-line">
                <span className="rl-left">
                  <span>{monthLabel(r.period_month - 1, lang)}</span>
                  {r.paid_at && !split && <small>{fmtDate(r.paid_at)}</small>}
                </span>
                <span className="rl-right">
                  <b style={{ color: status === 'paid' ? 'var(--success)' : undefined }}>{money(r.amount)}</b>
                  {status !== 'paid' && (
                    <small style={{ color: 'var(--danger)' }}>
                      {status === 'partial' ? fmtMln(expenseUnpaid(r), lang) : t('exp_status_unpaid')}
                    </small>
                  )}
                </span>
              </div>
              {split && (
                <div className="receipt-sub">
                  {pays.map((p, i) => (
                    <div key={p.id ?? i} className="receipt-line">
                      <span className="rl-left"><small>{fmtDate(p.paid_at)}</small><small>{methodLabel(t, p.method)}</small></span>
                      <span className="rl-right"><small style={{ color: 'var(--success)' }}>{money(p.amount)}</small></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="receipt-tear"/>
        <div className="receipt-line"><span className="rl-muted">{t('exp_totals_payable')}</span><b>{money(totals.payable)}</b></div>
        <div className="receipt-line"><span className="rl-muted">{t('exp_totals_paid')}</span><b style={{ color: 'var(--success)' }}>{money(totals.paid)}</b></div>
        <div className="receipt-line receipt-total">
          <span className="receipt-label">{t('exp_totals_unpaid')}</span>
          <b style={{ color: unpaid > 0 ? 'var(--danger)' : 'var(--muted)' }}>{money(unpaid)}</b>
        </div>
      </div>

      {canManage && (
        <div className="action-list">
          <ActionTile primary icon={I.HandCoins} label={t('exp_pay_title')}
            hint={outstanding.length ? t('pr_outstanding_months').replace('{n}', String(outstanding.length)) : t('pr_all_settled')}
            disabled={!outstanding.length}
            onClick={() => onPay(seed)}/>
          <ActionTile icon={I.Edit} label={t('pr_change_amount')} hint={t('pr_change_amount_hint')}
            onClick={() => onEdit(outstanding[0] || rows[rows.length - 1] || seed)}/>
          {phone && <ActionTile icon={I.Phone} label={t('pr_call')} hint={phone} href={`tel:${phone}`}/>}
        </div>
      )}

      {!loading && rows.length > 0 && outstanding.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Badge tone="success" icon={I.CheckCircle}>{t('pr_all_settled')}</Badge>
        </div>
      )}
    </Modal>
  );
}
