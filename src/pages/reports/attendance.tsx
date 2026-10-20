// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { DateInput } from '@/shared/ui/date-picker';
import { attendanceBadge } from '@/shared/ui/status';
import {
  apiGetAttendanceGroupsReport, apiGetGroupAttendanceSessions, apiGetSessionAttendance,
} from '@/shared/api';
import { fmtDate, weekdayShort } from '@/shared/lib/format';

const pctOf = (v) => Math.round(Number(v) || 0);
const tone = (pct) => (pct < 60 ? ' red' : pct < 80 ? ' gold' : ' green');
// who came first, then late, then who did not, then not yet marked
const STATUS_ORDER = { present: 0, late: 1, absent: 2, not_marked: 3 };

function Pct({ value }) {
  const pct = pctOf(value);
  return (
    <div className="att-pct">
      <div className={'progress' + tone(pct)}><span style={{ width: `${pct}%` }}/></div>
      <b>{pct}%</b>
    </div>
  );
}

/**
 * Reports → Davomat (FRONTEND_DAVOMAT_DRILLDOWN.md): group → its sessions
 * (date + %) → who came and who did not, all opened in place. Each level is
 * fetched only when it is opened, for the chosen date range.
 */
export function AttendanceTab() {
  const I = Icon;
  const { t, tp, lang } = useT();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [groups, setGroups] = React.useState(null);
  const [openGroups, setOpenGroups] = React.useState(() => new Set());
  const [openSessions, setOpenSessions] = React.useState(() => new Set());
  // id → { loading, error, data }
  const [sessionsOf, setSessionsOf] = React.useState({});
  const [detailOf, setDetailOf] = React.useState({});

  const range = React.useMemo(() => {
    const p = {};
    if (from) p.from_date = from;
    if (to) p.to_date = to;
    return p;
  }, [from, to]);

  React.useEffect(() => {
    let alive = true;
    setGroups(null);
    // another range means other sessions: close everything opened before
    setOpenGroups(new Set());
    setOpenSessions(new Set());
    setSessionsOf({});
    setDetailOf({});
    apiGetAttendanceGroupsReport(range)
      .then(res => alive && setGroups(res?.data || []))
      .catch(() => alive && setGroups([]));
    return () => { alive = false; };
  }, [range]);

  function load(setter, id, request) {
    setter(m => ({ ...m, [id]: { loading: true } }));
    request()
      .then(res => setter(m => ({ ...m, [id]: { data: res?.data ?? null } })))
      .catch(e => setter(m => ({ ...m, [id]: { error: e.message } })));
  }

  function toggleGroup(id) {
    const next = new Set(openGroups);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      if (!sessionsOf[id] || sessionsOf[id].error) load(setSessionsOf, id, () => apiGetGroupAttendanceSessions(id, range));
    }
    setOpenGroups(next);
  }

  function toggleSession(id) {
    const next = new Set(openSessions);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      if (!detailOf[id] || detailOf[id].error) load(setDetailOf, id, () => apiGetSessionAttendance(id));
    }
    setOpenSessions(next);
  }

  const state = (s, empty) => {
    if (!s || s.loading) return <div className="att-note">{t('loading')}</div>;
    if (s.error) return <div className="att-note danger"><I.AlertTriangle size={14}/> {s.error}</div>;
    if (empty) return <div className="att-note">{empty}</div>;
    return null;
  };

  function renderStudents(id) {
    const s = detailOf[id];
    const students = [...(s?.data?.students || [])].sort((a, b) => (
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      || String(a.student_name || '').localeCompare(String(b.student_name || ''))
    ));
    const note = state(s, s?.data && students.length === 0 ? t('att_no_students') : null);
    if (note) return note;
    const d = s.data;
    return (
      <>
        <div className="att-counts">
          <span className="chip"><i className="chip-dot" style={{ background: 'var(--success)' }}/>{t('att_present')} {d.present_count ?? 0}</span>
          {Number(d.late_count) > 0 && <span className="chip"><i className="chip-dot" style={{ background: 'var(--warning)' }}/>{t('att_late')} {d.late_count}</span>}
          <span className="chip"><i className="chip-dot" style={{ background: 'var(--danger)' }}/>{t('att_absent')} {d.absent_count ?? 0}</span>
        </div>
        <div className="att-students">
          {students.map(st => (
            <div key={st.student_id} className={'att-student ' + (st.status || 'not_marked')}>
              <span className="name">{st.student_name || `#${st.student_id}`}</span>
              {attendanceBadge(st.status, t)}
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderSessions(groupId) {
    const s = sessionsOf[groupId];
    const rows = s?.data || [];
    const note = state(s, s?.data && rows.length === 0 ? t('rpt_att_no_sessions') : null);
    if (note) return note;
    return rows.map(r => {
      const open = openSessions.has(r.session_id);
      const d = new Date(String(r.session_date).slice(0, 10) + 'T00:00:00');
      const came = (Number(r.present_count) || 0) + (Number(r.late_count) || 0);
      return (
        <div key={r.session_id} className={'att-session' + (open ? ' open' : '')}>
          <button type="button" className="att-row" aria-expanded={open} onClick={() => toggleSession(r.session_id)}>
            <I.ChevronRight size={14} className="att-caret"/>
            <div className="att-main">
              <b>{fmtDate(d)} <span className="muted">· {weekdayShort(d, lang)}</span></b>
              <small>{r.topic || '—'}</small>
            </div>
            <span className="att-meta">{t('rpt_att_came').replace('{n}', came).replace('{total}', Number(r.total_students) || 0)}</span>
            <Pct value={r.attendance_percentage}/>
          </button>
          {open && <div className="att-body">{renderStudents(r.session_id)}</div>}
        </div>
      );
    });
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="toolbar" style={{ marginBottom: 6 }}>
        <div className="card-title">{t('rpt_att_groups')}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <DateInput value={from} onChange={setFrom} placeholder={t('cal_from')}/>
          <DateInput value={to} onChange={setTo} placeholder={t('cal_to')}/>
          {(from || to) && <button className="btn ghost" onClick={() => { setFrom(''); setTo(''); }}><I.X size={14}/> {t('clear_filters')}</button>}
        </div>
      </div>
      <div className="att-hint">{t('rpt_att_hint')}</div>

      {groups === null && <div className="empty loading" style={{ padding: 18 }}>{t('loading')}</div>}
      {groups?.length === 0 && <div className="empty" style={{ padding: 18 }}>{t('rpt_att_not_found')}</div>}
      {groups?.length > 0 && (
        <div className="att-tree">
          {groups.map(g => {
            const id = g.group_id || g.id;
            const open = openGroups.has(id);
            return (
              <div key={id} className={'att-group' + (open ? ' open' : '')}>
                <button type="button" className="att-row" aria-expanded={open} onClick={() => toggleGroup(id)}>
                  <I.ChevronRight size={15} className="att-caret"/>
                  <div className="att-main">
                    <b>{g.group_name}</b>
                    <small>{g.total_sessions} {tp('session_sfx', Number(g.total_sessions) || 0)} · {g.total_students} {t('nav_students').toLowerCase()}</small>
                  </div>
                  <Pct value={g.attendance_percentage ?? g.attendance_rate}/>
                </button>
                {open && <div className="att-body">{renderSessions(id)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
