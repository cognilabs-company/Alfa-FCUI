// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { Stat } from '@/shared/ui/stat';
import { CountUp } from '@/shared/ui/count-up';
import { Badge } from '@/shared/ui/status';
import { apiGetAnalyticsKpis, apiGetDashboard, apiGetGroupsForSelect, apiGetSessions } from '@/shared/api';
import { useT } from '@/shared/i18n/lang';
import { fmt, fmtMln, fmtMoneyRoll, fmtDate, monthLabel, monthShort, weekdayLong, todayISO } from '@/shared/lib/format';
import { paymentSourceLabel } from '@/shared/lib/labels';
import { Trend, ChartLegend } from '@/shared/ui/charts';
import { MonthNav } from '@/shared/ui/month-nav';
import { useSelectedMonth } from '@/shared/lib/selected-month';
import { delta } from '@/shared/lib/analytics';

const DEFAULT_CAPACITY = 25;
const SOURCE_COLORS = {
  payme: 'var(--viz-payme)', click: 'var(--viz-click)', cash: 'var(--viz-cash)',
  bank: 'var(--viz-bank)', other: 'var(--viz-other)',
};

function minutesOf(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function onKeyActivate(e, fn) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
}

/** Today's sessions: count + one segment per session (done / live / next) */
function SessionsKpi({ loading, total, sessions, nowMin, onClick, t }) {
  const I = Icon;
  const states = sessions.map((s) => {
    const start = minutesOf(s.start_time);
    const end = minutesOf(s.end_time);
    if (end != null && nowMin >= end) return 'done';
    if (start != null && nowMin >= start) return 'live';
    return 'next';
  });
  const done = states.filter((x) => x === 'done').length;
  const live = states.filter((x) => x === 'live').length;
  const next = states.length - done - live;

  return (
    <div className="kpi sessions" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => onKeyActivate(e, onClick)}>
      <div className="kpi-top">
        <span className="kpi-label">{t('dashboard_stat_today_sessions')}</span>
        <span className="kpi-icon"><I.CalendarCheck size={22} weight="duotone"/></span>
      </div>
      <div className="kpi-value">
        {loading ? '…' : <CountUp value={total} duration={1100}/>}
        {!loading && live > 0 && <Badge tone="accent" icon={I.Lightning} live>{live} {t('dash_live').toLowerCase()}</Badge>}
      </div>
      <div className="kpi-foot">
        {states.length > 0 ? (
          <div className="seg-track">
            {states.map((st, i) => <i key={i} className={st} style={{ animationDelay: `${300 + i * 90}ms` }}/>)}
          </div>
        ) : (
          <div className="seg-track"><i className="next"/></div>
        )}
        <div className="kpi-legend">
          {states.length === 0 ? <span>{loading ? t('loading') : t('dash_no_sessions_short')}</span> : <>
            <span><i style={{ background: 'var(--success)' }}/><b>{done}</b> {t('dash_done')}</span>
            <span><i style={{ background: 'var(--accent)' }}/><b>{live}</b> {t('dash_live').toLowerCase()}</span>
            <span><i style={{ boxShadow: 'inset 0 0 0 1.5px var(--border-strong)' }}/><b>{next}</b> {t('dash_upcoming_short')}</span>
          </>}
        </div>
      </div>
    </div>
  );
}

