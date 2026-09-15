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
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate, todayISO, toLocalISO, weekdayShort } from '@/shared/lib/format';
import { Pager, menuPosition } from '@/shared/ui/pager';

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
  const [filter, setFilter] = React.useState('all');
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
      const d = new Date(s.session_date);
      const start = new Date(today);
      start.setDate(start.getDate() - 3);
      const end = new Date(today);
      end.setDate(end.getDate() + 3);
      return d >= start && d <= end;
    }
    if (filter === 'today') return s._status === 'today';
    if (filter === 'upcoming') return s._status === 'upcoming';
    if (filter === 'past') return s._status === 'completed';
    return true;
  });

  const days = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = toLocalISO(d);
    days.push({
      date: d, iso,
      label: weekdayShort(d, lang),
      num: d.getDate(),
      count: sessions.filter(s => s.session_date === iso).length,
    });
  }

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
    if (!window.confirm(t('confirm_delete_session'))) return;
    try {
      await apiDeleteSession(id);
      const params = {};
      if (groupFilter) params.group_id = groupFilter;
      const sRes = await apiGetSessions(params);
      setSessions(sRes?.data || []);
    } catch (e) {
      alert(e.message);
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
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSession() {
    if (!newSession.group_id || !newSession.topic.trim() || newSession.session_dates.length === 0) {
      alert(t('toast_required'));
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
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
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
                        {a.status === 'present' && <span className="chip success"><span className="chip-dot"></span>{t('att_present')}</span>}
                        {a.status === 'absent' && <span className="chip danger"><span className="chip-dot"></span>{t('att_absent')}</span>}
                        {a.status === 'late' && <span className="chip warning"><span className="chip-dot"></span>{t('att_late')}</span>}
                        {!['present','absent','late'].includes(a.status) && <span className="chip">{a.status}</span>}
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
      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div className="week-calendar">
          {days.map(d => {
            const isToday = d.iso === today;
            const isSelected = d.iso === selectedDate;
            return (
              <button
                key={d.iso}
                type="button"
                className={'week-day' + (isSelected ? ' selected' : isToday ? ' today' : '')}
                aria-pressed={isSelected}
                onClick={() => { setSelectedDate(isSelected ? '' : d.iso); setFilter('all'); }}
              >
                <span className="wd">{d.label}</span>
                <span className="dn">{d.num}</span>
                <span className="cnt">{d.count > 0 ? d.count + ' ' + t('session_sfx') : '—'}</span>
              </button>
            );
          })}
        </div>
      </div>

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

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('sessions_col_date')}</th><th>{t('sessions_col_time')}</th><th>{t('sessions_col_topic')}</th><th>{t('sessions_col_group')}</th><th>{t('sessions_col_location')}</th><th>{t('sessions_col_status')}</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan="7">
                  <div className="empty" style={{ padding: 32 }}>
                    {t('sessions_no_sessions')}
                  </div>
                </td>
              </tr>
            )}
            {list.slice((page - 1) * SESSIONS_PAGE, page * SESSIONS_PAGE).map(s => (
              <tr key={s.id} onClick={() => onMark(s.id)}>
                <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDate(s.session_date)}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 750, whiteSpace: 'nowrap' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</td>
                <td>{s.topic}</td>
                <td><span className="chip navy">{groupMap[s.group_id] || '—'}</span></td>
                <td style={{ color: 'var(--muted)' }}>{s.station || '—'}</td>
                <td>
                  {s._status === 'completed' && <span className="chip success"><span className="chip-dot"></span>{t('sessions_completed_chip')}</span>}
                  {s._status === 'today' && <span className="chip warning"><span className="chip-dot"></span>{t('sessions_today_chip')}</span>}
                  {s._status === 'upcoming' && <span className="chip"><span className="chip-dot"></span>{t('sessions_upcoming_chip')}</span>}
                </td>
                <td style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button className="icon-btn plain" aria-label="Actions" onClick={(e) => {
                    if (openMenuSessionId === s.id) { setOpenMenuSessionId(null); return; }

                    setMenuPos(menuPosition(e.currentTarget, 3));
                    setOpenMenuSessionId(s.id);
                  }}><I.More size={15}/></button>
                  {openMenuSessionId === s.id && (
                    <div className="menu" style={{ position: 'fixed', top: menuPos.y, left: menuPos.x }}>
                      {[
                        { icon: 'Calendar', label: t('sessions_mark_attendance'), action: () => { onMark(s.id); setOpenMenuSessionId(null); } },
                        { icon: 'Edit', label: t('edit'), action: () => openEditSession(s) },
                        { icon: 'Trash', label: t('delete'), action: () => { setOpenMenuSessionId(null); handleDeleteSession(s.id); }, danger: true },
                      ].map(item => {
                        const Ic = I[item.icon];
                        return (
                          <button key={item.label} className={'menu-item' + (item.danger ? ' danger' : '')} onClick={item.action}>
                            <Ic size={14}/> {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > SESSIONS_PAGE && <Pager page={page} totalPages={Math.ceil(list.length / SESSIONS_PAGE)} onPage={setPage} total={list.length} pageSize={SESSIONS_PAGE}/>}
      </div>

      {showCreate && (
        <Modal
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
        <Modal
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

