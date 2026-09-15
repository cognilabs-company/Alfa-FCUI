// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { Stat } from '@/shared/ui/stat';
import { apiGetDashboard, apiGetGroupsForSelect, apiGetSessions } from '@/shared/api';
import { useT } from '@/shared/i18n/lang';
import { fmtDate, fmtMln, todayISO, weekdayLong } from '@/shared/lib/format';

const DEFAULT_CAPACITY = 25;

function minutesOf(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function Dashboard({ user, onNav, onOpenGroup }) {
  const I = Icon;
  const { t, lang } = useT();
  const [summary, setSummary] = React.useState(null);
  const [todaySessions, setTodaySessions] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      apiGetDashboard(),
      apiGetSessions({ date: todayISO() }),
      apiGetGroupsForSelect(),
    ]).then(([dashRes, sessRes, grpRes]) => {
      setSummary(dashRes?.data || null);
      setTodaySessions(sessRes?.data || []);
      setGroups(grpRes?.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hour = now.getHours();
  const greeting = hour < 12 ? t('greet_morning') : hour < 18 ? t('greet_day') : t('greet_evening');
  const firstName = String(user?.full_name || '').trim().split(/\s+/)[0] || '';

  const m30 = summary?.last_30_days;
  const sessionsToday = summary?.today_sessions ?? todaySessions.length;
  const dash = loading ? '…' : null;

  const sortedSessions = [...todaySessions].sort((a, b) => (minutesOf(a.start_time) ?? 0) - (minutesOf(b.start_time) ?? 0));

  const otherLabel = lang === 'ru' ? 'Другое' : 'Boshqa';
  const financeCells = [
    { label: t('dashboard_total_income'), value: fmtMln(m30?.total_inflow), color: 'var(--success)' },
    { label: t('dashboard_transactions'), value: String(m30?.successful_transactions || 0) },
    ...(m30?.source_breakdown?.map(s => ({
      label: s.source === 'payme' ? 'Payme' : s.source === 'click' ? 'Click' : otherLabel,
      value: fmtMln(s.amount),
    })) || []),
  ];

  return (
    <div>
      <section className="dash-hero">
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{weekdayLong(now, lang)} · {fmtDate(now)}</span>
          <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{loading ? t('loading') : `${sessionsToday} ${t('dashboard_sessions_today')}`}</p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={() => onNav('sessions')}><I.Calendar size={16}/> {t('nav_sessions')}</button>
          <button className="btn primary" onClick={() => onNav('students-new')}><I.UserPlus size={16}/> {t('dashboard_new_student')}</button>
        </div>
      </section>

      <div className="grid-4">
        <Stat feature label={t('dashboard_stat_active_students')} value={dash ?? (summary?.active_students ?? '—')}
          icon={I.Users} onClick={() => onNav('students')}/>
        <Stat label={t('dashboard_stat_today_sessions')} value={dash ?? (summary?.today_sessions ?? '—')}
          icon={I.Calendar} tone="success" onClick={() => onNav('sessions')}/>
        <Stat label={t('dashboard_stat_monthly')} value={dash ?? fmtMln(m30?.total_inflow)}
          icon={I.TrendingUp} tone="warning" onClick={() => onNav('transactions')}/>
        <Stat label={t('dashboard_stat_debtors')} value={dash ?? (summary?.total_debtors ?? '—')}
          icon={I.AlertTriangle} tone="danger" onClick={() => onNav('reports-debtors')}/>
      </div>

      <div className="dash-panels">
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('dashboard_today_sessions')}</div>
            {!loading && <span className="chip">{todaySessions.length}</span>}
            <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('sessions')}>{t('dashboard_view_all')} <I.ArrowRight size={14}/></button>
          </div>
          {loading && <div className="empty loading">{t('loading')}</div>}
          {!loading && sortedSessions.length === 0 && <div className="empty">{t('dashboard_no_sessions')}</div>}
          {!loading && sortedSessions.length > 0 && (
            <div className="timeline">
              {sortedSessions.map((s) => {
                const start = minutesOf(s.start_time);
                const end = minutesOf(s.end_time);
                const live = start != null && end != null && nowMin >= start && nowMin < end;
                return (
                  <button key={s.id} type="button" className={'timeline-item' + (live ? ' live' : '')} onClick={() => onNav('sessions')}>
                    <div className="timeline-time">
                      <b>{s.start_time?.slice(0, 5) || '--:--'}</b>
                      {s.end_time && <small>{s.end_time.slice(0, 5)}</small>}
                    </div>
                    <div className="timeline-dot"><i/></div>
                    <div className="timeline-body">
                      <div className="title">{s.topic || t('dashboard_training')}</div>
                      <div className="meta">
                        {live && <span className="chip solid" style={{ height: 20, fontSize: 10.5 }}>{t('dash_live')}</span>}
                        {(s.location || s.station) && <span><I.MapPin size={12}/> {s.location || s.station}</span>}
                      </div>
                    </div>
                    <I.ChevronRight size={16} color="var(--muted)"/>
                  </button>
                );
              })}
            </div>
          )}
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
              {groups.slice(0, 6).map(g => {
                const count = g.active_students_count || 0;
                const capacity = Number(g.capacity) > 0 ? Number(g.capacity) : DEFAULT_CAPACITY;
                const pct = Math.min(Math.round((count / capacity) * 100), 100);
                return (
                  <button key={g.id} type="button" className="capacity-row"
                    onClick={() => onOpenGroup ? onOpenGroup(g.id) : onNav('groups')}>
                    <div className="top">
                      <span className="name">{g.name}</span>
                      <span className="count">{count} / {capacity}</span>
                    </div>
                    <div className={'progress' + (pct >= 95 ? ' red' : pct >= 75 ? ' gold' : '')}>
                      <span style={{ width: pct + '%' }}></span>
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
          <div className="card-title">{t('dashboard_finance')}</div>
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('transactions')}>{t('dashboard_transactions')} <I.ArrowRight size={14}/></button>
        </div>
        <div className="finance-strip">
          {financeCells.map((item, i) => (
            <button key={i} type="button" className="finance-cell" onClick={() => onNav('transactions')}>
              <div className="label">{item.label}</div>
              <div className="value" style={item.color ? { color: item.color } : undefined}>{loading ? '…' : item.value}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
