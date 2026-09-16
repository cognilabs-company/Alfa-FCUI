// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Stat } from '@/shared/ui/stat';
import { Columns, Trend, BarList, Donut, Meter, ChartLegend } from '@/shared/ui/charts';
import { loadAnalytics } from '@/shared/api';
import { fmt, fmtMln, fmtMoneyRoll, monthShort, toLocalISO, todayISO } from '@/shared/lib/format';
import {
  monthsBack, daysBack, dayKey, revenueSeries, sourceTotals, sourceTotalsFromSeries, paidTotal,
  payingStudents, debtAging, debtTotal, debtByGroup, ageBuckets, studentGrowth, sessionsPerPeriod,
  seriesFromDynamics, agingFromApi, rateToPercent, periodDate, delta, isPaid,
} from '@/shared/lib/analytics';

const SOURCE_COLOR = {
  payme: 'var(--viz-payme)', click: 'var(--viz-click)', cash: 'var(--viz-cash)',
  bank: 'var(--viz-bank)', other: 'var(--viz-other)',
};
const RANGES = [3, 6, 12];

function Delta({ value, t }) {
  if (value == null || !isFinite(value)) return null;
  const dir = value > 0.5 ? 'up' : value < -0.5 ? 'down' : 'flat';
  const I = Icon;
  return (
    <div className={'chart-delta ' + dir}>
      {dir === 'up' && <I.TrendUp size={13}/>}
      {dir === 'down' && <I.TrendDown size={13}/>}
      {dir !== 'flat' ? `${value > 0 ? '+' : ''}${Math.round(value)}%` : '±0%'}
      <span style={{ color: 'var(--muted)', fontWeight: 650 }}>{t('an_vs_prev')}</span>
    </div>
  );
}

