// @ts-nocheck
export const SALARY_CATEGORIES = ['coach_salary', 'staff_salary'];
export const LEDGER_CATEGORIES = ['rent', 'utility', 'equipment', 'transport', 'marketing', 'tax', 'other'];
export const EXPENSE_CATEGORIES = [...SALARY_CATEGORIES, ...LEDGER_CATEGORIES];

export const EXPENSE_METHODS = ['cash', 'bank', 'card'];
export const EXPENSE_STATUSES = ['unpaid', 'partial', 'paid'];

export const CATEGORY_COLOR = {
  coach_salary: 'var(--viz-bank)',
  staff_salary: '#8B5CF6',
  rent: 'var(--viz-click)',
  utility: 'var(--viz-payme)',
  equipment: 'var(--viz-cash)',
  transport: '#0EA5E9',
  marketing: '#EC4899',
  tax: '#64748B',
  other: 'var(--viz-other)',
};

export const STATUS_TONE = { unpaid: 'danger', partial: 'warning', paid: 'success' };

export const isSalaryCategory = (c) => SALARY_CATEGORIES.includes(c);

export function categoryLabel(t, category, fallback) {
  if (!category) return t('exp_cat_other');
  if (EXPENSE_CATEGORIES.includes(category)) return t(`exp_cat_${category}`);
  return fallback || category;
}

export function methodLabel(t, method) {
  if (!method) return '—';
  return EXPENSE_METHODS.includes(method) ? t(`exp_method_${method}`) : method;
}

export function expenseUnpaid(e) {
  if (!e) return 0;
  if (e.unpaid_amount != null) return Number(e.unpaid_amount) || 0;
  return Math.max(0, (Number(e.amount) || 0) - (Number(e.paid_amount) || 0));
}

export function expenseStatus(e) {
  if (e?.status) return e.status;
  const paid = Number(e?.paid_amount) || 0;
  const amount = Number(e?.amount) || 0;
  if (paid <= 0) return amount <= 0 ? 'paid' : 'unpaid';
  return paid >= amount ? 'paid' : 'partial';
}

export function hasPaymentHistory(e) {
  return Array.isArray(e?.payments) && e.payments.length > 0;
}

export function expensePayments(e) {
  if (hasPaymentHistory(e)) {
    return [...e.payments].sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')));
  }
  if (!(Number(e?.paid_amount) > 0) || !e?.paid_at) return [];
  return [{
    id: e.id,
    amount: e.paid_amount,
    paid_at: e.paid_at,
    method: e.method || null,
    created_at: e.updated_at || e.created_at,
    paid_by_name: e.paid_by_name || null,
  }];
}

export function personName(e) {
  return e?.coach_name || null;
}

export function toPaidAt(dateISO) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${dateISO}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const monthStartISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

export function nextMonthStartISO(d = new Date()) {
  return monthStartISO(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

export const digitsOnly = (v) => String(v ?? '').replace(/\D/g, '');
