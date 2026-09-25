// @ts-nocheck
/**
 * Payment sources arrive from the API as bare codes ("cash", "click", …).
 * Payme and Click are brand names and stay as they are; the rest are words
 * the user reads, so they go through the dictionary.
 */
export function paymentSourceLabel(value, t) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'payme') return 'Payme';
  if (s === 'click') return 'Click';
  if (s === 'cash') return t('tx_src_cash');
  if (s === 'bank') return t('tx_src_bank');
  return s ? t('dash_other') : '—';
}
