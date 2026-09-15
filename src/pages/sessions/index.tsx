// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput, MultiDateInput } from '@/shared/ui/date-picker';
import {
  apiGetGroups, apiGetGroupsForSelect, apiGetHeadCoachGroups, apiGetGroup, apiGetGroupStudents, apiCreateGroup, apiUpdateGroup, apiDeleteGroup, apiDeleteGroupsBulk,
  apiGetSessions, apiGetSessionDetails, apiGetCoachSessionDetails, apiCreateSession,
  apiUpdateSession, apiDeleteSession,
  apiGetCoaches, apiDownloadGroupStudentsExport, apiDownloadCoachGroupPerformanceTableExport,
  apiMarkAttendance, apiMarkBulkAttendance, apiAddPerformanceTableMatch,
  apiSaveCoachGroupPerformanceTable, apiDeleteCoachPerformanceTableColumn, apiUpdateCoachPerformanceTableColumn,
  apiUploadCoachSessionKonspekt, apiGetCoachMyAttendances,
} from '@/shared/api';
import { useCoachGroupsQuery, useGroupPerformanceTableQuery } from '@/features/performance-table/model/use-performance-table';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Modal } from '@/shared/ui/modal';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { Badge, sessionStatusBadge, attendanceBadge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate, monthLabel, monthShort, todayISO, toLocalISO, weekdayLong, weekdayShort } from '@/shared/lib/format';
import { Pager, menuPosition } from '@/shared/ui/pager';

