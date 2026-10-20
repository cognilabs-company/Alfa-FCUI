// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Columns, ChartLegend } from '@/shared/ui/charts';
import { apiGetProfitTrend } from '@/shared/api';
import { fmt, fmtMln, monthLabel, monthShort, toLocalISO } from '@/shared/lib/format';
import { ChartCard } from './analytics';

const num = (v) => Number(v) || 0;

/**
 * Reports → Analitika → month-by-month profit (GET /reports/profit-trend): what
 * each month was due to bring in against what it did, and what was left after
 * expenses and salaries. Net profit can fall below zero, which columns cannot
 * draw, so it rides in the tooltip and in the table under the chart. The range
 * is the Analytics one (3/6/12 months); `refresh` changes when it should reload.
 */
export function ProfitTrendCard({ months, refresh }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [unsupported, setUnsupported] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const now = new Date();
    const from = toLocalISO(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
    const to = toLocalISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    setLoading(true);
    setError('');
    apiGetProfitTrend({ from_date: from, to_date: to })
      .then(res => { if (alive) { setRows(Array.isArray(res?.data) ? res.data : []); setUnsupported(false); } })
      .catch(e => {
        if (!alive) return;
        setRows([]);
        if (e.status === 404) setUnsupported(true);
        else setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [months, refresh]);

  const money = (v, axis) => (axis ? fmtMln(v, lang) : `${fmt.format(Math.round(num(v)))} ${t('currency')}`);
  const series = [
    { id: 'expected', label: t('pt_expected'), color: 'var(--viz-dim)' },
    { id: 'collected', label: t('pt_collected'), color: 'var(--viz-accent)' },
  ];
  const name = (r, short) => (short ? monthShort(num(r.month) - 1, lang) : `${monthLabel(num(r.month) - 1, lang)} ${r.year}`);
  const netTotal = rows.reduce((s, r) => s + num(r.net_cash), 0);
  const signed = (v) => ({ color: num(v) < 0 ? 'var(--danger)' : num(v) > 0 ? 'var(--success)' : 'var(--muted)' });

  return (
    <ChartCard t={t} span title={t('pt_title')} sub={t('pt_sub')}
      right={rows.length > 0 ? <ChartLegend items={series} inline/> : null}>
      {unsupported && <div className="chart-empty"><I.Wrench size={16}/> {t('ps_unsupported')}</div>}
      {error && <div className="alert danger" style={{ margin: 0 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}
      {loading && rows.length === 0 && !unsupported && <div className="chart-empty">{t('loading')}</div>}
      {!loading && !unsupported && !error && rows.length === 0 && <div className="chart-empty">{t('an_no_data')}</div>}
      {rows.length > 0 && (
        <>
          <Columns
            data={rows.map(r => ({
              label: name(r, true), full: name(r),
              parts: { expected: num(r.expected_income), collected: num(r.collected_income) },
              sub: `${t('pt_net_cash')}: ${money(r.net_cash)}`,
            }))}
            series={series} grouped format={money} height={210}/>
          <div className="table-scroll">
            <table className="table compact-report-table">
              <thead>
                <tr>
                  <th>{t('rpt_month_col')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pt_expected')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pt_collected')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pt_expense_paid')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pt_salary_paid')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pt_net_cash')}</th>
                  <th style={{ textAlign: 'right' }}>{t('pt_net_expected')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.period} className="static">
                    <td style={{ fontWeight: 750 }}>{name(r)}</td>
                    <td className="money" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt.format(Math.round(num(r.expected_income)))}</td>
                    <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(r.collected_income)))}</td>
                    <td className="money" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt.format(Math.round(num(r.expense_paid)))}</td>
                    <td className="money" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt.format(Math.round(num(r.salary_paid)))}</td>
                    <td className="money" style={{ textAlign: 'right', fontWeight: 800, ...signed(r.net_cash) }}>{fmt.format(Math.round(num(r.net_cash)))}</td>
                    <td className="money" style={{ textAlign: 'right', ...signed(r.net_expected) }}>{fmt.format(Math.round(num(r.net_expected)))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="static">
                  <td style={{ fontWeight: 800 }}>{months} {tp('sp_months_sfx', months)}</td>
                  <td colSpan={4}/>
                  <td className="money" style={{ textAlign: 'right', fontWeight: 800, ...signed(netTotal) }}>{fmt.format(Math.round(netTotal))}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </ChartCard>
  );
}
