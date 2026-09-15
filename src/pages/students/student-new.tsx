// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
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
import { Modal } from '@/shared/ui/modal';
import { useT } from '@/shared/i18n/lang';
import { avatarColor } from '@/shared/lib/avatar';
import { calcAge, fullName, normalizeStatus } from './lib';
import { todayISO } from '@/shared/lib/format';

export function StudentNew({ onBack, onCreated, onViewContract }) {
  const I = Icon;
  const { t } = useT();
  const [groups, setGroups] = React.useState([]);
  const [step, setStep] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showSuccessCard, setShowSuccessCard] = React.useState(false);
  const [createdStudentId, setCreatedStudentId] = React.useState(null);
  const [createdContractId, setCreatedContractId] = React.useState(null);
  const [viewingContract, setViewingContract] = React.useState(false);
  const steps = [t('step1_label'), t('step2_label'), t('step3_label')];

  const [form, setForm] = React.useState({
    first_name: '', last_name: '', date_of_birth: '', height: '', weight: '',
    pnfl: '', phone: '', ampula: 'O(+)', millati: "O'zbek", address: '', group_id: '',
    customer_full_name: '', customer_passport_number: '', customer_address: '',
    monthly_fee_amount: '500000', uniform_fee_amount: '',
    contract_start_date: todayISO(),
    contract_end_date: new Date().getFullYear() + '-12-31',
  });
  const [files, setFiles] = React.useState({ photo: null, passport: null, extra_file: null });

  function setF(field, value) { setForm(p => ({ ...p, [field]: value })); }

  // A step only earns its tick when every required field in it is filled
  const stepValid = {
    1: !!(form.first_name.trim() && form.last_name.trim() && form.date_of_birth && form.height && form.weight && form.pnfl.trim()),
    2: !!(form.customer_full_name.trim() && form.customer_passport_number.trim() && form.customer_address.trim() && form.monthly_fee_amount),
    3: true,
  };

  React.useEffect(() => {
    apiGetGroupsForSelect().then(res => setGroups(res?.data || [])).catch(() => {});
  }, []);

  async function handleSubmit() {
    setError('');
    if (!form.first_name || !form.last_name || !form.date_of_birth || !form.height || !form.weight || !form.pnfl) {
      setError(t('required_student_create_fields'));
      return;
    }
    if (!form.customer_full_name || !form.customer_passport_number || !form.customer_address || !form.monthly_fee_amount) {
      setError(t('required_contract_fields'));
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      const studentFields = ['first_name', 'last_name', 'date_of_birth', 'height', 'weight', 'pnfl', 'phone', 'ampula', 'millati', 'address', 'group_id'];
      studentFields.forEach(k => { if (form[k]) fd.append(k, k === 'pnfl' ? String(form[k]) : form[k]); });
      const contractFields = ['customer_full_name', 'customer_passport_number', 'customer_address', 'monthly_fee_amount', 'uniform_fee_amount', 'contract_start_date', 'contract_end_date'];
      contractFields.forEach(k => { if (form[k]) fd.append(k, form[k]); });
      if (files.photo) fd.append('photo', files.photo);
      if (files.passport) fd.append('passport', files.passport);
      if (files.extra_file) fd.append('extra_file', files.extra_file);
      const result = await apiCreateStudent(fd);
      setShowSuccessCard(true);
      const newStudentId = result?.data?.id || result?.data?.student?.id || result?.id || result?.student?.id;
      if (newStudentId) {
        setCreatedStudentId(newStudentId);
        try {
          const fullInfo = await apiGetStudentFullInfo(newStudentId);
          const contractId = fullInfo?.data?.contract?.id || fullInfo?.data?.contracts?.[0]?.id;
          setCreatedContractId(contractId || null);
        } catch { setCreatedContractId(null); }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button className="btn ghost sm back-link" onClick={onBack}><I.ArrowLeft size={15}/> {t('back_btn')}</button>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('new_student_title')}</h1>
          <div className="page-sub">{t('new_student_sub')}</div>
        </div>
      </div>

      <div className="stepper">
        {steps.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n && stepValid[n];
          const incomplete = step > n && !stepValid[n];
          return (
            <button key={n} type="button"
              className={'stepper-step' + (active ? ' active' : '') + (done ? ' done' : '') + (incomplete ? ' incomplete' : '')}
              aria-current={active ? 'step' : undefined}
              onClick={() => setStep(n)}>
              <span className="step-num">{done ? <I.Check size={15} strokeWidth={2.6}/> : incomplete ? '!' : n}</span>
              <span className="step-meta">
                <small>{t('step_label')} {n}</small>
                <span>{label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 24 }}>
          {step === 1 && (
            <div className="grid-3" style={{ gap: 14 }}>
              <div className="field"><label>{t('field_first_name')} <span className="req">*</span></label><input value={form.first_name} onChange={e => setF('first_name', e.target.value)} placeholder="Ali"/></div>
              <div className="field"><label>{t('field_last_name')} <span className="req">*</span></label><input value={form.last_name} onChange={e => setF('last_name', e.target.value)} placeholder="Karimov"/></div>
              <div className="field"><label>{t('field_birth_date')} <span className="req">*</span></label><DateInput value={form.date_of_birth} onChange={v => setF('date_of_birth', v)}/></div>
              <div className="field"><label>{t('field_height')} <span className="req">*</span></label><input type="number" value={form.height} onChange={e => setF('height', e.target.value)} placeholder="140"/></div>
              <div className="field"><label>{t('field_weight')} <span className="req">*</span></label><input type="number" value={form.weight} onChange={e => setF('weight', e.target.value)} placeholder="35"/></div>
              <div className="field"><label>{t('field_pnfl')} <span className="req">*</span></label><input value={form.pnfl} onChange={e => setF('pnfl', e.target.value)} placeholder={t('pnfl_placeholder')}/></div>
              <div className="field"><label>{t('field_phone')}</label><input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="+998 90 123 45 67"/></div>
              <div className="field"><label>{t('field_blood')}</label>
                <SearchableSelect
                  value={form.ampula || 'O(+)'}
                  onChange={v => setF('ampula', v)}
                  options={['O(+)', 'O(-)', 'A(+)', 'A(-)', 'B(+)', 'B(-)', 'AB(+)', 'AB(-)'].map(v => ({ value: v, label: v }))}
                />
              </div>
              <div className="field"><label>{t('field_nationality')}</label><input value={form.millati} onChange={e => setF('millati', e.target.value)} placeholder="O'zbek"/></div>
              <div className="field col-span-2"><label>{t('field_address')}</label><input value={form.address} onChange={e => setF('address', e.target.value)} placeholder="Toshkent sh., Chilonzor t."/></div>
              <div className="field"><label>{t('field_group2')}</label>
                <SearchableGroupSelect value={form.group_id} onChange={v => setF('group_id', v)} groups={groups} placeholder="Tanlanmagan" />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid-2" style={{ gap: 14 }}>
              <div className="field col-span-2"><label>{t('field_customer_name')} <span className="req">*</span></label><input value={form.customer_full_name} onChange={e => setF('customer_full_name', e.target.value)} placeholder="Karimov Ravshan Akmalovich"/></div>
              <div className="field"><label>{t('field_passport_num')} <span className="req">*</span></label><input value={form.customer_passport_number} onChange={e => setF('customer_passport_number', e.target.value)} placeholder="AB 1234567"/></div>
              <div className="field"><label>{t('field_address')} <span className="req">*</span></label><input value={form.customer_address} onChange={e => setF('customer_address', e.target.value)} placeholder="Toshkent sh., Chilonzor t."/></div>
              <div className="field"><label>{t('field_monthly_fee')} <span className="req">*</span></label><input type="number" value={form.monthly_fee_amount} onChange={e => setF('monthly_fee_amount', e.target.value)} placeholder="500000"/></div>
              <div className="field"><label>{t('field_uniform_fee')}</label><input type="number" value={form.uniform_fee_amount} onChange={e => setF('uniform_fee_amount', e.target.value)} placeholder="0"/></div>
              <div className="field"><label>{t('field_contract_start')}</label><DateInput value={form.contract_start_date} onChange={v => setF('contract_start_date', v)}/></div>
              <div className="field"><label>{t('field_contract_end')}</label><DateInput value={form.contract_end_date} onChange={v => setF('contract_end_date', v)}/></div>
            </div>
          )}
          {step === 3 && (
            <div>
            <div className="grid-3" style={{ gap: 14 }}>
              {[
                { key: 'photo', label: t('file_photo_label'), desc: t('file_photo_desc'), icon: 'Camera' },
                { key: 'passport', label: t('file_passport_label'), desc: t('file_passport_desc'), icon: 'File' },
                { key: 'extra_file', label: t('file_extra_label'), desc: t('file_extra_desc'), icon: 'FileText' },
              ].map(f => {
                const Ic = I[f.icon];
                const picked = files[f.key];
                return (
                  <div key={f.key} className={'dropzone' + (picked ? ' filled' : '')} style={{ minHeight: 180 }}>
                    <span className="dropzone-icon">{picked ? <I.Check size={22}/> : <Ic size={22}/>}</span>
                    <div style={{ fontWeight: 750, color: 'var(--text)', fontSize: 13.5 }}>{f.label}</div>
                    <div>{picked ? picked.name : f.desc}</div>
                    <label className="btn sm" style={{ marginTop: 6, cursor: 'pointer' }}>
                      <I.Upload size={14}/> {t('upload_btn')}
                      <input type="file" style={{ display: 'none' }} onChange={e => setFiles(p => ({ ...p, [f.key]: e.target.files[0] || null }))}/>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="alert success" style={{ marginTop: 14, alignItems: 'center' }}>
              <I.Check size={18}/>
              <div>
                <div style={{ fontWeight: 800 }}>{t('new_student_ready_title')}</div>
                <div style={{ fontWeight: 600, opacity: 0.85 }}>{t('new_student_ready_desc')}</div>
              </div>
            </div>
            </div>
          )}

          {error && (
            <div className="alert danger" role="alert" style={{ marginTop: 14 }}>
              <I.AlertTriangle size={16}/> <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={onBack}>{t('cancel')}</button>
            <div style={{ flex: 1 }}></div>
            {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}><I.ArrowLeft size={14}/> {t('prev')}</button>}
            {step < 3 && <button className="btn primary" onClick={() => setStep(step + 1)}>{t('next')} <I.ArrowRight size={14}/></button>}
            {step === 3 && (
              <button className="btn primary" onClick={handleSubmit} disabled={saving}>
                <I.Check size={14}/> {saving ? t('new_student_creating') : t('new_student_create_btn')}
              </button>
            )}
          </div>
        </div>
      </div>

      {showSuccessCard && (
        <Modal size="sm" footer={<>
          <button className="btn ghost" onClick={() => onCreated?.()}>
            {t('back_to_students')}
          </button>
          {createdContractId && (
            <button className="btn primary"
              disabled={viewingContract}
              onClick={async () => {
                setViewingContract(true);
                try {
                  const blob = await apiGetContractPdf(createdContractId);
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank', 'noopener,noreferrer');
                } catch (err) {
                  alert(t('contract_open_error') + err.message);
                } finally {
                  setViewingContract(false);
                }
              }}>
              <I.FileText size={15}/> {viewingContract ? t('contract_opening') : t('contract_view_btn')}
            </button>
          )}
        </>}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '14px 0' }}>
            <div style={{ width: 76, height: 76, borderRadius: 24, background: 'var(--accent)', color: 'var(--accent-contrast)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <I.Check size={38} strokeWidth={2.4}/>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 }}>{t('contract_ready_title')}</div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>{t('contract_ready_desc')}</div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
