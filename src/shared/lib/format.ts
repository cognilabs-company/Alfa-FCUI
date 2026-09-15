// @ts-nocheck
export const fmt = new Intl.NumberFormat('uz-UZ');

// Uzbek month names don't exist in Intl — hand-made lists, RU for the ru locale.
const MONTHS_UZ = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
// Genitive ("19 Мая") for dates, nominative ("Май") for standalone labels.
const MONTHS_RU = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Августа', 'Сентября', 'Октября', 'Ноября', 'Декабря'];
const MONTHS_RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_UZ_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const MONTHS_RU_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const WEEKDAYS_SHORT = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};
const WEEKDAYS_LONG = {
  uz: ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'],
  ru: ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'],
};

function currentLang() {
  try { return localStorage.getItem('alpha_lang') || 'uz'; } catch { return 'uz'; }
}

export function monthName(monthIndex, lang = currentLang()) {
  const months = lang === 'ru' ? MONTHS_RU : MONTHS_UZ;
  return months[monthIndex] || '';
}

/** Standalone month label (0-based index): "Sentabr" / "Сентябрь" */
export function monthLabel(monthIndex, lang = currentLang()) {
  const months = lang === 'ru' ? MONTHS_RU_NOM : MONTHS_UZ;
  return months[monthIndex] || '';
}

/** Short month label (0-based index): "Sen" / "Сен" */
export function monthShort(monthIndex, lang = currentLang()) {
  const months = lang === 'ru' ? MONTHS_RU_SHORT : MONTHS_UZ_SHORT;
  return months[monthIndex] || '';
}

/** Monday-first weekday label for a Date */
export function weekdayShort(date, lang = currentLang()) {
  return (WEEKDAYS_SHORT[lang] || WEEKDAYS_SHORT.uz)[(date.getDay() + 6) % 7];
}
export function weekdayLong(date, lang = currentLang()) {
  return (WEEKDAYS_LONG[lang] || WEEKDAYS_LONG.uz)[(date.getDay() + 6) % 7];
}

/**
 * Date → "YYYY-MM-DD" in the user's local time zone.
 * (toISOString() is UTC, so in Tashkent it reports yesterday until 05:00.)
 */
export function toLocalISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayISO() { return toLocalISO(new Date()); }

/** "2026-05-19", timestamp, or Date → "19 May 2026" (uz) / "19 Мая 2026" (ru) */
export function fmtDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : parseDateValue(value);
  if (isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${monthName(d.getMonth())} ${d.getFullYear()}`;
}

/** Like fmtDate but with time: "19 May 2026, 14:05" */
export function fmtDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(d)}, ${hh}:${mm}`;
}

// A bare "YYYY-MM-DD" is parsed by Date as UTC midnight, which west of UTC
// renders as the previous day — read it as a local calendar date instead.
function parseDateValue(value) {
  const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(value);
}

/** 1 250 000 → "1.3 mln" / "1,3 млн" */
export function fmtMln(v, lang = currentLang()) {
  const n = Number(v) || 0;
  if (!n) return '0';
  const unit = lang === 'ru' ? 'млн' : 'mln';
  if (Math.abs(n) < 1_000_000) return fmt.format(n);
  return `${(n / 1_000_000).toFixed(1)} ${unit}`;
}
