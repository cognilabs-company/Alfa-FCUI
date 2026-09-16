// @ts-nocheck
import { apiFetch, unwrapData } from './client';
import { apiGetTransactions } from './transactions';
import { apiGetDebtors, apiGetDashboard, apiGetAttendanceGroupsReport } from './reports';
import { apiGetStudents } from './students';
import { apiGetGroupsForSelect } from './groups';
import { apiGetSessions } from './sessions';
import { apiGetContractStats } from './contracts';

/**
 * Analytics data loader.
 *
 * The backend gained aggregate endpoints (ANALYTICS_BACKEND_IMPLEMENTED.md);
 * they are used when the server has them. On a server that predates them every
 * series is still folded on the client from the raw lists, so the screens work
 * either way — `computed` in the result says which path was taken.
 */

const MAX_TX_PAGES = 12;   // 100 rows per page on older servers
const MAX_DEBTOR_PAGES = 6;

/**
 * Whether this server has the aggregate endpoints. Remembered for the session
 * so an older server is probed once, not on every range change; a negative
 * answer is rechecked after a few minutes so a deploy is picked up on its own.
 */
const AGG_KEY = 'alpha_caps_analytics';
const AGG_RECHECK_MS = 5 * 60 * 1000;

function aggregatesKnown() {
  try {
    const [flag, at] = String(sessionStorage.getItem(AGG_KEY) || '').split(':');
    if (flag === '1') return true;
    if (flag === '0') return Date.now() - Number(at) < AGG_RECHECK_MS ? false : null;
  } catch { /* private mode */ }
  return null;
}

function rememberAggregates(ok) {
  try { sessionStorage.setItem(AGG_KEY, `${ok ? '1' : '0'}:${Date.now()}`); } catch { /* private mode */ }
}

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ── Aggregate endpoints ────────────────────────────────────────────────────
export async function apiGetRevenueDynamics(params = {}) {
  return apiFetch(`/reports/revenue-dynamics${query(params)}`);
}
export async function apiGetAnalyticsKpis(params = {}) {
  return apiFetch(`/reports/kpis${query(params)}`);
}
export async function apiGetDebtAging(params = {}) {
  return apiFetch(`/reports/debt-aging${query(params)}`);
}
export async function apiGetExpectedVsCollected(params = {}) {
  return apiFetch(`/reports/expected-vs-collected${query(params)}`);
}
export async function apiGetStudentsDynamics(params = {}) {
  return apiFetch(`/reports/students-dynamics${query(params)}`);
}
export async function apiGetAttendanceDynamics(params = {}) {
  return apiFetch(`/reports/attendance/dynamics${query(params)}`);
}

/** Follows pagination meta until the last page or the cap, whichever comes first. */
async function fetchAllPages(fetcher, { pageSize = 100, maxPages = 10, ...params } = {}) {
  const rows = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetcher({ ...params, page, page_size: pageSize });
    const data = res?.data || [];
    rows.push(...data);
    const totalPages = Number(res?.meta?.total_pages) || (data.length < pageSize ? page : page + 1);
    if (page >= totalPages) return { rows, truncated: false };
    if (page === maxPages) truncated = true;
  }
  return { rows, truncated };
}

const value = (result) => (result.status === 'fulfilled' ? result.value : null);
const listOf = (result) => {
  const v = value(result);
  const data = v?.data ?? v;
  return Array.isArray(data) ? data : null;
};
const objectOf = (result) => {
  const v = value(result);
  const data = unwrapData(v);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
};

/**
 * Everything the analytics screen needs.
 * Individual failures are reported in `missing` instead of throwing.
 */
