// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import {
  apiGetStudents, apiGetStudentFullInfo, apiGetStudentTransactions, apiGetStudentGateLogs,
  apiGetGroupsForSelect, apiGetGroups, apiCreateStudent, apiDownloadStudentsComprehensiveExport,
  apiGetStudentAttendanceReport, apiUpdateStudent,
  apiDeleteStudent, apiDeleteStudentsBulk, apiHardDeleteStudent,
  apiUploadStudentPhoto, apiUploadStudentPassport, apiUploadStudentExtraFile,
  apiContractPdfUrl, apiGetContractPdf, apiDownloadStudentFile,
  apiChangeStudentGroup,
} from '@/shared/api';
import { SearchableGroupSelect, SearchableSelect } from '@/shared/ui/controls';
import { Modal, DetailGrid } from '@/shared/ui/modal';
import { useT } from '@/shared/i18n/lang';
import { Badge, studentStatusBadge, contractStatusBadge, txStatusBadge } from '@/shared/ui/status';
import { confirmDialog, notify } from '@/shared/ui/dialogs';
import { avatarColor } from '@/shared/lib/avatar';
import { fmt, fmtDate, fmtDateTime, monthLabel } from '@/shared/lib/format';
import { DateInput } from '@/shared/ui/date-picker';
import { statusChip } from '@/pages/contracts/status-chip';
import { calcAge, fullName, normalizeStatus } from './lib';

