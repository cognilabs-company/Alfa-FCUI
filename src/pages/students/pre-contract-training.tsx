// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { DateInput, DateTimeInput } from '@/shared/ui/date-picker';
import { SearchableSelect } from '@/shared/ui/controls';
import { useT } from '@/shared/i18n/lang';
import { fmt, fmtDate, todayISO } from '@/shared/lib/format';

/**
 * Training given before the contract exists (PRE_CONTRACT_TRAINING_FRONTEND_GUIDE.md).
 * It is not a monthly payment but a transaction of its own, payment_type
 * "pre_contract_training". The admin types how many sessions there were — the
 * backend does not count them — and the total defaults to count × the
 * backend's per-session price, which the admin may overwrite.
 *
 * Taken on the new-student wizard and on a new pending-documents record; both
 * use this block so the two cannot drift apart.
 */
export const PRE_CONTRACT_PRICE_PER_SESSION = 25000;

export function emptyPreContract() {
  return {
    start_date: todayISO(), end_date: todayISO(), session_count: '', amount: '',
    source: 'cash', paid_at: '', comment: '',
  };
}

/** The rules the backend answers 422 for, checked before sending. A dictionary key, or '' when fine. */
export function preContractError(v) {
  if (!(Number(v.session_count) > 0)) return 'pct_err_count';
  if (!v.start_date || !v.end_date || v.end_date < v.start_date) return 'pct_err_dates';
  // an empty amount is fine: the backend then bills count × price itself
  if (String(v.amount).trim() !== '' && !(Number(v.amount) > 0)) return 'pct_err_amount';
  return '';
}

/** The body the JSON endpoints take (guide §2 and §3). */
export function preContractPayload(v) {
  return {
    period_start_date: v.start_date,
    period_end_date: v.end_date,
    session_count: Number(v.session_count),
    // left empty on purpose: the backend then bills count × price
    amount: String(v.amount).trim() ? Number(v.amount) : undefined,
    source: v.source || 'cash',
    paid_at: v.paid_at || undefined,
    comment: v.comment.trim() || undefined,
  };
}

/**
 * Switch plus fields. `value` is shaped like emptyPreContract().
 * `hideToggle` drops the switch for a dialog that is only ever about this
 * payment — the student profile's — where there is nothing to switch off.
 */
export function PreContractTrainingFields({ enabled, onToggle, value, onChange, hideToggle = false }) {
  const I = Icon;
  const { t } = useT();
  const set = (k, v) => onChange({ ...value, [k]: v });

  const count = Number(value.session_count);
  const suggested = count > 0 ? count * PRE_CONTRACT_PRICE_PER_SESSION : 0;
  const typed = String(value.amount).trim() === '' ? null : Number(value.amount);

  const open = hideToggle || enabled;

  return (
    <div className="col-span-2">
      {!hideToggle && (
      <div className={'opt-card' + (enabled ? ' on' : '')}>
        <label className="switch" title={t('pct_toggle')}>
          <input type="checkbox" checked={enabled} onChange={e => onToggle(e.target.checked)}/>
          <i/>
        </label>
        <div className="opt-text">
          <div className="opt-title"><I.HandCoins size={16}/> {t('pct_toggle')}</div>
          <div className="opt-desc">{t('pct_hint')}</div>
        </div>
      </div>
      )}

      {open && (
        <div className="grid-2" style={{ gap: 14, marginTop: 14 }}>
          <div className="field">
            <label>{t('pct_start')} <span className="req">*</span></label>
            <DateInput value={value.start_date} onChange={v => onChange({
              ...value,
              start_date: v,
              // a period cannot end before it starts; pull the end along
              end_date: !value.end_date || (v && value.end_date < v) ? v : value.end_date,
            })}/>
          </div>
          <div className="field">
            <label>{t('pct_end')} <span className="req">*</span></label>
            <DateInput value={value.end_date} onChange={v => set('end_date', v)}/>
          </div>
          <div className="field">
            <label>{t('pct_count')} <span className="req">*</span></label>
            {/* the count drives the suggested total; the admin may then overwrite it */}
            <input type="number" min="1" inputMode="numeric" value={value.session_count} placeholder="10"
              onChange={e => {
                const n = Number(e.target.value);
                onChange({
                  ...value,
                  session_count: e.target.value,
                  amount: n > 0 ? String(n * PRE_CONTRACT_PRICE_PER_SESSION) : '',
                });
              }}/>
          </div>
          <div className="field">
            <label>{t('pct_amount')}</label>
            <input type="number" min="1" inputMode="numeric" value={value.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder={suggested ? String(suggested) : '250000'}/>
          </div>
          <div className="field">
            <label>{t('prorated_source')}</label>
            <SearchableSelect value={value.source} onChange={v => set('source', v)}
              options={[
                { value: 'cash', label: t('tx_src_cash') },
                { value: 'payme', label: 'Payme' },
                { value: 'click', label: 'Click' },
                { value: 'bank', label: t('tx_src_bank') },
                { value: 'manual', label: t('tx_src_manual') },
              ]}/>
          </div>
          <div className="field">
            <label>{t('prorated_paid_at')}</label>
            <DateTimeInput value={value.paid_at} onChange={v => set('paid_at', v)} placeholder={t('pct_paid_now')}/>
          </div>
          <div className="field col-span-2">
            <label>{t('ps_pay_comment')}</label>
            <input value={value.comment} onChange={e => set('comment', e.target.value)} placeholder={t('pct_comment_ph')}/>
          </div>

          {count > 0 && (
            <div className="alert info col-span-2" style={{ margin: 0 }}>
              <I.HandCoins size={16}/>
              <span>
                {value.start_date && value.end_date && value.end_date >= value.start_date && (
                  <>{fmtDate(value.start_date)} → {fmtDate(value.end_date)} · </>
                )}
                {t('pct_calc')
                  .replace('{n}', String(count))
                  .replace('{price}', fmt.format(PRE_CONTRACT_PRICE_PER_SESSION))
                  .replace('{total}', fmt.format(suggested))}
                {typed != null && typed > 0 && typed !== suggested && (
                  <> {t('pct_calc_manual').replace('{amount}', fmt.format(typed))}</>
                )}
                {typed == null && <> {t('pct_calc_empty')}</>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