export async function loadAnalytics({ fromDate, toDate, months = 6 } = {}) {
  const range = fromDate && toDate ? { from_date: fromDate, to_date: toDate } : {};

  // Aggregates first — a server without them 404s and the raw path fills in.
  const skipAggregates = aggregatesKnown() === false;
  const none = Promise.resolve(null);
  const [revenue, kpis, aging, expected, studentsDyn, attendanceDyn] = await Promise.allSettled(skipAggregates
    ? [none, none, none, none, none, none]
    : [
      apiGetRevenueDynamics({ ...range, group_by: 'month' }),
      apiGetAnalyticsKpis(range),
      apiGetDebtAging(),
      apiGetExpectedVsCollected(range),
      apiGetStudentsDynamics({ ...range, group_by: 'month' }),
      apiGetAttendanceDynamics({ ...range, group_by: 'week' }),
    ]);

  const revenueSeries = listOf(revenue);
  const debtAging = objectOf(aging);
  const kpiData = objectOf(kpis);
  if (!skipAggregates) rememberAggregates(!!(revenueSeries || kpiData || debtAging));

  // Raw lists: only what the aggregates did not cover.
  const [daily, tx, debtors, students, groups, summary, contractStats, attendance, sessions] = await Promise.allSettled([
    revenueSeries ? apiGetRevenueDynamics({ ...range, group_by: 'day' }) : Promise.resolve(null),
    revenueSeries ? Promise.resolve(null) : fetchAllPages(apiGetTransactions, { maxPages: MAX_TX_PAGES, ...range }),
    debtAging ? Promise.resolve(null) : fetchAllPages(apiGetDebtors, { maxPages: MAX_DEBTOR_PAGES }),
    apiGetStudents({ page_size: 500, include_archived: true }),
    apiGetGroupsForSelect(),
    kpiData ? Promise.resolve(null) : apiGetDashboard(),
    kpiData ? Promise.resolve(null) : apiGetContractStats(),
    apiGetAttendanceGroupsReport(range),
    apiGetSessions(range),
  ]);

  const missing = [];
  const take = (result, name, pick) => {
    if (result.status !== 'fulfilled') { missing.push(name); return null; }
    try { return pick(result.value); } catch { missing.push(name); return null; }
  };

  const txRows = revenueSeries ? [] : (take(tx, 'transactions', (v) => v?.rows || []) || []);
  const debtorRows = debtAging ? [] : (take(debtors, 'debtors', (v) => v?.rows || []) || []);

  return {
    // aggregates (null when the server does not have them yet)
    revenueSeries,
    dailySeries: listOf(daily),
    kpis: kpiData,
    debtAging,
    expectedVsCollected: listOf(expected),
    studentsDynamics: listOf(studentsDyn),
    attendanceDynamics: listOf(attendanceDyn),
    // raw lists (used for the fallback path and for what has no endpoint yet)
    transactions: txRows,
    transactionsTruncated: tx.status === 'fulfilled' && !!tx.value?.truncated,
    debtors: debtorRows,
    students: take(students, 'students', (v) => v?.data || []) || [],
    groups: take(groups, 'groups', (v) => v?.data || []) || [],
    summary: kpiData ? {} : (take(summary, 'summary', (v) => unwrapData(v) || {}) || {}),
    contractStats: kpiData ? {} : (take(contractStats, 'contracts', (v) => unwrapData(v) || {}) || {}),
    attendanceGroups: take(attendance, 'attendance', (v) => v?.data || []) || [],
    sessions: take(sessions, 'sessions', (v) => v?.data || []) || [],
    // true when the client had to fold the series itself
    computed: !revenueSeries,
    missing,
  };
}

/** Lighter variant for the dashboard: the 30-day trend plus headline numbers. */
export async function loadDashboardAnalytics({ fromDate, toDate } = {}) {
  const range = { from_date: fromDate, to_date: toDate };
  const skipAggregates = aggregatesKnown() === false;
  const none = Promise.resolve(null);
  const [dailyAgg, kpis] = await Promise.allSettled(skipAggregates ? [none, none] : [
    apiGetRevenueDynamics({ ...range, group_by: 'day' }),
    apiGetAnalyticsKpis(range),
  ]);

  const dailySeries = listOf(dailyAgg);
  const kpiData = objectOf(kpis);
  if (!skipAggregates) rememberAggregates(!!(dailySeries || kpiData));
  if (dailySeries && kpiData) {
    return { dailySeries, kpis: kpiData, transactions: [], contractStats: {}, computed: false, failed: false };
  }

  const [tx, contractStats] = await Promise.allSettled([
    dailySeries ? Promise.resolve(null) : fetchAllPages(apiGetTransactions, { maxPages: 4, ...range }),
    kpiData ? Promise.resolve(null) : apiGetContractStats(),
  ]);
  return {
    dailySeries,
    kpis: kpiData,
    transactions: tx.status === 'fulfilled' ? (tx.value?.rows || []) : [],
    contractStats: kpiData ? {} : (contractStats.status === 'fulfilled' ? (unwrapData(contractStats.value) || {}) : {}),
    computed: !dailySeries,
    failed: !dailySeries && tx.status !== 'fulfilled',
  };
}