function ChartCard({ title, sub, value, delta: d, span, children, right, t }) {
  return (
    <div className={'chart-card' + (span ? ' span-2' : '')}>
      <div className="chart-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="ch-title">{title}</div>
          {sub && <div className="ch-sub">{sub}</div>}
        </div>
        {(value != null || right) && (
          <div className="ch-right">
            {value != null && <div className="ch-value">{value}</div>}
            {d != null ? <Delta value={d} t={t}/> : right}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** Reports → Analytics: the club's money, debt, roster and attendance over time. */
export function AnalyticsTab({ onNav }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const [months, setMonths] = React.useState(6);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const periods = React.useMemo(() => monthsBack(months), [months]);
  const fromDate = React.useMemo(() => toLocalISO(periods[0].date), [periods]);
  // One extra range back so this period can be compared with the previous one.
  const prevPeriods = React.useMemo(() => monthsBack(months * 2).slice(0, months), [months]);
  const loadFrom = React.useMemo(() => toLocalISO(prevPeriods[0].date), [prevPeriods]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    loadAnalytics({ fromDate: loadFrom, toDate: todayISO(), months })
      .then(res => { if (alive) setData(res); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadFrom, months]);

  const money = (v, axis) => (axis ? fmtMln(v, lang) : `${fmt.format(Math.round(v))} ${t('currency')}`);
  const count = (v) => fmt.format(Math.round(v));
  const pct = (v) => `${Math.round(v)}%`;
  const monthLabelOf = (date) => monthShort(date.getMonth(), lang);
  const monthFull = (date) => `${monthShort(date.getMonth(), lang)} ${date.getFullYear()}`;
  const inRangeKey = (p) => p.key >= String(fromDate).slice(0, 7);

  // ── Revenue: the aggregate endpoint when the server has it ───────────────
  const tx = data?.transactions || [];
  const allRevenue = React.useMemo(() => (
    data?.revenueSeries ? seriesFromDynamics(data.revenueSeries) : revenueSeries(tx, monthsBack(months * 2))
  ), [data, tx, months]);
  const revenue = React.useMemo(() => allRevenue.filter(inRangeKey), [allRevenue, fromDate]);
  const previous = React.useMemo(() => allRevenue.filter(p => !inRangeKey(p)), [allRevenue, fromDate]);
  const revenueTotal = revenue.reduce((s, p) => s + p.value, 0);
  const revenueDelta = delta(revenueTotal, previous.reduce((s, p) => s + p.value, 0));
  const paidCount = revenue.reduce((s, p) => s + p.count, 0);

  const sources = React.useMemo(() => (
    data?.revenueSeries ? sourceTotalsFromSeries(revenue) : sourceTotals(tx.filter(x => {
      const d = x.paid_at || x.created_at;
      return d && toLocalISO(new Date(d)) >= fromDate;
    }))
  ), [data, revenue, tx, fromDate]);
  const sourceItems = Object.entries(sources)
    .filter(([, v]) => v.amount > 0)
    .map(([id, v]) => ({
      id,
      label: id === 'other' ? t('dash_other') : id === 'cash' ? t('tx_src_cash') : id === 'bank' ? t('tx_src_bank') : id === 'payme' ? 'Payme' : 'Click',
      value: v.amount,
      color: SOURCE_COLOR[id],
    }));
  const stackSeries = sourceItems.map(s => ({ id: s.id, label: s.label, color: s.color }));

  const daily = React.useMemo(() => (
    data?.dailySeries
      ? seriesFromDynamics(data.dailySeries).slice(-30)
      : revenueSeries(tx, daysBack(30), dayKey)
  ), [data, tx]);
  const daily30 = daily.reduce((s, d) => s + d.value, 0);

  // ── Headline numbers ─────────────────────────────────────────────────────
  const k = data?.kpis || null;
  const debtors = data?.debtors || [];
  const aging = k || data?.debtAging ? agingFromApi(data?.debtAging?.buckets) : debtAging(debtors);
  const totalDebt = Number(data?.debtAging?.total_debt ?? k?.total_debt) || debtTotal(debtors);
  const debtorsCount = Number(k?.debtors_count) || (data?.debtAging?.top_debtors ? null : debtors.length) || debtors.length;
  const mrr = Number(k?.mrr ?? data?.contractStats?.total_monthly_fee) || 0;
  const thisMonth = Number(k?.collected_this_month) || (revenue[revenue.length - 1]?.value || 0);
  const activeStudents = Number(k?.active_students ?? data?.summary?.active_students)
    || (data?.students || []).filter(s => String(s.status).toLowerCase() === 'active').length;
  const arpu = Number(k?.arpu) || (activeStudents ? revenueTotal / months / activeStudents : 0);
  const avgCheck = Number(k?.avg_payment) || (paidCount ? revenueTotal / paidCount : 0);
  const payers = Number(k?.paying_students) || payingStudents(tx.filter(x => isPaid(x)));

  const topDebtors = data?.debtAging?.top_debtors
    || [...debtors].sort((a, b) => (Number(b.debt_amount) || 0) - (Number(a.debt_amount) || 0)).slice(0, 8);
  const byGroupDebt = data?.debtAging?.by_group
    ? data.debtAging.by_group.map(g => ({ label: g.group_name || '—', value: Number(g.amount) || 0 })).sort((a, b) => b.value - a.value).slice(0, 8)
    : debtByGroup(debtors);

  // ── Roster, attendance, schedule ─────────────────────────────────────────
  const students = data?.students || [];
  const growth = React.useMemo(() => (
    data?.studentsDynamics
      ? data.studentsDynamics.map(r => ({
        key: r.period, date: periodDate(r.period), value: Number(r.joined) || 0,
        left: Number(r.left) || 0, total: Number(r.active_at_end) || 0,
      })).filter(inRangeKey)
      : studentGrowth(students, periods)
  ), [data, students, periods, fromDate]);
  const hasChurn = !!data?.studentsDynamics;
  const ages = React.useMemo(() => ageBuckets(students), [students]);
  const groups = data?.groups || [];
  const attendance = data?.attendanceGroups || [];
  const attendanceTrend = React.useMemo(() => (data?.attendanceDynamics || []).map(r => ({
    key: r.period,
    date: periodDate(r.period),
    value: rateToPercent(r.attendance_rate),
    sessions: Number(r.sessions) || 0,
  })), [data]);
  const sessionSeries = React.useMemo(() => sessionsPerPeriod(data?.sessions || [], periods), [data, periods]);
  const plan = React.useMemo(() => (data?.expectedVsCollected || []).map(r => ({
    key: r.period,
    date: periodDate(r.period),
    parts: { expected: Number(r.expected) || 0, collected: Number(r.collected) || 0 },
    rate: rateToPercent(r.collection_rate),
  })).filter(inRangeKey), [data, fromDate]);
  const planSeries = [
    { id: 'expected', label: t('an_expected'), color: 'var(--viz-dim)' },
    { id: 'collected', label: t('an_collected'), color: 'var(--viz-accent)' },
  ];

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;

  const notes = [];
  if (data?.missing?.length) notes.push(t('an_partial'));
  if (data?.transactionsTruncated) notes.push(t('an_truncated'));

  return (
    <div>
      <div className="table-toolbar" style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <I.Activity size={17}/> {t('an_period')}
        </span>
        <div className="pill-row">
          {RANGES.map(m => (
            <button key={m} type="button" className={'pill' + (months === m ? ' active' : '')} onClick={() => setMonths(m)}>
              {m} {t('contract_months_sfx')}
            </button>
          ))}
        </div>
        <span className="toolbar-meta" style={{ fontWeight: 600 }}>{t('an_source_hint')}</span>
      </div>

      {notes.length > 0 && (
        <div className="alert warning" style={{ marginBottom: 14 }}>
          <I.AlertTriangle size={16}/> <span>{notes.join(' · ')}</span>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <Stat feature label={t('an_mrr')} value={mrr} format={fmtMoneyRoll} unit={t('currency')} icon={I.Money} sub={t('an_mrr_sub')}/>
        <Stat label={t('an_collected_month')} value={thisMonth} format={fmtMoneyRoll} unit={t('currency')} tone="success" icon={I.HandCoins}
          sub={mrr ? `${Math.round((thisMonth / mrr) * 100)}% ${t('an_of_mrr')}` : null}
          onClick={() => onNav?.('transactions')}/>
        <Stat label={t('an_arpu')} value={arpu} format={fmtMoneyRoll} unit={t('currency')} icon={I.TrendUp} sub={t('an_arpu_sub')}/>
        <Stat label={t('rpt_total_debt')} value={totalDebt} format={fmtMoneyRoll} unit={t('currency')} tone="danger" icon={I.AlertCircle}
          sub={`${debtorsCount} ${tp('rpt_debtors_count_sfx', debtorsCount)}`}
          onClick={() => onNav?.('reports-debtors')}/>
      </div>

      <div className="chart-grid-2">
        <ChartCard t={t} span title={t('an_revenue_by_month')} sub={t('an_revenue_by_month_sub')}
          value={money(revenueTotal)} delta={revenueDelta}>
          {revenueTotal > 0
            ? <Columns data={revenue.map(p => ({ label: monthLabelOf(p.date), full: monthFull(p.date), value: p.value, sub: `${p.count} ${tp('tx_count_sfx', p.count)}` }))}
                format={money} height={210} color="var(--viz-accent)"/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} title={t('an_revenue_by_source')} sub={t('an_revenue_by_source_sub')}>
          {sourceItems.length > 0
            ? <Donut items={sourceItems} format={money} centerValue={fmtMln(revenueTotal, lang)} centerLabel={t('total')}/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} title={t('an_source_by_month')} sub={t('an_source_by_month_sub')}>
          {stackSeries.length > 0
            ? <>
              <Columns data={revenue.map(p => ({ label: monthLabelOf(p.date), full: monthFull(p.date), parts: p.parts }))}
                series={stackSeries} format={money} height={190}/>
              <ChartLegend items={stackSeries.map(s => ({ ...s, value: sources[s.id]?.amount }))} format={money}/>
            </>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} span title={t('an_revenue_by_day')} sub={t('an_last_30')} value={money(daily30)}>
          {daily30 > 0
            ? <Trend data={daily.map(d => ({ label: String(d.date.getDate()), full: `${d.date.getDate()} ${monthShort(d.date.getMonth(), lang)}`, value: d.value }))}
                format={money} height={190} labelEvery={5}/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        {plan.length > 0 && (
          <ChartCard t={t} span title={t('an_plan_fact')} sub={t('an_plan_fact_sub')}
            right={<ChartLegend items={planSeries} inline/>}>
            <Columns
              data={plan.map(p => ({
                label: monthLabelOf(p.date), full: monthFull(p.date), parts: p.parts,
                sub: `${t('an_collection')}: ${Math.round(p.rate)}%`,
              }))}
              series={planSeries} grouped format={money} height={200}/>
          </ChartCard>
        )}

        <ChartCard t={t} title={t('an_debt_aging')} sub={t('an_debt_aging_sub')} value={money(totalDebt)}>
          <BarList
            items={aging.map(b => ({
              key: b.key,
              label: `${b.key} ${tp('an_months_overdue', String(b.key).includes('+') ? 5 : Number(b.key))}`,
              value: b.amount,
              sub: `· ${b.count} ${t('students_count')}`,
              color: String(b.key) === '1' ? 'var(--warning)' : String(b.key) === '2' ? 'var(--viz-cash)' : 'var(--danger)',
            }))}
            format={money}/>
        </ChartCard>

        <ChartCard t={t} title={t('an_debt_by_group')} sub={t('an_debt_by_group_sub')}>
          {byGroupDebt.length > 0
            ? <BarList items={byGroupDebt.map(g => ({ ...g, color: 'var(--danger)' }))} format={money}/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} span title={t('an_top_debtors')} sub={t('an_top_debtors_sub')}
          right={<button className="btn ghost sm" onClick={() => onNav?.('reports-debtors')}>{t('dashboard_view_all')} <I.ArrowRight size={14}/></button>}>
          {topDebtors.length > 0
            ? <BarList
                items={topDebtors.map(d => {
                  const overdue = Number(d.overdue_months_count) || (d.overdue_months || []).length || 1;
                  return {
                    key: d.student_id,
                    label: d.student_name || `#${d.student_id}`,
                    value: Number(d.debt_amount) || 0,
                    sub: `· ${overdue} ${tp('an_months_overdue', overdue)}`,
                    color: 'var(--danger)',
                  };
                })}
                format={money}/>
            : <div className="chart-empty">{t('rpt_debtors_none')}</div>}
        </ChartCard>

        <ChartCard t={t} title={hasChurn ? t('an_students_flow') : t('an_students_growth')}
          sub={hasChurn ? t('an_students_flow_sub') : t('an_students_growth_sub')}
          value={fmt.format(growth[growth.length - 1]?.total || students.length)}
          right={hasChurn ? <ChartLegend inline items={[
            { id: 'joined', label: t('an_joined'), color: 'var(--viz-payme)' },
            { id: 'left', label: t('an_left'), color: 'var(--danger)' },
          ]}/> : null}>
          {hasChurn
            ? <Columns
                data={growth.map(p => ({
                  label: monthLabelOf(p.date), full: monthFull(p.date),
                  parts: { joined: p.value, left: p.left },
                  sub: `${t('an_students_total')}: ${p.total}`,
                }))}
                series={[
                  { id: 'joined', label: t('an_joined'), color: 'var(--viz-payme)' },
                  { id: 'left', label: t('an_left'), color: 'var(--danger)' },
                ]}
                grouped format={count} height={190}/>
            : <Columns data={growth.map(p => ({ label: monthLabelOf(p.date), full: monthFull(p.date), value: p.value, sub: `${t('an_students_total')}: ${p.total}` }))}
                format={count} height={190} color="var(--viz-click)"/>}
        </ChartCard>

        <ChartCard t={t} title={t('an_age_distribution')} sub={t('an_age_distribution_sub')}>
          {ages.length > 0
            ? <Columns data={ages.map(a => ({ label: String(a.age), full: `${a.age} ${tp('students_years', a.age)}`, value: a.count }))}
                format={count} height={190} color="var(--viz-bank)"/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        {attendanceTrend.length > 0 && (
          <ChartCard t={t} span title={t('an_attendance_trend')} sub={t('an_attendance_trend_sub')}
            value={pct(attendanceTrend.reduce((s, p) => s + p.value, 0) / attendanceTrend.length)}>
            <Trend
              data={attendanceTrend.map(p => ({
                label: `${p.date.getDate()} ${monthShort(p.date.getMonth(), lang)}`,
                full: `${p.date.getDate()} ${monthShort(p.date.getMonth(), lang)} · ${p.sessions} ${tp('session_sfx', p.sessions)}`,
                value: p.value,
              }))}
              format={pct} height={180} labelEvery={2} max={100} color="var(--viz-payme)"/>
          </ChartCard>
        )}

        <ChartCard t={t} title={t('an_students_by_group')} sub={t('an_students_by_group_sub')}>
          {groups.length > 0
            ? <BarList
                items={[...groups].sort((a, b) => (b.active_students_count || 0) - (a.active_students_count || 0)).map(g => ({
                  key: g.id,
                  label: g.name,
                  value: Number(g.active_students_count) || 0,
                  sub: Number(g.capacity) > 0
                    ? `/ ${g.capacity}`
                    : (g.waiting_list_count ? `· ${g.waiting_list_count} ${t('an_waiting')}` : null),
                  color: Number(g.capacity) > 0 && (g.active_students_count || 0) >= g.capacity ? 'var(--danger)' : 'var(--viz-click)',
                }))}
                format={count}
                onSelect={() => onNav?.('groups')}/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} title={t('an_attendance_by_group')} sub={t('an_attendance_by_group_sub')}>
          {attendance.length > 0
            ? <BarList
                items={[...attendance].sort((a, b) => (b.attendance_percentage || 0) - (a.attendance_percentage || 0)).map(g => ({
                  key: g.group_id,
                  label: g.group_name,
                  value: Math.round(Number(g.attendance_percentage) || 0),
                  sub: `· ${g.total_sessions} ${tp('session_sfx', g.total_sessions)}`,
                  color: (g.attendance_percentage || 0) >= 85 ? 'var(--success)' : (g.attendance_percentage || 0) >= 70 ? 'var(--warning)' : 'var(--danger)',
                }))}
                max={100}
                format={pct}/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} title={t('an_sessions_per_month')} sub={t('an_sessions_per_month_sub')}
          value={fmt.format(sessionSeries.reduce((s, p) => s + p.value, 0))}>
          {(data?.sessions || []).length > 0
            ? <Columns data={sessionSeries.map(p => ({ label: monthLabelOf(p.date), full: monthFull(p.date), value: p.value }))}
                format={count} height={190} color="var(--viz-payme)"/>
            : <div className="chart-empty">{t('an_no_data')}</div>}
        </ChartCard>

        <ChartCard t={t} title={t('an_collection')} sub={t('an_collection_sub')}>
          <div style={{ display: 'grid', gap: 16 }}>
            <Meter label={t('an_collected_month')} value={thisMonth} max={mrr || thisMonth} format={money}
              tone={mrr && thisMonth / mrr >= 0.8 ? 'success' : mrr && thisMonth / mrr >= 0.5 ? 'accent' : 'warning'}/>
            <Meter label={t('an_paying_students')} value={payers} max={activeStudents || 1}
              format={count} tone="accent" hint={`${activeStudents}`}/>
            <div className="chart-legend">
              <div><i style={{ background: 'var(--viz-accent)' }}/><span>{t('an_avg_check')}</span><b>{money(avgCheck)}</b></div>
              <div><i style={{ background: 'var(--viz-other)' }}/><span>{t('dashboard_transactions')}</span><b>{fmt.format(paidCount)}</b></div>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
