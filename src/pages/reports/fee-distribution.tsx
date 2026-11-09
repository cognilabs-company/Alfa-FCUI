// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Stat } from '@/shared/ui/stat';
import { apiGetFeeDistribution, apiGetMonthlyLedger } from '@/shared/api';
import { fmt, fmtMoneyRoll, monthLabel } from '@/shared/lib/format';
import { useMoney } from '@/widgets/expenses';

const num = (v) => Number(v) || 0;
const amount = (v) => fmt.format(Math.round(num(v)));

/**
 * Reports → Kutilgan daromad (GET /reports/fee-distribution): where the
 * month's expected income comes from. Active students are counted by the
 * monthly fee in force that month, so every figure reads as "N students × fee",
 * overall and per group, and is checked against the Moliya figure.
 */
export function FeeDistributionTab({ period }) {
  const I = Icon;
  const { t, lang } = useT();
  const money = useMoney();
  // a range shows the month it ends in: a fee is a monthly thing
  const { year, month, isRange, version } = period;
  const [data, setData] = React.useState(null);
  const [ledger, setLedger] = React.useState(null);
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(() => new Set());

  React.useEffect(() => {
    let alive = true;
    setData(null);
    setLedger(null);
    setError('');
    setOpen(new Set());
    apiGetFeeDistribution({ year, month })
      .then(r => alive && setData(r?.data || {}))
      .catch(e => { if (alive) { setData({}); setError(e.message); } });
    // the Moliya figure for the same month, to show that both are one number
    apiGetMonthlyLedger({ year, month })
      .then(r => alive && setLedger(r?.data?.income || null))
      .catch(() => {});
    return () => { alive = false; };
  }, [year, month, version]);

  function toggle(id) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpen(next);
  }

  const monthName = `${monthLabel(month - 1, lang)} ${year}`;
  if (data === null) return <div className="empty loading" style={{ padding: 40 }}>{t('loading')}</div>;
  if (error) return <div className="alert danger"><I.AlertTriangle size={16}/> <span>{error}</span></div>;

  const sum = data.summary || {};
  const byFee = data.by_fee || [];
  const byGroup = data.by_group || [];
  const total = num(sum.total_mrr);
  const students = num(sum.active_students);
  const sentence = (n, fee) => t('fd_n_times_fee').replace('{n}', n).replace('{fee}', amount(fee));
  const feeRange = byFee.length === 0 ? '—'
    : byFee.length === 1 ? money(byFee[0].fee)
    : `${amount(byFee[0].fee)} – ${money(byFee[byFee.length - 1].fee)}`;

  return (
    <div className="fd">
      {isRange && (
        <div className="alert info" style={{ marginBottom: 14 }}>
          <I.Info size={16}/> <span>{t('fd_range_note').replace('{month}', monthName)}</span>
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Stat feature label={t('fd_expected')} icon={I.Receipt} value={total} format={fmtMoneyRoll} unit={t('currency')}
          sub={`${money(total)} · ${monthName}`}/>
        <Stat label={t('fd_students')} icon={I.Users} value={students}
          sub={t('fd_students_sub').replace('{month}', monthName)}/>
        <Stat label={t('fd_distinct')} icon={I.Coins} value={num(sum.distinct_fees)} sub={feeRange}/>
      </div>

      <LedgerCheck ledger={ledger} total={total} money={money} t={t}/>

      <div className="chart-card" style={{ marginBottom: 14 }}>
        <div className="chart-card-head">
          <div style={{ minWidth: 0 }}>
            <div className="ch-title">{t('fd_by_fee')}</div>
            <div className="ch-sub">{t('fd_by_fee_sub')}</div>
          </div>
          <div className="ch-right"><div className="ch-value">{money(total)}</div></div>
        </div>
        {byFee.length === 0 ? <div className="chart-empty">{t('fd_empty')}</div> : (
          <div className="fd-fees">
            {byFee.map(f => {
              const share = total > 0 ? num(f.subtotal) / total : 0;
              return (
                <div key={f.fee} className="fd-fee">
                  <div className="fd-eq">
                    <b className="money">{money(f.fee)}</b>
                    <span className="fd-op">×</span>
                    <span>{t('fd_students_n').replace('{n}', num(f.student_count))}</span>
                    <span className="fd-op">=</span>
                    <b className="money fd-sub">{money(f.subtotal)}</b>
                  </div>
                  <div className="fd-share">
                    <div className="bar-track"><i style={{ width: `${Math.max(share * 100, 1)}%` }}/></div>
                    <small>{Math.round(share * 100)}%</small>
                  </div>
                </div>
              );
            })}
            <div className="fd-total">
              <span>{t('fd_total')}: {t('fd_students_n').replace('{n}', students)}</span>
              <b className="money">{money(total)}</b>
            </div>
          </div>
        )}
      </div>

      <div className="chart-card">
        <div className="chart-card-head">
          <div style={{ minWidth: 0 }}>
            <div className="ch-title">{t('fd_by_group')}</div>
            <div className="ch-sub">{t('fd_by_group_sub')}</div>
          </div>
        </div>
        {byGroup.length === 0 ? <div className="chart-empty">{t('fd_empty')}</div> : (
          <div className="att-tree">
            {byGroup.map(g => {
              const id = g.group_id ?? 'none';
              const isOpen = open.has(id);
              const fees = g.fees || [];
              return (
                <div key={id} className={'att-group' + (isOpen ? ' open' : '')}>
                  <button type="button" className="att-row" aria-expanded={isOpen} onClick={() => toggle(id)}>
                    <I.ChevronRight size={15} className="att-caret"/>
                    <div className="att-main">
                      <b>{g.group_name || t('sp_no_group')}</b>
                      <small>{fees.map(f => sentence(num(f.student_count), f.fee)).join(' + ')}</small>
                    </div>
                    <div className="fd-group-total">
                      <b className="money">{money(g.total)}</b>
                      <small>{t('fd_students_n').replace('{n}', num(g.student_count))}</small>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="att-body">
                      {fees.map(f => (
                        <div key={f.fee} className="att-student fd-line">
                          <span className="name">{t('fd_students_n').replace('{n}', num(f.student_count))} × {money(f.fee)}</span>
                          <b className="money">{money(f.subtotal)}</b>
                        </div>
                      ))}
                      <div className="att-student fd-line fd-line-total">
                        <span className="name">{t('fd_total')}</span>
                        <b className="money">{money(g.total)}</b>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Says how this total is the "Kutilgan daromad" of Moliya: the same number, or
 * that number plus what students without a contract yet are expected to pay.
 * A difference is shown, not hidden.
 */
function LedgerCheck({ ledger, total, money, t }) {
  const I = Icon;
  if (!ledger) return null;
  const official = num(ledger.expected_official ?? ledger.expected);
  const pending = num(ledger.expected_pending);
  const shown = num(ledger.expected_total ?? ledger.expected);
  if (Math.round(official) !== Math.round(total)) {
    return (
      <div className="alert warning" style={{ marginBottom: 14 }}>
        <I.AlertTriangle size={16}/>
        <span>{t('fd_check_diff').replace('{ledger}', money(official)).replace('{here}', money(total)).replace('{diff}', money(Math.abs(official - total)))}</span>
      </div>
    );
  }
  return (
    <div className="alert success" style={{ marginBottom: 14 }}>
      <I.CheckCircle size={16}/>
      <span>
        {pending > 0
          ? t('fd_check_pending').replace('{ledger}', money(shown)).replace('{here}', money(total)).replace('{pending}', money(pending))
          : t('fd_check_ok').replace('{ledger}', money(shown))}
      </span>
    </div>
  );
}