/** 30-day revenue: rolling money value + stacked bar split by payment source */
function RevenueKpi({ loading, total, breakdown, title, lang, onClick, t }) {
  const I = Icon;
  const parts = (breakdown || []).filter((b) => Number(b.amount) > 0);
  const sum = parts.reduce((s, b) => s + Number(b.amount), 0) || 1;
  const labelOf = (src) => paymentSourceLabel(src, t);

  return (
    <div className="kpi revenue" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => onKeyActivate(e, onClick)}>
      <div className="kpi-top">
        <span className="kpi-label">{title}</span>
        <span className="kpi-icon"><I.HandCoins size={22} weight="duotone"/></span>
      </div>
      <div className="kpi-value">
        {loading ? '…' : <CountUp value={total} format={fmtMoneyRoll} duration={1800}/>}
        {!loading && <small>{t('currency')}</small>}
      </div>
      <div className="kpi-foot">
        <div className="stack-bar">
          {parts.map((b, i) => (
            <i key={b.source + i}
              style={{ flex: Number(b.amount) / sum, background: SOURCE_COLORS[b.source] || 'var(--muted)', animationDelay: `${350 + i * 120}ms` }}
              title={`${labelOf(b.source)}: ${fmt.format(b.amount)} ${t('currency')}`}/>
          ))}
        </div>
        <div className="kpi-legend">
          {parts.length === 0
            ? <span>{loading ? t('loading') : '—'}</span>
            : parts.map((b) => (
              <span key={b.source}>
                <i style={{ background: SOURCE_COLORS[b.source] || 'var(--muted)' }}/>
                {labelOf(b.source)} <b>{Math.round((Number(b.amount) / sum) * 100)}%</b>
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Debtors: count + ring showing their share of active students */
function DebtKpi({ loading, debtors, active, totalDebt, debtLabel, title, onClick, t }) {
  const I = Icon;
  const share = active > 0 ? Math.min(100, (debtors / active) * 100) : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  const [offset, setOffset] = React.useState(C);
  React.useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => setOffset(C * (1 - share / 100)));
    return () => cancelAnimationFrame(id);
  }, [loading, share, C]);

  return (
    <div className="kpi debt" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => onKeyActivate(e, onClick)}>
      <div className="kpi-top">
        <span className="kpi-label">{title || t('dashboard_stat_debtors')}</span>
        <span className="kpi-icon"><I.AlertCircle size={22} weight="duotone"/></span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="kpi-value">{loading ? '…' : <CountUp value={debtors} duration={1200}/>}</div>
          <div className="kpi-legend" style={{ marginTop: 10 }}>
            {totalDebt > 0
              ? <span><b><CountUp value={totalDebt} format={fmtMoneyRoll} duration={1800}/></b>&nbsp;{t('currency')} {debtLabel}</span>
              : <span>{active > 0 ? <><b>{debtors}/{active}</b>&nbsp;{t('dash_share_of_active')}</> : '—'}</span>}
          </div>
        </div>
        <div className="ring" aria-label={`${Math.round(share)}%`}>
          <svg viewBox="0 0 66 66">
            <circle className="track" cx="33" cy="33" r={R}/>
            <circle className="val" cx="33" cy="33" r={R} strokeDasharray={C} strokeDashoffset={offset}/>
          </svg>
          <b>{loading ? '…' : <CountUp value={share} format={(n) => `${n.toFixed(n < 10 ? 1 : 0)}%`} duration={1600}/>}</b>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ user, onNav, onOpenGroup }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const [summary, setSummary] = React.useState(null);
  const [todaySessions, setTodaySessions] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const period = useSelectedMonth();
  // the month before the chosen one, for the "against last month" delta
  const [prevSummary, setPrevSummary] = React.useState(null);
  const [kpis, setKpis] = React.useState(null);
  const [monthLoading, setMonthLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      apiGetSessions({ date: todayISO() }),
      apiGetGroupsForSelect(),
    ]).then(([sessRes, grpRes]) => {
      setTodaySessions(sessRes?.data || []);
      setGroups(grpRes?.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // Everything money-related follows the month picked above (FRONTEND_OY_TANLAGICH.md)
  React.useEffect(() => {
    let alive = true;
    setMonthLoading(true);
    const prev = new Date(period.year, period.month - 2, 1);
    Promise.allSettled([
      apiGetDashboard({ year: period.year, month: period.month }),
      apiGetDashboard({ year: prev.getFullYear(), month: prev.getMonth() + 1 }),
      apiGetAnalyticsKpis({ from_date: period.monthStart, to_date: period.monthEnd }),
    ]).then(([cur, before, k]) => {
      if (!alive) return;
      setSummary(cur.status === 'fulfilled' ? (cur.value?.data || null) : null);
      setPrevSummary(before.status === 'fulfilled' ? (before.value?.data || null) : null);
      setKpis(k.status === 'fulfilled' ? (k.value?.data || null) : null);
    }).finally(() => alive && setMonthLoading(false));
    return () => { alive = false; };
  }, [period.year, period.month]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hour = now.getHours();
  const greeting = hour < 12 ? t('greet_morning') : hour < 18 ? t('greet_day') : t('greet_evening');
  const firstName = String(user?.full_name || '').trim().split(/\s+/)[0] || '';

  // The chosen calendar month; a server that predates it still sends the rolling 30 days
  const monthly = !!summary?.selected_month;
  const m30 = summary?.selected_month || summary?.last_30_days;
  const monthName = `${monthLabel(period.month - 1, lang)} ${period.year}`;
  const sessionsToday = summary?.today_sessions ?? todaySessions.length;
  const dash = loading && monthLoading ? '…' : null;
  const totalDebt = Number(summary?.total_debt ?? summary?.total_outstanding ?? 0) || 0;

  const sortedSessions = [...todaySessions].sort((a, b) => (minutesOf(a.start_time) ?? 0) - (minutesOf(b.start_time) ?? 0));

  // Analytics panel: the month's daily inflow, against the month before, and its source mix
  const an = React.useMemo(() => {
    const total = Number(m30?.total_inflow) || 0;
    const prevTotal = prevSummary?.selected_month ? Number(prevSummary.selected_month.total_inflow) || 0 : null;
    const paidCount = Number(m30?.successful_transactions) || 0;
    const label = (id) => paymentSourceLabel(id, t);
    return {
      daily: (m30?.trend || []).map(p => {
        const d = new Date(String(p.date).slice(0, 10) + 'T00:00:00');
        return { date: d, value: Number(p.inflow) || 0 };
      }),
      total,
      paidCount,
      avgCheck: paidCount ? total / paidCount : 0,
      thisMonth: Number(kpis?.collected_this_month) || 0,
      monthDelta: prevTotal != null && monthly ? delta(total, prevTotal) : null,
      mrr: Number(kpis?.mrr) || 0,
      sourceItems: (m30?.source_breakdown || []).filter(b => Number(b.amount) > 0)
        .map(b => ({ id: b.source, label: label(b.source), value: Number(b.amount), color: SOURCE_COLORS[b.source] || 'var(--viz-other)' })),
    };
  }, [m30, prevSummary, kpis, monthly, t]);

  const financeCells = [
    { label: t('dashboard_total_income'), value: Number(m30?.total_inflow) || 0, money: true, color: 'var(--success)', icon: I.TrendUp },
    { label: t('dashboard_transactions'), value: Number(m30?.successful_transactions) || 0, icon: I.Receipt },
    ...(m30?.source_breakdown?.map(s => ({
      label: paymentSourceLabel(s.source, t),
      value: Number(s.amount) || 0,
      money: true,
      dot: SOURCE_COLORS[s.source] || 'var(--muted)',
    })) || []),
  ];

  return (
    <div>
      <section className="dash-hero">
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{weekdayLong(now, lang)} · {fmtDate(now)}</span>
          <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{loading ? t('loading') : `${sessionsToday} ${tp('dashboard_sessions_today', sessionsToday)}`}</p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => onNav('sessions')}><I.Calendar size={17}/> {t('nav_sessions')}</button>
          <button className="btn primary" onClick={() => onNav('students-new')}><I.UserPlus size={17}/> {t('dashboard_new_student')}</button>
        </div>
      </section>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <MonthNav period={period}/>
        <span className="toolbar-meta" style={{ fontWeight: 600 }}>{t('dash_month_hint')}</span>
      </div>

      <div className="grid-4">
        <Stat feature label={t('dashboard_stat_active_students')} value={dash ?? (Number(summary?.active_students) || 0)}
          icon={I.Users} onClick={() => onNav('students')}/>
        <SessionsKpi loading={loading} total={Number(sessionsToday) || 0} sessions={sortedSessions} nowMin={nowMin} t={t}
          onClick={() => onNav('sessions')}/>
        <RevenueKpi loading={monthLoading} total={Number(m30?.total_inflow) || 0} breakdown={m30?.source_breakdown} lang={lang} t={t}
          title={monthly ? `${t('dash_revenue')} · ${monthName}` : t('dashboard_stat_monthly')}
          onClick={() => onNav('transactions')}/>
        <DebtKpi loading={monthLoading} debtors={Number(summary?.total_debtors) || 0} active={Number(summary?.active_students) || 0}
          totalDebt={totalDebt} debtLabel={monthly ? t('dash_debt') : t('dash_total_debt')}
          title={monthly ? `${t('dashboard_stat_debtors')} · ${monthName}` : undefined} t={t} onClick={() => onNav('reports-debtors')}/>
      </div>

      <div className="dash-panels">
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('an_dash_title')}</div>
            <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('reports')}>{t('an_open_reports')} <I.ArrowRight size={14}/></button>
          </div>
          <div style={{ padding: '16px 18px 18px' }}>
            <div className="an-head">
              <div>
                <div className="an-value">{!monthLoading ? fmtMoneyRoll(an.total, an.total, lang) : '…'}</div>
                <div className="an-label">{monthly ? t('an_dash_month_sub').replace('{month}', monthName) : t('an_dash_sub')}</div>
              </div>
              {an.monthDelta != null && (
                <div className={'chart-delta ' + (an.monthDelta > 0.5 ? 'up' : an.monthDelta < -0.5 ? 'down' : 'flat')}>
                  {an.monthDelta > 0.5 && <I.TrendUp size={14}/>}
                  {an.monthDelta < -0.5 && <I.TrendDown size={14}/>}
                  {`${an.monthDelta > 0 ? '+' : ''}${Math.round(an.monthDelta)}%`}
                  <span style={{ color: 'var(--muted)', fontWeight: 650 }}>{t('an_vs_prev_month')}</span>
                </div>
              )}
            </div>
            {!monthLoading && an.total > 0 && an.daily.length > 0 && (
              <Trend
                data={an.daily.map(d => ({ label: String(d.date.getDate()), full: `${d.date.getDate()} ${monthShort(d.date.getMonth(), lang)}`, value: d.value }))}
                format={(v, axis) => (axis ? fmtMln(v, lang) : `${fmt.format(Math.round(v))} ${t('currency')}`)}
                height={168} labelEvery={6}/>
            )}
            {!monthLoading && !(an.total > 0 && an.daily.length > 0) && <div className="chart-empty">{t('an_no_data')}</div>}
            {monthLoading && <div className="empty loading" style={{ minHeight: 140 }}>{t('loading')}</div>}
            <div className="an-foot">
              <div className="an-metric">
                <span>{t('an_mrr')}</span>
                <b>{an.mrr ? fmtMoneyRoll(an.mrr, an.mrr, lang) : '—'}</b>
              </div>
              <div className="an-metric">
                <span>{period.isCurrent ? t('an_collected_month') : t('an_collected_plain')}</span>
                <b>{!monthLoading && kpis ? fmtMoneyRoll(an.thisMonth, an.thisMonth, lang) : '—'}</b>
                {an.mrr > 0 && <small>{Math.round((an.thisMonth / an.mrr) * 100)}% {t('an_of_mrr')}</small>}
              </div>
              <div className="an-metric">
                <span>{t('an_avg_check')}</span>
                <b>{!monthLoading ? fmtMoneyRoll(an.avgCheck, an.avgCheck, lang) : '—'}</b>
                <small>{an.paidCount} {tp('tx_count_sfx', an.paidCount)}</small>
              </div>
            </div>
            {an.sourceItems.length > 0 && <ChartLegend items={an.sourceItems} format={(v) => fmtMoneyRoll(v, v, lang)} inline/>}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('dashboard_groups')}</div>
            {!loading && <span className="chip">{groups.length}</span>}
            <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('groups')}>{t('dashboard_all_groups')} <I.ArrowRight size={14}/></button>
          </div>
          {loading && <div className="empty loading">{t('loading')}</div>}
          {!loading && groups.length === 0 && <div className="empty">{t('not_found')}</div>}
          {!loading && groups.length > 0 && (
            <div className="capacity-list">
              {groups.slice(0, 6).map((g, i) => {
                const count = g.active_students_count || 0;
                const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : DEFAULT_CAPACITY;
                const pct = Math.min(Math.round((count / capacity) * 100), 100);
                return (
                  <button key={g.id} type="button" className="capacity-row"
                    onClick={() => onOpenGroup ? onOpenGroup(g.id) : onNav('groups')}>
                    <div className="top">
                      <span className="name">{g.name}</span>
                      <span className="count"><CountUp value={count} duration={900} delay={i * 60}/> / {capacity}</span>
                    </div>
                    <div className={'progress' + (pct >= 95 ? ' red' : pct >= 75 ? ' gold' : '')}>
                      <span style={{ width: pct + '%', animationDelay: `${300 + i * 80}ms` }}></span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div className="card-header" style={{ borderBottom: 0 }}>
          <div className="card-title">{monthly ? `${t('dash_finance')} — ${monthName}` : t('dashboard_finance')}</div>
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('transactions')}>{t('dashboard_transactions')} <I.ArrowRight size={14}/></button>
        </div>
        <div className="finance-strip">
          {financeCells.map((item, i) => (
            <button key={i} type="button" className="finance-cell" onClick={() => onNav('transactions')}>
              <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.icon && <item.icon size={14}/>}
                {item.dot && <i style={{ width: 8, height: 8, borderRadius: 3, background: item.dot, display: 'inline-block' }}/>}
                {item.label}
              </div>
              <div className="value" style={item.color ? { color: item.color } : undefined}>
                {monthLoading ? '…' : <CountUp value={item.value} format={item.money ? fmtMoneyRoll : undefined} duration={1600} delay={i * 90}/>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