// Monday of the week containing `date` (local calendar day)
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function minutesOf(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function durationLabel(start, end, t) {
  const a = minutesOf(start), b = minutesOf(end);
  if (a == null || b == null || b <= a) return '';
  const h = Math.floor((b - a) / 60), m = (b - a) % 60;
  return [h ? `${h} ${t('dur_h')}` : '', m ? `${m} ${t('dur_m')}` : ''].filter(Boolean).join(' ');
}
// Stable colour per group, like calendar colour-coding
const groupColor = (id) => avatarColor(Number(id) || 0);

function sessionStatus(session_date) {
  const today = todayISO();
  if (session_date === today) return 'today';
  if (session_date > today) return 'upcoming';
  return 'completed';
}


export function SessionsScreen({ onMark }) {
  const I = Icon;
  const { t, lang } = useT();
  const todayIso = todayISO();
  const [activeTab, setActiveTab] = React.useState('sessions');
  const [sessions, setSessions] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState('today');
  const [selectedDate, setSelectedDate] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [myAttendances, setMyAttendances] = React.useState([]);
  const [attendancesLoading, setAttendancesLoading] = React.useState(false);
  const [attGroupFilter, setAttGroupFilter] = React.useState('');
  const [groupFilter, setGroupFilter] = React.useState('');
  const [openMenuSessionId, setOpenMenuSessionId] = React.useState(null);
  const [menuPos, setMenuPos] = React.useState({ x: 0, y: 0 });
  const [editingSession, setEditingSession] = React.useState(null);
  const [editForm, setEditForm] = React.useState({ group_id: '', session_date: '', topic: '', start_time: '', end_time: '', station: '', description: '' });
  const [newSession, setNewSession] = React.useState({
    group_id: '',
    session_dates: [todayIso],
    topic: '',
    start_time: '10:00',
    end_time: '11:00',
    station: '',
    description: '',
  });

  const today = todayIso;
  const loadedOnce = React.useRef(false);
  const SESSIONS_PAGE = 20;
  const [page, setPage] = React.useState(1);
  // Monday of the week shown in the calendar
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(new Date()));
  React.useEffect(() => { setPage(1); }, [filter, selectedDate, groupFilter]);

  React.useEffect(() => {
    setLoading(true);
    const params = {};
    if (groupFilter) params.group_id = groupFilter;
    Promise.allSettled([
      apiGetSessions(params),
      apiGetGroupsForSelect(),
    ]).then(([sRes, gRes]) => {
      if (sRes.status === 'fulfilled') setSessions(sRes.value?.data || []);
      if (gRes.status === 'fulfilled') setGroups(gRes.value?.data || []);
    }).finally(() => setLoading(false));
  }, [groupFilter]);

  React.useEffect(() => {
    const closeMenu = () => setOpenMenuSessionId(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  React.useEffect(() => {
    if (activeTab !== 'attendances') return;
    setAttendancesLoading(true);
    const params = {};
    if (attGroupFilter) params.group_id = attGroupFilter;
    apiGetCoachMyAttendances(params)
      .then(r => setMyAttendances(r?.data || []))
      .catch(() => setMyAttendances([]))
      .finally(() => setAttendancesLoading(false));
  }, [activeTab, attGroupFilter]);

  const groupMap = React.useMemo(() => {
    const m = {};
    groups.forEach(g => { m[g.id] = g.name; });
    return m;
  }, [groups]);

  const sessionsWithStatus = sessions.map(s => ({ ...s, _status: sessionStatus(s.session_date) }));

  const list = sessionsWithStatus.filter(s => {
    if (selectedDate && s.session_date !== selectedDate) return false;
    if (filter === 'all') return true;
    if (filter === 'week') {
      return s.session_date >= toLocalISO(weekStart) && s.session_date <= toLocalISO(addDays(weekStart, 6));
    }
    if (filter === 'today') return s._status === 'today';
    if (filter === 'upcoming') return s._status === 'upcoming';
    if (filter === 'past') return s._status === 'completed';
    return true;
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = toLocalISO(d);
    const items = sessions.filter(s => s.session_date === iso);
    return { date: d, iso, label: weekdayShort(d, lang), num: d.getDate(), items, weekend: i >= 5 };
  });
  const weekTotal = days.reduce((n, d) => n + d.items.length, 0);
  const weekEnd = days[6].date;

  if (loading && !loadedOnce.current) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!loading) loadedOnce.current = true;

  function openEditSession(s) {
    setEditingSession(s);
    setEditForm({
      group_id: String(s.group_id || ''),
      session_date: s.session_date || todayIso,
      topic: s.topic || '',
      start_time: s.start_time || '10:00',
      end_time: s.end_time || '11:00',
      station: s.station || '',
      description: s.description || '',
    });
    setOpenMenuSessionId(null);
  }

  async function handleDeleteSession(id) {
    if (!await confirmDialog(t('confirm_delete_session'))) return;
    try {
      await apiDeleteSession(id);
      const params = {};
      if (groupFilter) params.group_id = groupFilter;
      const sRes = await apiGetSessions(params);
      setSessions(sRes?.data || []);
    } catch (e) {
      notify.error(e.message);
    }
  }

  async function handleEditSession() {
    if (!editingSession || !editForm.topic.trim() || !editForm.session_date) return;
    setSaving(true);
    try {
      await apiUpdateSession(editingSession.id, {
        group_id: Number(editForm.group_id),
        session_date: editForm.session_date,
        topic: editForm.topic.trim(),
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        station: editForm.station.trim() || undefined,
        description: editForm.description.trim() || undefined,
      });
      setEditingSession(null);
      const params = {};
      if (groupFilter) params.group_id = groupFilter;
      const sRes = await apiGetSessions(params);
      setSessions(sRes?.data || []);
    } catch (e) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSession() {
    if (!newSession.group_id || !newSession.topic.trim() || newSession.session_dates.length === 0) {
      notify.error(t('toast_required'));
      return;
    }
    setSaving(true);
    try {
      const base = {
        group_id: Number(newSession.group_id),
        topic: newSession.topic.trim(),
        start_time: newSession.start_time,
        end_time: newSession.end_time,
        station: newSession.station.trim() || undefined,
        description: newSession.description.trim() || undefined,
      };
      // One session per picked date. Sequential so a mid-list failure surfaces which date broke.
      const dates = [...newSession.session_dates].sort();
      for (const d of dates) {
        await apiCreateSession({ ...base, session_date: d });
      }
      setShowCreate(false);
      setNewSession((p) => ({ ...p, topic: '', station: '', description: '', session_dates: [todayIso] }));
      const [sRes] = await Promise.all([apiGetSessions()]);
      setSessions(sRes?.data || []);
    } catch (e) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <PageIcon icon={I.Calendar}/>
        <div>
          <h1 className="page-title">{t('sessions_title')}</h1>
          <div className="page-sub">{sessions.length} {t('sessions_page_sub')} · {sessions.filter(s => sessionStatus(s.session_date) === 'upcoming').length} {t('sessions_filter_upcoming').toLowerCase()}</div>
        </div>
        <div className="page-actions">
          {activeTab === 'sessions' && (
            <>
              <button className={'btn' + (filter === 'week' ? ' dark' : '')} onClick={() => setFilter('week')}>
                <I.Calendar size={15}/> {t('filter_week')}
              </button>
              <button className="btn primary" onClick={() => setShowCreate(true)}><I.Plus size={15}/> {t('sessions_new')}</button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="seg">
          {[
            { key: 'sessions', labelKey: 'sessions_tab_sessions' },
            { key: 'attendances', labelKey: 'sessions_tab_attendance' },
          ].map(tb => (
            <button key={tb.key} className={activeTab === tb.key ? 'active' : ''} onClick={() => setActiveTab(tb.key)}>
              {t(tb.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'attendances' && (
        <div>
          <div className="table-wrap">
            <div className="table-toolbar">
              <SearchableGroupSelect value={attGroupFilter} onChange={v => setAttGroupFilter(v)} groups={groups} />
              <div className="toolbar-meta">{myAttendances.length} {t('records_sfx')}</div>
            </div>
            {attendancesLoading ? (
              <div className="empty loading" style={{ padding: 32 }}>{t('loading')}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>{t('sess_id')}</th><th>{t('student_id')}</th><th>{t('sessions_col_status')}</th><th>{t('transactions_comment')}</th><th>{t('sessions_col_date')}</th></tr>
                </thead>
                <tbody>
                  {myAttendances.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 18, color: 'var(--muted)' }}>{t('sessions_no_sessions')}</td></tr>
                  )}
                  {myAttendances.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>#{a.session_id}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>#{a.student_id}</td>
                      <td>
                        {attendanceBadge(a.status, t)}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{a.comment || '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, color: 'var(--muted)' }}>{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'sessions' && (
      <div>
      <section className="week-cal">
        <div className="week-cal-head">
          <div className="week-cal-title">
            <span className="week-cal-icon"><I.Calendar size={22} weight="duotone"/></span>
            <div>
              <div className="week-cal-month">{monthLabel(days[3].date.getMonth(), lang)} {days[3].date.getFullYear()}</div>
              <div className="week-cal-range">
                {days[0].num} {monthShort(days[0].date.getMonth(), lang)} — {weekEnd.getDate()} {monthShort(weekEnd.getMonth(), lang)}
                <span className="dot-sep"/>{weekTotal} {t('session_sfx')}
              </div>
            </div>
          </div>
          <div className="week-cal-nav">
            <button type="button" className="icon-btn" aria-label={t('week_prev')} title={t('week_prev')} onClick={() => setWeekStart(w => addDays(w, -7))}>
              <I.ChevronLeft size={16}/>
            </button>
            <button type="button" className="btn sm" onClick={() => { setWeekStart(mondayOf(new Date())); setSelectedDate(today); setFilter('all'); }}>
              {t('sessions_filter_today')}
            </button>
            <button type="button" className="icon-btn" aria-label={t('week_next')} title={t('week_next')} onClick={() => setWeekStart(w => addDays(w, 7))}>
              <I.ChevronRight size={16}/>
            </button>
          </div>
        </div>
        <div className="week-cal-grid">
          {days.map(d => {
            const isToday = d.iso === today;
            const isSelected = d.iso === selectedDate;
            const isPast = d.iso < today;
            return (
              <button
                key={d.iso}
                type="button"
                className={'wc-day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '') + (d.weekend ? ' weekend' : '') + (isPast ? ' past' : '') + (d.items.length ? ' has' : '')}
                aria-pressed={isSelected}
                onClick={() => { setSelectedDate(isSelected ? '' : d.iso); setFilter('all'); }}
              >
                <span className="wc-wd">{d.label}</span>
                <span className="wc-num">{d.num}</span>
                <span className="wc-dots">
                  {d.items.slice(0, 4).map(s => <i key={s.id} style={{ background: groupColor(s.group_id) }}/>)}
                </span>
                <span className="wc-count">{d.items.length ? `${d.items.length} ${t('session_sfx')}` : ''}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="toolbar filter-buttons">
        <div className="pill-row">
          {[['today', t('sessions_filter_today')], ['upcoming', t('sessions_filter_upcoming')], ['past', t('sessions_filter_completed')], ['all', t('sessions_filter_all')]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={'pill' + (filter === k ? ' active' : '')}>{l}</button>
          ))}
          {selectedDate && (
            <button type="button" className="date-tag" onClick={() => setSelectedDate('')}>
              {fmtDate(selectedDate)} <I.X size={13}/>
            </button>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchableGroupSelect value={groupFilter} onChange={v => setGroupFilter(v)} groups={groups} />
          {groupFilter && <button className="btn sm ghost" onClick={() => setGroupFilter('')}><I.X size={13}/> {t('clear_filters')}</button>}
        </div>
      </div>

      {(() => {
        // today first, then upcoming (soonest first), then past (latest first)
        const rank = (s) => (s._status === 'today' ? 0 : s._status === 'upcoming' ? 1 : 2);
        const ordered = [...list].sort((a, b) => {
          const r = rank(a) - rank(b);
          if (r) return r;
          if (a.session_date !== b.session_date) {
            return rank(a) === 2 ? (a.session_date < b.session_date ? 1 : -1) : (a.session_date < b.session_date ? -1 : 1);
          }
          return String(a.start_time || '').localeCompare(String(b.start_time || ''));
        });
        const pageItems = ordered.slice((page - 1) * SESSIONS_PAGE, page * SESSIONS_PAGE);
        const byDay = [];
        pageItems.forEach((s) => {
          const last = byDay[byDay.length - 1];
          if (last && last.date === s.session_date) last.items.push(s);
          else byDay.push({ date: s.session_date, items: [s] });
        });
        const tomorrowIso = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalISO(d); })();
        const yesterdayIso = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalISO(d); })();
        const relLabel = (iso) => {
          if (iso === today) return t('sessions_filter_today');
          if (iso === tomorrowIso) return t('day_tomorrow');
          if (iso === yesterdayIso) return t('day_yesterday');
          return '';
        };

        if (list.length === 0) {
          return <div className="card empty" style={{ padding: 48 }}>{t('sessions_no_sessions')}</div>;
        }

        let n = 0;
        return (
          <>
            <div className="agenda">
              {byDay.map((day) => {
                const [y, m, dd] = String(day.date).split('-').map(Number);
                const dayDate = new Date(y, (m || 1) - 1, dd || 1);
                const rel = relLabel(day.date);
                return (
                  <section key={day.date} className={'agenda-day' + (day.date === today ? ' is-today' : day.date < today ? ' is-past' : '')}>
                    <div className="agenda-date">
                      <div className="cal-leaf" aria-label={fmtDate(day.date)}>
                        <span className="leaf-top">{monthShort((m || 1) - 1, lang)}{y !== new Date().getFullYear() ? ` ${y}` : ''}</span>
                        <b className="leaf-num">{dd || '—'}</b>
                        <span className="leaf-wd">{weekdayLong(dayDate, lang)}</span>
                      </div>
                      <div className="agenda-date-text">
                        <b>{weekdayLong(dayDate, lang)}</b>
                        <span>{fmtDate(day.date)}</span>
                      </div>
                      {rel && <em>{rel}</em>}
                      <span className="agenda-count">{day.items.length} {t('session_sfx')}</span>
                    </div>
                    <div className="agenda-items">
                      {day.items.map((s) => {
                        const delay = 60 + (n++) * 45;
                        return (
                          <div key={s.id} role="button" tabIndex={0}
                            className={'agenda-item ' + s._status}
                            style={{ animationDelay: `${delay}ms`, '--group': groupColor(s.group_id) }}
                            onClick={() => onMark(s.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onMark(s.id); }}>
                            <div className="agenda-time">
                              <b>{s.start_time?.slice(0, 5) || '--:--'}</b>
                              <span>{s.end_time?.slice(0, 5) ? `— ${s.end_time.slice(0, 5)}` : ''}</span>
                              {durationLabel(s.start_time, s.end_time, t) && <small><I.Timer size={12}/> {durationLabel(s.start_time, s.end_time, t)}</small>}
                            </div>
                            <span className="agenda-rail"/>
                            <div className="agenda-main">
                              <div className="title">{s.topic || '—'}</div>
                              <div className="meta">
                                <span className="group-tag"><i/>{groupMap[s.group_id] || '—'}</span>
                                {s.station && <span><I.MapPin size={14}/> {s.station}</span>}
                              </div>
                            </div>
                            {sessionStatusBadge(s._status, t)}
                            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                              <button className="icon-btn plain" aria-label="Actions" onClick={(e) => {
                                if (openMenuSessionId === s.id) { setOpenMenuSessionId(null); return; }
                                setMenuPos(menuPosition(e.currentTarget, 3));
                                setOpenMenuSessionId(s.id);
                              }}><I.More size={16}/></button>
                              {openMenuSessionId === s.id && (
                                <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }}>
                                  {[
                                    { icon: 'ListChecks', label: t('sessions_mark_attendance'), action: () => { onMark(s.id); setOpenMenuSessionId(null); } },
                                    { icon: 'Edit', label: t('edit'), action: () => openEditSession(s) },
                                    { icon: 'Trash', label: t('delete'), action: () => { setOpenMenuSessionId(null); handleDeleteSession(s.id); }, danger: true },
                                  ].map(item => {
                                    const Ic = I[item.icon];
                                    return (
                                      <button key={item.label} className={'menu-item' + (item.danger ? ' danger' : '')} onClick={item.action}>
                                        <Ic size={15}/> {item.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            {list.length > SESSIONS_PAGE && <Pager detached page={page} totalPages={Math.ceil(list.length / SESSIONS_PAGE)} onPage={setPage} total={list.length} pageSize={SESSIONS_PAGE}/>}
          </>
        );
      })()}

      {showCreate && (
        <Modal icon={I.CalendarPlus}
          onClose={() => setShowCreate(false)}
          title={t('sessions_new_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setShowCreate(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={handleCreateSession} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('sessions_create')}</button>
          </>}
        >
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label>{t('sessions_group')} <span className="req">*</span></label>
              <SearchableGroupSelect value={newSession.group_id} onChange={v => setNewSession(p => ({ ...p, group_id: v }))} groups={groups} placeholder={t('groups_coach_none')} />
            </div>
            <div className="field col-span-2">
              <label>{t('sessions_dates')} <span className="req">*</span></label>
              <MultiDateInput values={newSession.session_dates} placeholder={t('sessions_add_date')}
                onChange={next => setNewSession(p => ({ ...p, session_dates: next }))} />
              {newSession.session_dates.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {[...newSession.session_dates].sort().map(d => (
                    <button key={d} type="button"
                      onClick={() => setNewSession(p => ({ ...p, session_dates: p.session_dates.filter(x => x !== d) }))}
                      className="date-tag">
                      {fmtDate(d)} <I.X size={12}/>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>{t('sessions_topic')} <span className="req">*</span></label>
              <input value={newSession.topic} onChange={e => setNewSession(p => ({ ...p, topic: e.target.value }))} placeholder="Masalan: Tezlik mashqi" />
            </div>
            <div className="field">
              <label>{t('sessions_location')}</label>
              <input value={newSession.station} onChange={e => setNewSession(p => ({ ...p, station: e.target.value }))} placeholder="Maydon 1" />
            </div>
            <div className="field">
              <label>{t('sessions_start')}</label>
              <input type="time" value={newSession.start_time} onChange={e => setNewSession(p => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div className="field">
              <label>{t('sessions_end')}</label>
              <input type="time" value={newSession.end_time} onChange={e => setNewSession(p => ({ ...p, end_time: e.target.value }))} />
            </div>
            <div className="field col-span-2">
              <label>{t('transactions_comment')}</label>
              <textarea value={newSession.description} onChange={e => setNewSession(p => ({ ...p, description: e.target.value }))} placeholder="" />
            </div>
          </div>
        </Modal>
      )}
      {editingSession && (
        <Modal icon={I.Edit}
          onClose={() => setEditingSession(null)}
          title={`${t('edit')} — ${t('sessions_tab_sessions')}`}
          footer={<>
            <button className="btn ghost" onClick={() => setEditingSession(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={handleEditSession} disabled={saving}><I.Check size={14}/> {saving ? t('saving') : t('save')}</button>
          </>}
        >
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label>{t('sessions_col_group')} <span className="req">*</span></label>
              <SearchableGroupSelect value={editForm.group_id} onChange={v => setEditForm(p => ({ ...p, group_id: v }))} groups={groups} placeholder="Tanlang" />
            </div>
            <div className="field">
              <label>{t('sessions_col_date')} <span className="req">*</span></label>
              <DateInput value={editForm.session_date} onChange={v => setEditForm(p => ({ ...p, session_date: v }))} />
            </div>
            <div className="field">
              <label>{t('sessions_topic')} <span className="req">*</span></label>
              <input value={editForm.topic} onChange={e => setEditForm(p => ({ ...p, topic: e.target.value }))} placeholder="Masalan: Tezlik mashqi" />
            </div>
            <div className="field">
              <label>{t('field_pitch')}</label>
              <input value={editForm.station} onChange={e => setEditForm(p => ({ ...p, station: e.target.value }))} placeholder="Maydon 1" />
            </div>
            <div className="field">
              <label>{t('sessions_start')}</label>
              <input type="time" value={editForm.start_time} onChange={e => setEditForm(p => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div className="field">
              <label>{t('sessions_end')}</label>
              <input type="time" value={editForm.end_time} onChange={e => setEditForm(p => ({ ...p, end_time: e.target.value }))} />
            </div>
            <div className="field col-span-2">
              <label>{t('field_comment')}</label>
              <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder={t('field_comment')} />
            </div>
          </div>
        </Modal>
      )}

      </div>
      )}
    </div>
  );
}

