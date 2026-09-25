// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import {
  apiGetGroups, apiGetHeadCoachGroups, apiGetGroup, apiGetGroupStudents, apiCreateGroup, apiUpdateGroup, apiDeleteGroup, apiDeleteGroupsBulk,
  apiGetSessions, apiGetSessionDetails, apiGetCoachSessionDetails, apiCreateSession,
  apiUpdateSession, apiDeleteSession, apiCreateHeadCoachSessionsBulk,
  apiGetCoaches, apiDownloadGroupStudentsExport, apiDownloadCoachGroupPerformanceTableExport,
  apiMarkAttendance, apiUpdateAttendance, apiMarkBulkAttendance, apiAddPerformanceTableMatch,
  apiSaveCoachGroupPerformanceTable, apiDeleteCoachPerformanceTableColumn, apiUpdateCoachPerformanceTableColumn,
  apiUploadCoachSessionKonspekt, apiGetCoachMyAttendances,
} from '@/shared/api';
import { useCoachGroupsQuery, useGroupPerformanceTableQuery } from '@/features/performance-table/model/use-performance-table';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { PageIcon } from '@/shared/ui/page-head';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmtDate } from '@/shared/lib/format';
import { Stat } from '@/shared/ui/stat';

export function AttendanceMark({ sessionId, onBack }) {
  const I = Icon;
  const { t } = useT();
  const [session, setSession] = React.useState(null);
  const [students, setStudents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [marks, setMarks] = React.useState({});
  const [comments, setComments] = React.useState({});
  const [konspektFile, setKonspektFile] = React.useState(null);
  const [konspektDesc, setKonspektDesc] = React.useState('');
  const [uploadingKonspekt, setUploadingKonspekt] = React.useState(false);

  React.useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    apiGetCoachSessionDetails(sessionId).then(async (sRes) => {
      const sess = sRes?.data;
      setSession(sess);
      if (sess?.group_id) {
        const stuRes = await apiGetGroupStudents(sess.group_id);
        const active = (stuRes?.data || []).filter(s => s.status === 'active');
        setStudents(active);
        // Nobody starts out marked — only what the session already holds is
        // restored, so an untouched student is visibly "not marked yet".
        const init = {}, initComments = {};
        for (const a of sess.attendances || []) {
          if (a?.student_id == null) continue;
          init[a.student_id] = a.status;
          if (a.comment) initComments[a.student_id] = a.comment;
        }
        setMarks(init);
        setComments(initComments);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [sessionId]);

  const [rowSaving, setRowSaving] = React.useState({});

  // Optimistic per-click save: status goes to the backend immediately,
  // reverts on failure. POST first, PUT when the record already exists.
  async function setMark(id, status) {
    const prev = marks[id];
    if (prev === status) return;
    setMarks(p => ({ ...p, [id]: status }));
    setRowSaving(p => ({ ...p, [id]: true }));
    // a present student needs no reason, so any earlier one is dropped
    const comment = status === 'present' ? undefined : (comments[id] || undefined);
    if (status === 'present' && comments[id]) setComments(p => ({ ...p, [id]: '' }));
    const payload = { student_id: id, status, comment };
    try {
      try {
        await apiMarkAttendance(sessionId, payload);
      } catch {
        await apiUpdateAttendance(sessionId, payload);
      }
    } catch (e) {
      setMarks(p => { const n = { ...p }; if (prev) n[id] = prev; else delete n[id]; return n; });
      notify.error(e.message);
    } finally {
      setRowSaving(p => ({ ...p, [id]: false }));
    }
  }

  // The reason travels with the status, so it is saved when the coach leaves the field.
  async function saveComment(id) {
    const status = marks[id];
    if (!status || status === 'present') return;
    try {
      const payload = { student_id: id, status, comment: comments[id] || undefined };
      try { await apiMarkAttendance(sessionId, payload); }
      catch { await apiUpdateAttendance(sessionId, payload); }
    } catch { /* the final Save sends everything again */ }
  }

  async function markAll(status) {
    const prevMarks = marks;
    const next = {};
    students.forEach(s => { next[s.id] = status; });
    setMarks(next);
    setSaving(true);
    try {
      await apiMarkBulkAttendance(sessionId, students.map(s => ({
        student_id: s.id,
        status,
        comment: status === 'present' ? undefined : (comments[s.id] || undefined),
      })));
      if (status === 'present') setComments({});
    } catch (e) {
      setMarks(prevMarks);
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const counts = { present: 0, absent: 0, late: 0 };
  students.forEach(s => { const m = marks[s.id]; if (counts[m] !== undefined) counts[m]++; });
  const marked = counts.present + counts.late + counts.absent;
  const unmarked = students.length - marked;

  async function handleSave() {
    if (!sessionId) return;
    // an unmarked student is left alone rather than silently recorded as absent
    const attendances = students.filter(s => marks[s.id]).map(s => ({
      student_id: s.id,
      status: marks[s.id],
      comment: marks[s.id] === 'present' ? undefined : (comments[s.id] || undefined),
    }));
    if (!attendances.length) { notify.error(t('att_nothing_marked')); return; }
    if (unmarked > 0 && !await confirmDialog(t('att_save_unmarked').replace('{n}', String(unmarked)))) return;
    setSaving(true);
    try {
      await apiMarkBulkAttendance(sessionId, attendances);
      onBack?.();
    } catch (e) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!session) return <div className="empty" style={{ padding: 48 }}>{t('not_found')}</div>;

  return (
    <div>
      <button className="btn ghost sm back-link" onClick={onBack}><I.ArrowLeft size={15}/> {t('sessions_tab_sessions')}</button>

      <div className="page-head">
        <PageIcon icon={I.ListChecks}/>
        <div>
          <h1 className="page-title">{session.topic}</h1>
          <div className="page-sub" style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><I.Calendar size={14}/> {fmtDate(session.session_date)}</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><I.Clock size={14}/> {session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}</span>
            {session.station && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><I.MapPin size={14}/> {session.station}</span>}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            <I.Save size={15}/> {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Stat feature label={t('profile_attendance')} icon={I.Activity}
          value={marked ? Math.round(counts.present / marked * 100) : '—'}
          format={(n) => `${Math.round(n)}%`}
          sub={`${t('att_marked')}: ${marked}/${students.length}`}/>
        <Stat label={t('att_present_count')} value={counts.present} tone="success" icon={I.CheckCircle}/>
        <Stat label={t('att_late_count')} value={counts.late} tone="warning" icon={I.Clock}/>
        <Stat label={unmarked > 0 ? t('att_unmarked_count') : t('att_absent_count')}
          value={unmarked > 0 ? unmarked : counts.absent}
          sub={unmarked > 0 ? `${t('att_absent_count')}: ${counts.absent}` : undefined}
          tone={unmarked > 0 ? 'default' : 'danger'} icon={unmarked > 0 ? I.Dashed : I.XCircle}/>
      </div>

      {students.length === 0 && <div className="card empty">{t('att_no_students')}</div>}

      {students.length > 0 && (
        <>
          <div className="table-toolbar mark-toolbar" style={{ marginBottom: 14 }}>
            <span className="mark-progress">
              <I.ListChecks size={17}/> {t('att_marked')}: <b>{marked}/{students.length}</b>
            </span>
            <span className="mark-all-label">{t('att_mark_all')}</span>
            <button className="btn sm" disabled={saving} onClick={() => markAll('present')}>
              <I.CheckCircle size={16} color="var(--success)" weight="fill"/> {t('att_btn_present')}
            </button>
            <button className="btn sm" disabled={saving} onClick={() => markAll('absent')}>
              <I.XCircle size={16} color="var(--danger)" weight="fill"/> {t('att_btn_absent')}
            </button>
            <span className="toolbar-meta" style={{ fontWeight: 600 }}>{t('mark_hint')}</span>
          </div>
          <div className="mark-grid">
            {students.map(s => {
              const m = marks[s.id] || '';
              const name = `${s.first_name} ${s.last_name}`;
              const states = [
                { k: 'present', l: t('att_btn_present'), icon: 'CheckCircle' },
                { k: 'late', l: t('att_btn_late'), icon: 'Clock' },
                { k: 'absent', l: t('att_btn_absent'), icon: 'XCircle' },
              ];
              const cur = states.find(b => b.k === m);
              const CurIc = cur ? I[cur.icon] : I.Dashed;
              // only a missed or late session needs explaining
              const needsReason = m === 'late' || m === 'absent';
              return (
                <div key={s.id} className={'mark-card ' + (m || 'unmarked')}>
                  <div className="mark-head">
                    <div className="avatar" style={{ background: avatarColor(s.id), width: 40, height: 40, borderRadius: 13 }}>{s.first_name?.[0]}{s.last_name?.[0]}</div>
                    <div className="meta">
                      <span className="name">{name}</span>
                      <span className="sub">#{String(s.id).padStart(4, '0')}</span>
                    </div>
                    {rowSaving[s.id]
                      ? <span className="empty loading" style={{ padding: 0, transform: 'scale(0.55)' }}/>
                      : <span className="mark-state"><CurIc size={15} weight={cur ? 'fill' : 'duotone'}/> {cur ? cur.l : t('att_unmarked')}</span>}
                  </div>
                  <div className="att-toggle" role="radiogroup" aria-label={name}>
                    {states.map(b => {
                      const Ic = I[b.icon];
                      const sel = m === b.k;
                      return (
                        <button key={b.k} type="button" role="radio" aria-checked={sel} title={b.l}
                          className={b.k + (sel ? ' on' : '')}
                          disabled={rowSaving[s.id]} onClick={() => setMark(s.id, b.k)}>
                          <Ic size={19} weight={sel ? 'fill' : 'duotone'}/>
                          <span>{b.l}</span>
                        </button>
                      );
                    })}
                  </div>
                  {needsReason && (
                    <label className="mark-reason">
                      <span>{t('att_reason_label')} <i className="req">*</i></span>
                      <input className={'input' + (comments[s.id]?.trim() ? '' : ' needed')}
                        placeholder={t('att_placeholder_reason')}
                        value={comments[s.id] || ''}
                        onChange={e => setComments({ ...comments, [s.id]: e.target.value })}
                        onBlur={() => saveComment(s.id)}/>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Konspekt upload */}
      <div className="card" style={{ marginTop: 16, padding: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>{t('konspekt_title')}</div>
        {session.konspekt_url && (
          <a className="alert info" href={session.konspekt_url} target="_blank" rel="noopener noreferrer" style={{ marginBottom: 12, textDecoration: 'none', alignItems: 'center' }}>
            <I.FileText size={16}/> {t('konspekt_view')}
          </a>
        )}
        <div className="form-row">
          <div className="field">
            <label>{t('konspekt_file_label')}</label>
            <input type="file" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png" onChange={e => setKonspektFile(e.target.files?.[0] || null)} />
          </div>
          <div className="field">
            <label>{t('konspekt_note_label')}</label>
            <input value={konspektDesc} onChange={e => setKonspektDesc(e.target.value)} placeholder={t('konspekt_note_ph')} />
          </div>
          <div>
            <button
              className="btn primary"
              disabled={!konspektFile || uploadingKonspekt}
              onClick={async () => {
                if (!konspektFile) return;
                setUploadingKonspekt(true);
                try {
                  const fd = new FormData();
                  fd.append('file', konspektFile);
                  if (konspektDesc.trim()) fd.append('description', konspektDesc.trim());
                  const res = await apiUploadCoachSessionKonspekt(sessionId, fd);
                  setSession(res?.data || session);
                  setKonspektFile(null);
                  setKonspektDesc('');
                } catch (e) {
                  notify.error(t('konspekt_upload_error') + e.message);
                } finally {
                  setUploadingKonspekt(false);
                }
              }}
            >
              <I.Upload size={14} /> {uploadingKonspekt ? t('loading') : t('upload_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