export function StudentProfile({ studentId, onBack }) {
  const I = Icon;
  const { t, tp } = useT();
  const [info, setInfo] = React.useState(null);
  const [transactions, setTransactions] = React.useState([]);
  const [gateLogs, setGateLogs] = React.useState([]);
  const [attendanceReport, setAttendanceReport] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState('overview');
  const [groups, setGroups] = React.useState([]);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [editForm, setEditForm] = React.useState({});
  const [pdfDownloading, setPdfDownloading] = React.useState(false);
  const [downloadingFile, setDownloadingFile] = React.useState(null);
  const [editLoading, setEditLoading] = React.useState(false);
  const [editError, setEditError] = React.useState('');
  const [uploadingFile, setUploadingFile] = React.useState(null);
  const [showHardDeleteModal, setShowHardDeleteModal] = React.useState(false);
  const [hardDeleting, setHardDeleting] = React.useState(false);

  React.useEffect(() => {
    apiGetGroupsForSelect().then(res => setGroups(res?.data || [])).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!studentId) {
      setInfo(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      apiGetStudentFullInfo(studentId),
      apiGetStudentTransactions(studentId),
      apiGetStudentGateLogs(studentId),
      apiGetStudentAttendanceReport(studentId),
    ]).then(([infoRes, txRes, gateRes, reportRes]) => {
      setInfo(infoRes?.data || null);
      setTransactions(txRes?.data || []);
      setGateLogs(gateRes?.data || []);
      setAttendanceReport(reportRes?.data || null);
      if (infoRes?.data?.student) {
        const s = infoRes.data.student;
        setEditForm({
          first_name: s.first_name || '',
          last_name: s.last_name || '',
          date_of_birth: s.date_of_birth || '',
          height: s.height || '',
          weight: s.weight || '',
          pnfl: s.pnfl || '',
          phone: s.phone || '',
          ampula: s.ampula || 'O(+)',
          millati: s.millati || "O'zbek",
          address: s.address || '',
          group_id: infoRes.data.group?.id ? String(infoRes.data.group.id) : '',
          status: s.status || 'active',
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div className="empty loading" style={{ padding: 64 }}>{t('loading')}</div>;
  if (!info) return <div className="empty" style={{ padding: 48 }}>{t('students_not_found')}</div>;

  const s = info.student;
  const group = info.group;
  const coach = info.coach;
  const contract = info.contract;
  // No contract yet, but a paid first period means one is scheduled for its end date.
  const pendingContractDate = contract ? null
    : (transactions.find(tx => tx.payment_type === 'INITIAL' && tx.period_end_date)?.period_end_date || null);
  const attendances = info.attendances || [];
  const name = fullName(s);
  const age = calcAge(s.date_of_birth);
  const studentStatus = normalizeStatus(s.status);

  const presentCount = attendances.filter(a => a.status === 'present').length;
  const absentCount = attendances.filter(a => a.status === 'absent').length;
  const lateCount = attendances.filter(a => a.status === 'late').length;

  return (
    <div>
      <button className="btn ghost sm back-link" onClick={onBack}><I.ArrowLeft size={15}/> {t('profile_back')}</button>

      <section className="profile-hero">
        <div className="who">
          <div className="avatar xl" style={{ background: avatarColor(s.id) }}>
            {s.first_name?.[0]}{s.last_name?.[0]}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="chips">
              {studentStatus === 'active'
                ? <Badge tone="success" icon={I.CheckCircle}>{t('profile_active_student')}</Badge>
                : studentStatusBadge(s.status, t)}
              {attendances.length > 0 && (
                <span className="chip solid">{t('profile_attendance_label')} {Math.round((presentCount / attendances.length) * 100)}%</span>
              )}
            </div>
            <h1>{name}</h1>
            <div className="facts">
              <span>{age} {tp('students_years', age)} · {fmtDate(s.date_of_birth)}</span>
              {group && <span>{group.name}</span>}
              {coach && <span>{t('profile_coach')}: {coach.full_name}</span>}
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={() => setShowEditModal(true)}><I.Edit size={15}/> {t('edit')}</button>
          {contract && <button className="btn" onClick={() => setTab('contract')}><I.FileText size={15}/> {t('profile_contract')}</button>}
          {studentStatus === 'deleted' && <button className="btn danger" onClick={() => setShowHardDeleteModal(true)}><I.Trash2 size={15}/> {t('student_full_delete')}</button>}
        </div>
      </section>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="tabs">
          {[
            { id: 'overview', labelKey: 'profile_overview' },
            { id: 'attendance', labelKey: 'profile_attendance' },
            { id: 'contract', labelKey: 'profile_contract' },
            { id: 'transactions', labelKey: 'profile_payments' },
            { id: 'files', labelKey: 'profile_files' },
          ].map(tb => (
            <button key={tb.id} type="button" className={'tab' + (tab === tb.id ? ' active' : '')} onClick={() => setTab(tb.id)}>
              {t(tb.labelKey)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="split" style={{ padding: 20, gap: 22 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 14 }}>{t('profile_personal')}</div>
              <DetailGrid items={[
                { label: t('profile_dob'), value: fmtDate(s.date_of_birth), icon: I.Calendar },
                { label: t('profile_nationality'), value: s.millati || '—', icon: I.Globe },
                { label: t('profile_blood'), value: s.ampula || '—', icon: I.Drop },
                { label: t('profile_height_weight'), value: `${s.height} ${t('unit_cm')} · ${s.weight} ${t('unit_kg')}`, icon: I.Ruler },
                { label: t('profile_pnfl'), value: s.pnfl, icon: I.IdCard },
                { label: t('profile_phone'), value: s.phone || '—', icon: I.Phone },
                { label: t('profile_address'), value: s.address || '—', icon: I.MapPin },
                { label: t('profile_joined'), value: fmtDate(s.created_at), icon: I.UserPlus },
              ]}/>
              {contract?.custom_fields?.customer && (
                <div style={{ marginTop: 22 }}>
                  <div className="card-title" style={{ marginBottom: 14 }}>{t('profile_parent')}</div>
                  <DetailGrid items={[
                    { label: t('profile_col_fullname'), value: contract.custom_fields.customer.full_name || '—', icon: I.User },
                    { label: t('profile_upload_passport'), value: contract.custom_fields.customer.passport_number || '—', icon: I.IdCard },
                    { label: t('profile_address'), value: contract.custom_fields.customer.address || '—', icon: I.MapPin },
                  ]}/>
                </div>
              )}
            </div>
            <div>
              <div className="card-title" style={{ marginBottom: 14 }}>{t('profile_stats')}</div>
              <div className="list-stack">
                {[
                  { l: t('profile_total_trainings'), v: String(attendances.length), sub: t('profile_this_season') },
                  { l: t('profile_present_absent'), v: `${presentCount}/${absentCount}`, sub: t('profile_attendance_label') },
                  { l: t('profile_late'), v: String(lateCount), sub: t('profile_last_records') },
                  { l: t('profile_monthly_fee'), v: contract ? `${fmt.format(contract.monthly_fee ?? contract.monthly_fee_amount ?? 0)} ${t('currency')}` : '—', sub: t('profile_contract_label') },
                ].map(it => (
                  <div key={it.l} className="list-row">
                    <div className="grow">
                      <div className="title" style={{ fontSize: 13 }}>{it.l}</div>
                      <div className="subtitle">{it.sub}</div>
                    </div>
                    <div className="big">{it.v}</div>
                  </div>
                ))}
                {attendanceReport && (
                  <div className="list-row">
                    <div className="grow">
                      <div className="title" style={{ fontSize: 13 }}>{t('profile_official_report')}</div>
                      <div className="subtitle">{attendanceReport.present_count || 0} / {attendanceReport.absent_count || 0} / {attendanceReport.late_count || 0}</div>
                    </div>
                    <div className="big">
                      {attendanceReport.total_sessions || 0} <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{tp('sessions_sfx_short', attendanceReport.total_sessions || 0)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'attendance' && (
          <div style={{ padding: 20 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>{t('profile_last_trainings')} {Math.min(attendances.length, 14)} {tp('profile_last_trainings_suffix', Math.min(attendances.length, 14))}</div>
            {attendances.length === 0 && <div className="empty">{t('profile_no_attendance')}</div>}
            <div className="attendance-strip">
              {attendances.slice(0, 14).map((a, i) => {
                const kind = a.status === 'present' ? 'present' : a.status === 'absent' ? 'absent' : 'late';
                const label = kind === 'present' ? '✓' : kind === 'absent' ? '✗' : 'L';
                return (
                  <div key={i} title={a.status} className={'att-cell ' + kind}>{label}</div>
                );
              })}
            </div>
            <div className="legend" style={{ marginTop: 16 }}>
              <span style={{ color: 'var(--success)' }}><i style={{ background: 'var(--success)' }}/> {t('profile_present')} {presentCount}</span>
              <span style={{ color: 'var(--warning)' }}><i style={{ background: 'var(--warning)' }}/> {t('profile_late_chip')} {lateCount}</span>
              <span style={{ color: 'var(--danger)' }}><i style={{ background: 'var(--danger)' }}/> {t('profile_absent')} {absentCount}</span>
            </div>
          </div>
        )}

        {tab === 'contract' && (
          <div className="grid-2" style={{ padding: 20, gap: 18 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 14 }}>{t('profile_current_contract')}</div>
              {!contract && !pendingContractDate && <div className="empty">{t('profile_contract_not_found')}</div>}
              {!contract && pendingContractDate && (
                <div className="alert info" style={{ marginBottom: 0 }}>
                  <I.Calendar size={16}/> <span>{t('profile_contract_pending').replace('{date}', fmtDate(pendingContractDate))}</span>
                </div>
              )}
              {contract && (
                <DetailGrid items={[
                  { label: t('contracts_number'), value: contract.contract_number },
                  { label: t('contracts_status'), value: contractStatusBadge(contract.status || 'ACTIVE', t) },
                  { label: t('contracts_start_date'), value: fmtDate(contract.start_date) },
                  { label: t('contracts_end_date'), value: fmtDate(contract.end_date) },
                  { label: t('contracts_monthly_fee'), value: `${fmt.format(contract.monthly_fee ?? contract.monthly_fee_amount ?? 0)} ${t('currency')}` },
                ]}/>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {contract && (
                  <button className="btn" disabled={pdfDownloading} onClick={async () => {
                    setPdfDownloading(true);
                    try {
                      const blob = await apiGetContractPdf(contract.id);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `shartnoma-${contract.contract_number || contract.id}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      notify.error(`${t('err_pdf_download')}: ${err.message}`);
                    } finally {
                      setPdfDownloading(false);
                    }
                  }}>
                    <I.Download size={14}/> {pdfDownloading ? t('loading') : 'PDF ' + t('download')}
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="card-title" style={{ marginBottom: 14 }}>{t('profile_parent')}</div>
              <div className="detail-item" style={{ fontSize: 13.5 }}>
                {contract?.custom_fields?.customer ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{contract.custom_fields.customer.full_name || '—'}</div>
                    <div style={{ color: 'var(--muted)', marginBottom: 8 }}>{t('profile_upload_passport')}: {contract.custom_fields.customer.passport_number || '—'}</div>
                    <div style={{ color: 'var(--muted)' }}>{contract.custom_fields.customer.address || '—'}</div>
                  </>
                ) : <div className="empty">{t('not_found')}</div>}
              </div>
            </div>
          </div>
        )}

        {tab === 'transactions' && (
          <div style={{ padding: 20 }}>
            {transactions.length === 0 && <div className="empty">{t('profile_no_payments')}</div>}
            {transactions.length > 0 && (
              <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>{t('profile_tx_date_time')}</th><th>{t('profile_tx_source')}</th><th>{t('tx_months_col')}</th><th style={{ textAlign: 'right' }}>{t('profile_tx_amount')}</th><th>{t('profile_tx_status')}</th></tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 10).map(tx => (
                    <tr key={tx.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{fmtDateTime(tx.paid_at)}</td>
                      <td>
                        <span className="chip">{tx.source}</span>
                        {tx.payment_type === 'INITIAL' && <span className="chip warning" style={{ marginLeft: 6 }}>{t('tx_type_initial')}</span>}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12.5 }}>{tx.payment_months?.map(m => monthLabel(Number(m) - 1) || m).join(', ') || '—'}</td>
                      <td className="money" style={{ textAlign: 'right' }}>{fmt.format(tx.amount || 0)} {t('currency')}</td>
                      <td>
                        {txStatusBadge(tx.status, t)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

        {/* tab === 'gatelogs' && (
          <div style={{ padding: 20 }}>
            {gateLogs.length === 0 && <div className="empty">{t('profile_no_gate')}</div>}
            {gateLogs.slice(0, 30).map(log => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: log.allowed ? 'var(--success-soft)' : 'var(--accent-soft)',
                  color: log.allowed ? 'var(--success)' : 'var(--danger)' }}>
                  {log.allowed ? <I.Check size={15}/> : <I.X size={15}/>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{log.allowed ? t('profile_gate_entry') : t('profile_gate_exit')}</div>
                  {log.reason && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{log.reason}</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {log.gate_timestamp ? log.gate_timestamp.slice(0, 16).replace('T', ' ') : '—'}
                </div>
              </div>
            ))}
          </div>
        ) */}

        {tab === 'files' && (
          <div className="grid-3" style={{ padding: 20, gap: 14 }}>
            {[
              { name: t('file_photo_label'), urlKey: 'photo_url', icon: 'Camera', apiKey: 'photo', accept: 'image/*', uploadFn: apiUploadStudentPhoto },
              { name: t('file_passport_label'), urlKey: 'passport_url', icon: 'File', apiKey: 'passport', accept: 'image/*,.pdf', uploadFn: apiUploadStudentPassport },
              { name: t('file_extra_label'), urlKey: 'extra_file_url', icon: 'FileText', apiKey: 'extra_file', accept: '*', uploadFn: apiUploadStudentExtraFile },
            ].map((f) => {
              const Ic = I[f.icon];
              const url = s[f.urlKey];
              const uploading = uploadingFile === f.apiKey;
              return (
                <div key={f.apiKey} className={'file-tile' + (url ? ' has' : '')}>
                  <div className="head">
                    <div className="ic">
                      <Ic size={20}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 750, fontSize: 13.5, marginBottom: 2 }}>{f.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: url ? 'var(--success)' : 'var(--muted)' }}>{url ? t('file_available') : t('file_missing')}</div>
                    </div>
                    {url && (
                      <button className="icon-btn" disabled={downloadingFile === f.apiKey} title={t('download_btn')} aria-label={t('download_btn')}
                        onClick={async () => {
                          setDownloadingFile(f.apiKey);
                          try {
                            const { blob, filename } = await apiDownloadStudentFile(url);
                            const dlUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = dlUrl;
                            a.download = filename || f.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(dlUrl);
                          } catch (err) {
                            notify.error(err.message);
                          } finally {
                            setDownloadingFile(null);
                          }
                        }}>
                        {downloadingFile === f.apiKey ? <span style={{ fontSize: 10, fontWeight: 700 }}>...</span> : <I.Download size={15}/>}
                      </button>
                    )}
                  </div>
                  <label className="btn sm block" style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? t('loading') : <><I.Upload size={13}/> {url ? t('reupload_btn') : t('upload_btn')}</>}
                    <input type="file" style={{ display: 'none' }} accept={f.accept} disabled={uploading} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingFile(f.apiKey);
                      try {
                        const fd = new FormData();
                        fd.append(f.apiKey, file);
                        await f.uploadFn(studentId, fd);
                        const infoRes = await apiGetStudentFullInfo(studentId);
                        setInfo(infoRes?.data || null);
                      } catch (err) {
                        notify.error(err.message);
                      } finally {
                        setUploadingFile(null);
                        e.target.value = '';
                      }
                    }}/>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showHardDeleteModal && info && (
        <Modal icon={I.Trash} tone="danger" size="sm"
          onClose={() => { if (!hardDeleting) setShowHardDeleteModal(false); }}
          title={t('student_full_delete_confirm_title')}
          footer={<>
            <button className="btn ghost" onClick={() => setShowHardDeleteModal(false)} disabled={hardDeleting}>{t('cancel')}</button>
            <button className="btn danger" onClick={async () => {
              setHardDeleting(true);
              try {
                await apiHardDeleteStudent(studentId);
                setShowHardDeleteModal(false);
                onBack?.();
              } catch (e) {
                notify.error(e.message);
              } finally {
                setHardDeleting(false);
              }
            }} disabled={hardDeleting}>{hardDeleting ? t('deleting') : t('student_full_delete')}</button>
          </>}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--danger-soft)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.Trash2 size={20}/></div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.55 }}>
              {t('student_full_delete_confirm_desc')}
            </div>
          </div>
        </Modal>
      )}

      {showEditModal && info && (
        <Modal icon={I.Edit}
          onClose={() => { if (!editLoading) setShowEditModal(false); }}
          size="lg"
          title={`${t('edit')} — ${t('students_title')}`}
          footer={<>
            <button className="btn ghost" onClick={() => setShowEditModal(false)} disabled={editLoading}>{t('cancel')}</button>
            <button className="btn primary" onClick={async () => {
                setEditError('');
                if (!editForm.first_name || !editForm.last_name || !editForm.date_of_birth || !editForm.pnfl) {
                  setEditError(t('required_student_fields'));
                  return;
                }
                setEditLoading(true);
                try {
                  const fd = new FormData();
                  ['first_name', 'last_name', 'date_of_birth', 'height', 'weight', 'pnfl', 'phone', 'ampula', 'millati', 'address', 'status'].forEach(k => {
                    if (editForm[k]) fd.append(k, editForm[k]);
                  });
                  await apiUpdateStudent(studentId, fd);
                  if (editForm.group_id && String(editForm.group_id) !== String(info?.group?.id || '')) {
                    await apiChangeStudentGroup(studentId, editForm.group_id);
                  }
                  setShowEditModal(false);
                  setLoading(true);
                  const infoRes = await apiGetStudentFullInfo(studentId);
                  setInfo(infoRes?.data || null);
                  setEditForm({
                    first_name: infoRes.data.student.first_name,
                    last_name: infoRes.data.student.last_name,
                    date_of_birth: infoRes.data.student.date_of_birth,
                    height: infoRes.data.student.height,
                    weight: infoRes.data.student.weight,
                    pnfl: infoRes.data.student.pnfl,
                    phone: infoRes.data.student.phone,
                    ampula: infoRes.data.student.ampula,
                    millati: infoRes.data.student.millati,
                    address: infoRes.data.student.address,
                    group_id: infoRes.data.group?.id ? String(infoRes.data.group.id) : '',
                    status: infoRes.data.student.status || 'active',
                  });
                  setLoading(false);
                } catch (e) {
                  setEditError(e.message);
                } finally {
                  setEditLoading(false);
                }
              }} disabled={editLoading}>{editLoading ? t('saving') : t('save')}</button>
          </>}>
          {editError && <div className="alert danger" style={{ marginBottom: 14 }}>{editError}</div>}
          <div className="form-row">
            {[
              [t('student_new_first_name'), 'first_name'],
              [t('student_new_last_name'), 'last_name'],
              [t('profile_dob'), 'date_of_birth'],
              [t('field_height'), 'height'],
              [t('field_weight'), 'weight'],
              [t('profile_pnfl'), 'pnfl'],
              [t('profile_phone'), 'phone'],
              [t('profile_address'), 'address'],
            ].map(([label, field]) => (
              <div key={field} className="field">
                <label>{label}</label>
                {field === 'date_of_birth' ? (
                  <DateInput value={editForm.date_of_birth || ''} onChange={v => setEditForm(p => ({ ...p, date_of_birth: v }))}/>
                ) : (
                  <input
                    type={field === 'height' || field === 'weight' ? 'number' : 'text'}
                    value={editForm[field] || ''}
                    onChange={(e) => setEditForm(p => ({ ...p, [field]: e.target.value }))}
                    disabled={editLoading}
                  />
                )}
              </div>
            ))}
            <div className="field">
              <label>{t('profile_blood')}</label>
              <SearchableSelect
                value={editForm.ampula || 'O(+)'}
                onChange={v => setEditForm(p => ({ ...p, ampula: v }))}
                options={['O(+)', 'O(-)', 'A(+)', 'A(-)', 'B(+)', 'B(-)', 'AB(+)', 'AB(-)'].map(v => ({ value: v, label: v }))}
                style={{ width: '100%' }}
              />
            </div>
            <div className="field">
              <label>{t('field_group')}</label>
              <SearchableGroupSelect
                value={editForm.group_id || ''}
                onChange={v => setEditForm(p => ({ ...p, group_id: v }))}
                groups={groups}
                placeholder={t('students_all_groups')}
                style={{ width: '100%' }}
                direction="up"
              />
            </div>
            <div className="field">
              <label>{t('students_all_statuses')}</label>
              <SearchableSelect
                value={editForm.status || 'active'}
                onChange={v => setEditForm(p => ({ ...p, status: v }))}
                options={[
                  { value: 'active', label: t('status_active') },
                  { value: 'inactive', label: t('status_inactive') },
                  // archiving is a contract-level action, so it is not offered here;
                  // an already archived student still sees their own status
                  ...(editForm.status === 'archived' ? [{ value: 'archived', label: t('status_archived') }] : []),
                ]}
                style={{ width: '100%' }}
                direction="up"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

