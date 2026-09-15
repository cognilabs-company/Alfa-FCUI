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
        const init = {};
        active.forEach(s => { init[s.id] = 'present'; });
        setMarks(init);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [sessionId]);

  const [rowSaving, setRowSaving] = React.useState({});

  // Optimistic per-click save: status goes to the backend immediately,
  // reverts on failure. POST first, PUT when the record already exists.
  async function setMark(id, status) {
    const prev = marks[id] || 'present';
    setMarks(p => ({ ...p, [id]: status }));
    if (prev === status) return;
    setRowSaving(p => ({ ...p, [id]: true }));
    const payload = { student_id: id, status, comment: comments[id] || undefined };
    try {
      try {
        await apiMarkAttendance(sessionId, payload);
      } catch {
        await apiUpdateAttendance(sessionId, payload);
      }
    } catch (e) {
      setMarks(p => ({ ...p, [id]: prev }));
      alert(e.message);
    } finally {
      setRowSaving(p => ({ ...p, [id]: false }));
    }
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
        comment: comments[s.id] || undefined,
      })));
    } catch (e) {
      setMarks(prevMarks);
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const counts = { present: 0, absent: 0, late: 0 };
  Object.values(marks).forEach(m => { if (counts[m] !== undefined) counts[m]++; });

  async function handleSave() {
    if (!sessionId) return;
    setSaving(true);
    try {
      const attendances = students.map(s => ({
        student_id: s.id,
        status: marks[s.id] || 'absent',
        comment: comments[s.id] || undefined,
      }));
      await apiMarkBulkAttendance(sessionId, attendances);
      onBack?.();
    } catch (e) {
      alert(e.message);
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
        <Stat feature label={t('profile_attendance')} value={students.length ? `${Math.round(counts.present / students.length * 100)}%` : '—'} icon={I.Activity}/>
        <Stat label={t('att_present')} value={counts.present} sub={`${t('total')}: ${students.length}`} tone="success" icon={I.Check}/>
        <Stat label={t('att_late')} value={counts.late} tone="warning" icon={I.Clock}/>
        <Stat label={t('att_absent')} value={counts.absent} tone="danger" icon={I.X}/>
      </div>

      {students.length === 0 && <div className="card empty">{t('att_no_students')}</div>}

      {students.length > 0 && (
        <div className="table-wrap">
          <div className="table-toolbar">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{t('att_mark_all')}</span>
            <button className="btn sm" disabled={saving} onClick={() => markAll('present')}>
              <I.Check size={14} color="var(--success)"/> {t('att_btn_present')}
            </button>
            <button className="btn sm" disabled={saving} onClick={() => markAll('absent')}>
              <I.X size={14} color="var(--danger)"/> {t('att_btn_absent')}
            </button>
            <span className="toolbar-meta">{students.length} {t('nav_students').toLowerCase()}</span>
          </div>
          <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>{t('att_col_student')}</th><th style={{ width: 340 }}>{t('att_col_status')}</th><th>{t('att_col_comment')}</th></tr>
            </thead>
            <tbody>
              {students.map(s => {
                const m = marks[s.id] || 'present';
                const name = `${s.first_name} ${s.last_name}`;
                return (
                  <tr key={s.id} className="static">
                    <td>
                      <div className="row-name">
                        <div className="avatar sm" style={{ background: avatarColor(s.id) }}>{s.first_name?.[0]}{s.last_name?.[0]}</div>
                        <div className="meta">
                          <span className="name">{name}</span>
                          <span className="sub">#{String(s.id).padStart(4, '0')}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="att-toggle" role="radiogroup" aria-label={name}>
                        {[
                          { k: 'present', l: t('att_btn_present'), icon: 'Check' },
                          { k: 'late', l: t('att_btn_late'), icon: 'Clock' },
                          { k: 'absent', l: t('att_btn_absent'), icon: 'X' },
                        ].map(b => {
                          const Ic = I[b.icon];
                          const sel = m === b.k;
                          return (
                            <button key={b.k} type="button" role="radio" aria-checked={sel}
                              className={b.k + (sel ? ' on' : '')}
                              disabled={rowSaving[s.id]} onClick={() => setMark(s.id, b.k)}>
                              <Ic size={14}/> {b.l}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <input className="input" placeholder={m !== 'present' ? t('att_placeholder_reason') : t('att_placeholder_optional')} value={comments[s.id] || ''} onChange={e => setComments({ ...comments, [s.id]: e.target.value })}/>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Konspekt upload */}
      <div className="card" style={{ marginTop: 16, padding: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Konspekt</div>
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
                  alert(t('konspekt_upload_error') + e.message);
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

