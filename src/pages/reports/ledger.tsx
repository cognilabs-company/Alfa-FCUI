// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Stat } from '@/shared/ui/stat';
import { apiGetFinanceReport, apiGetMonthlyLedger } from '@/shared/api';
import { fmt, fmtMoneyRoll, monthLabel, toLocalISO } from '@/shared/lib/format';
import { paymentSourceLabel } from '@/shared/lib/labels';
import { CATEGORY_COLOR, categoryLabel } from '@/shared/lib/expenses';
import { ExpenseStatusBadge, useMoney } from '@/widgets/expenses';
import { ChartCard } from './analytics';
import { MonthNav } from '@/shared/ui/month-nav';
import { useSelectedMonth } from '@/shared/lib/selected-month';

const num = (v) => Number(v) || 0;

/** A category or an employee is settled when nothing is left, untouched when nothing was paid. */
function settleStatus(paid, unpaid) {
  if (num(unpaid) <= 0) return 'paid';
  return num(paid) > 0 ? 'partial' : 'unpaid';
}

/**
 * Reports → Oylik daftar (GET /reports/monthly-ledger): one month of money in
 * one request — income, this month's expenses, what was carried over unpaid
 * from earlier months and why, salaries, and how the month closes.
 */
export function LedgerTab({ onNav }) {
  const I = Icon;
  const { t, lang } = useT();
  const money = useMoney();
  const period = useSelectedMonth();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [unsupported, setUnsupported] = React.useState(false);
  // The former "Moliya hisoboti" for the same month: cash actually received
  // by source, and the one debt figure every report agrees on.
  const [finance, setFinance] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setFinance(null);
    apiGetFinanceReport({
      from_date: toLocalISO(new Date(period.year, period.month - 1, 1)),
      to_date: toLocalISO(new Date(period.year, period.month, 0)),
    }).then(res => alive && setFinance(res?.data || null)).catch(() => {});
    return () => { alive = false; };
  }, [period.year, period.month, period.version]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    apiGetMonthlyLedger({ year: period.year, month: period.month })
      .then(res => { if (alive) { setData(res?.data || null); setUnsupported(false); } })
      .catch(e => {
        if (!alive) return;
        setData(null);
        if (e.status === 404) setUnsupported(true);
        else setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [period.year, period.month, period.version]);

  const periodName = `${monthLabel(period.month - 1, lang)} ${period.year}`;
  const signed = (v) => ({ color: num(v) < 0 ? 'var(--danger)' : num(v) > 0 ? 'var(--success)' : 'var(--muted)' });

  if (unsupported) {
    return (
      <div className="card empty" style={{ padding: 48, display: 'grid', gap: 10, placeItems: 'center' }}>
        <I.Wrench size={28} color="var(--muted)"/>
        <div style={{ fontWeight: 700 }}>{t('ps_unsupported')}</div>
      </div>
    );
  }

  const income = data?.income || {};
  const ex = data?.expenses_this_month || {};
  const carry = data?.carryover || {};
  const sal = data?.salaries || {};
  const tot = data?.totals || {};
  const pf = data?.profit || {};
  const received = finance ? num(finance.total_revenue) : null;
  // debt is the current month's only — earlier months are not carried — so it is shown for this month alone
  const showDebt = period.isCurrent && finance?.total_debt != null;
  // every figure here is for one month — the response names which
  const dataMonth = data?.period?.month ? `${monthLabel(num(data.period.month) - 1, lang)} ${data.period.year}` : periodName;

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <MonthNav period={period}/>
        <span className="toolbar-meta" style={{ fontWeight: 600 }}>{t('lg_sub')}</span>
      </div>

      {error && <div className="alert danger" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
      {loading && !data && <div className="empty loading" style={{ padding: 48 }}>{t('loading')}</div>}
      {!loading && !data && !error && <div className="card empty" style={{ padding: 48 }}>{t('pf_empty')}</div>}

      {data && (
        <>
          <div className={showDebt ? 'grid-4' : 'grid-3'} style={{ marginBottom: 14 }}>
            <Stat feature label={t('lg_income_expected')} icon={I.Receipt} value={num(income.expected)} format={fmtMoneyRoll} unit={t('currency')}
              sub={`${money(income.expected)} · ${dataMonth}`} title={t('lg_expected_tip')}>
              {/* the full monthly plan, before part-month joiners are prorated */}
              {income.mrr != null && <div className="stat-sub">{t('lg_mrr_line').replace('{amount}', money(income.mrr))}</div>}
            </Stat>
            <Stat label={t('pf_cash_collected')} tone="success" icon={I.HandCoins} value={received ?? '—'} format={fmtMoneyRoll} unit={received != null ? t('currency') : undefined}
              sub={received != null ? `${money(received)}${num(income.expected) > 0 ? ` · ${Math.round((received / num(income.expected)) * 100)}% ${t('lg_collected_share')}` : ''}` : null}/>
            {showDebt && (
              <Stat label={t('rpt_total_debt')} tone="danger" icon={I.AlertCircle} value={num(finance.total_debt)} format={fmtMoneyRoll} unit={t('currency')}
                sub={`${money(finance.total_debt)} · ${t('period_current_month')}`} onClick={onNav ? () => onNav('reports-debtors') : undefined}/>
            )}
            <Stat label={t('lg_net_cash')} tone={num(pf.net_cash) < 0 ? 'danger' : 'success'} icon={I.TrendingUp}
              value={num(pf.net_cash)} format={fmtMoneyRoll} unit={t('currency')} sub={`${money(pf.net_cash)} · ${t('lg_net_cash_sub')}`}/>
          </div>

          <div className="chart-grid-2" style={{ marginBottom: 14 }}>
            {(finance?.breakdown || []).length > 0 && (
              <ChartCard t={t} span title={t('lg_sources_title')} sub={dataMonth} value={money(received)}>
                <div className="table-scroll">
                  <table className="table compact-report-table">
                    <thead><tr><th>{t('rpt_source_col')}</th><th style={{ textAlign: 'right' }}>{t('rpt_sum_col')}</th><th style={{ textAlign: 'right' }}>{t('rpt_count_col')}</th></tr></thead>
                    <tbody>
                      {finance.breakdown.map((b, i) => (
                        <tr key={b.source || i} className="static">
                          <td><span className="chip">{paymentSourceLabel(b.source, t)}</span></td>
                          <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(b.total_amount)))}</td>
                          <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{num(b.transaction_count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            )}

            <ChartCard t={t} span title={t('lg_expenses_title')} sub={`${periodName} · ${t('lg_expenses_sub')}`}
              right={(
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <div className="ch-value">{money(ex.expected)}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className="chip">{t('lg_recurring')}: {money(ex.recurring_total)}</span>
                    <span className="chip">{t('lg_additional')}: {money(ex.additional_total)}</span>
                  </div>
                </div>
              )}>
              {(ex.by_category || []).length === 0
                ? <div className="chart-empty">{t('lg_expenses_empty')}</div>
                : (
                  <div className="table-scroll">
                    <table className="table compact-report-table">
                      <thead>
                        <tr>
                          <th>{t('exp_category')}</th>
                          <th style={{ textAlign: 'right' }}>{t('lg_planned')}</th>
                          <th style={{ textAlign: 'right' }}>{t('exp_totals_paid')}</th>
                          <th style={{ textAlign: 'right' }}>{t('exp_totals_unpaid')}</th>
                          <th>{t('students_col_status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ex.by_category.map(r => (
                          <tr key={r.category} className="static">
                            <td>
                              <div className="row-name">
                                <span className="cat-dot" style={{ background: CATEGORY_COLOR[r.category] || 'var(--viz-other)' }}/>
                                <div className="meta">
                                  <span className="name">{categoryLabel(t, r.category, r.label)}</span>
                                  <span className="sub">{r.count} {t('exp_records_short')}</span>
                                </div>
                              </div>
                            </td>
                            <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(r.expected)))}</td>
                            <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.format(Math.round(num(r.paid)))}</td>
                            <td className="money" style={{ textAlign: 'right', color: num(r.unpaid) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt.format(Math.round(num(r.unpaid)))}</td>
                            <td><ExpenseStatusBadge status={settleStatus(r.paid, r.unpaid)}/></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="static">
                          <td style={{ fontWeight: 800 }}>{t('total')}</td>
                          <td className="money" style={{ textAlign: 'right', fontWeight: 800 }}>{fmt.format(Math.round(num(ex.expected)))}</td>
                          <td className="money" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>{fmt.format(Math.round(num(ex.paid)))}</td>
                          <td className="money" style={{ textAlign: 'right', fontWeight: 800, color: num(ex.unpaid) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt.format(Math.round(num(ex.unpaid)))}</td>
                          <td/>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              {onNav && <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onNav('expenses')}>{t('nav_expenses')} <I.ArrowRight size={14}/></button>}
            </ChartCard>

            <div className={'chart-card carry-card' + (num(carry.total) > 0 ? ' has-debt' : '')}>
              <div className="chart-card-head">
                <div style={{ minWidth: 0 }}>
                  <div className="ch-title">{t('lg_carry_title')}</div>
                  <div className="ch-sub">{t('lg_carry_sub')}</div>
                </div>
                <div className="ch-right"><div className="ch-value" style={{ color: num(carry.total) > 0 ? 'var(--warning)' : undefined }}>{money(carry.total)}</div></div>
              </div>
              {(carry.items || []).length === 0 && num(carry.salary_unpaid_total) <= 0
                ? <div className="chart-empty"><I.CheckCircle size={16} color="var(--success)"/> {t('lg_carry_none')}</div>
                : (
                  <div>
                    {(carry.items || []).map((it, i) => (
                      <div key={it.expense_id ?? i} className="receipt-line carry-line">
                        <span className="rl-left rl-stack">
                          <span>{it.title || categoryLabel(t, it.category, it.category_label)}</span>
                          <small>{monthLabel(num(it.origin_month) - 1, lang)} {it.origin_year} · {categoryLabel(t, it.category, it.category_label)}</small>
                          {it.reason && <small className="carry-reason">{it.reason}</small>}
                        </span>
                        <span className="rl-right rl-stack" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <b style={{ color: 'var(--warning)' }}>{money(it.unpaid)}</b>
                          {num(it.paid) > 0 && <small>{t('lg_of')} {money(it.amount)}</small>}
                        </span>
                      </div>
                    ))}
                    {num(carry.salary_unpaid_total) > 0 && (
                      <div className="receipt-line carry-line">
                        <span className="rl-left rl-stack">
                          <span>{t('lg_carry_salaries')}</span>
                          <small>{t('lg_carry_salaries_sub')}</small>
                        </span>
                        <span className="rl-right"><b style={{ color: 'var(--warning)' }}>{money(carry.salary_unpaid_total)}</b></span>
                      </div>
                    )}
                  </div>
                )}
            </div>

            <div className="chart-card">
              <div className="chart-card-head">
                <div style={{ minWidth: 0 }}>
                  <div className="ch-title">{t('lg_close_title')}</div>
                  <div className="ch-sub">{periodName}</div>
                </div>
              </div>
              <div className="receipt" style={{ border: 0, padding: 0 }}>
                <div className="receipt-line"><span className="rl-muted">{t('lg_this_month_due')}</span><b>{money(tot.this_month_due)}</b></div>
                <div className="receipt-line"><span className="rl-muted">+ {t('lg_carry_title')}</span><b style={{ color: num(tot.carryover_total) > 0 ? 'var(--warning)' : undefined }}>{money(tot.carryover_total)}</b></div>
                <div className="receipt-line receipt-total"><span className="receipt-label">{t('lg_total_payable')}</span><b>{money(tot.total_payable)}</b></div>
                <div className="receipt-line"><span className="rl-muted">{t('exp_totals_paid')}</span><b style={{ color: 'var(--success)' }}>{money(tot.total_paid)}</b></div>
                <div className="receipt-line receipt-total">
                  <span className="receipt-label">{t('exp_totals_unpaid')}</span>
                  <b style={{ color: num(tot.total_remaining) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{money(tot.total_remaining)}</b>
                </div>
                <div className="receipt-tear"/>
                <div className="receipt-line"><span className="rl-muted">{t('lg_net_cash')}</span><b style={signed(pf.net_cash)}>{money(pf.net_cash)}</b></div>
                <div className="receipt-line"><span className="rl-muted">{t('lg_net_expected')}</span><b style={signed(pf.net_expected_this_month)}>{money(pf.net_expected_this_month)}</b></div>
                <div className="receipt-line"><span className="rl-muted">{t('lg_net_expected_carry')}</span><b style={signed(pf.net_expected_incl_carryover)}>{money(pf.net_expected_incl_carryover)}</b></div>
              </div>
            </div>

            <ChartCard t={t} span title={t('lg_salaries_title')}
              sub={`${periodName} · ${t('pf_pay_paid')}: ${money(sal.paid_this_month)} · ${t('pf_pay_remaining')}: ${money(sal.remaining_this_month)}`}
              value={money(sal.earned_this_month)}>
              {(sal.by_employee || []).length === 0
                ? <div className="chart-empty">{t('lg_salaries_empty')}</div>
                : (
                  <div className="table-scroll">
                    <table className="table compact-report-table">
                      <thead>
                        <tr>
                          <th>{t('lg_employee')}</th>
                          <th style={{ textAlign: 'right' }}>{t('pf_pay_earned')}</th>
                          <th style={{ textAlign: 'right' }}>{t('pf_pay_paid')}</th>
                          <th style={{ textAlign: 'right' }}>{t('pf_pay_remaining')}</th>
                          <th>{t('students_col_status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sal.by_employee.map(e => (
                          <tr key={e.user_id} className="static">
                            <td style={{ fontWeight: 750 }}>{e.name || `#${e.user_id}`}</td>
                            <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(e.earned)))}</td>
                            <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.format(Math.round(num(e.paid)))}</td>
                            <td className="money" style={{ textAlign: 'right', color: num(e.remaining) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt.format(Math.round(num(e.remaining)))}</td>
                            <td><ExpenseStatusBadge status={settleStatus(e.paid, e.remaining)}/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              {num(sal.carryover_prev_unpaid) > 0 && (
                <div className="alert warning" style={{ margin: 0 }}>
                  <I.Clock size={16}/> <span>{t('lg_salary_carry').replace('{amount}', money(sal.carryover_prev_unpaid))}</span>
                </div>
              )}
              {onNav && <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onNav('payroll')}>{t('nav_payroll')} <I.ArrowRight size={14}/></button>}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
