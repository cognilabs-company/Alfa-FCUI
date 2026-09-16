// @ts-nocheck
import { apiGetTransactions } from './transactions';
import { apiGetDebtors, apiGetDashboard, apiGetAttendanceGroupsReport } from './reports';
import { apiGetStudents } from './students';
import { apiGetGroupsForSelect } from './groups';
import { apiGetSessions } from './sessions';
import { apiGetContractStats } from './contracts';
import { unwrapData } from './client';

/**
 * Analytics data loader.
 *
 * The API exposes lists, not aggregates, so the series are folded on the client
 * from a bounded number of pages. That is fine at today's volume (a few hundred
 * payments) and degrades gracefully: each source is fetched independently and a
 * failed one only removes its own charts. ANALYTICS_BACKEND.md asks for real
 * aggregate endpoints to replace this.
 */

const MAX_TX_PAGES = 12;   // 100 rows per page — the API's ceiling
const MAX_DEBTOR_PAGES = 6;

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

/**
 * Everything the analytics screens need, in one call.
 * Individual failures are reported in `missing` instead of throwing.
 */
export async function loadAnalytics({ fromDate, toDate } = {}) {
  const range = fromDate && toDate ? { from_date: fromDate, to_date: toDate } : {};

  const [tx, debtors, students, groups, summary, contractStats, attendance, sessions] = await Promise.allSettled([
    fetchAllPages(apiGetTransactions, { maxPages: MAX_TX_PAGES, ...range }),
    fetchAllPages(apiGetDebtors, { maxPages: MAX_DEBTOR_PAGES }),
    apiGetStudents({ page_size: 500, include_archived: true }),
    apiGetGroupsForSelect(),
    apiGetDashboard(),
    apiGetContractStats(),
    apiGetAttendanceGroupsReport(range),
    apiGetSessions(range),
  ]);

  const missing = [];
  const take = (result, name, pick) => {
    if (result.status !== 'fulfilled') { missing.push(name); return null; }
    try { return pick(result.value); } catch { missing.push(name); return null; }
  };

  return {
    transactions: take(tx, 'transactions', (v) => v.rows) || [],
    transactionsTruncated: tx.status === 'fulfilled' && tx.value.truncated,
    debtors: take(debtors, 'debtors', (v) => v.rows) || [],
    students: take(students, 'students', (v) => v?.data || []) || [],
    groups: take(groups, 'groups', (v) => v?.data || []) || [],
    summary: take(summary, 'summary', (v) => unwrapData(v) || {}) || {},
    contractStats: take(contractStats, 'contracts', (v) => unwrapData(v) || {}) || {},
    attendanceGroups: take(attendance, 'attendance', (v) => v?.data || []) || [],
    sessions: take(sessions, 'sessions', (v) => v?.data || []) || [],
    missing,
  };
}

/** Lighter variant for the dashboard: payments in a window plus contract totals. */
export async function loadDashboardAnalytics({ fromDate, toDate } = {}) {
  const [tx, contractStats] = await Promise.allSettled([
    fetchAllPages(apiGetTransactions, { maxPages: 4, from_date: fromDate, to_date: toDate }),
    apiGetContractStats(),
  ]);
  return {
    transactions: tx.status === 'fulfilled' ? tx.value.rows : [],
    contractStats: contractStats.status === 'fulfilled' ? (unwrapData(contractStats.value) || {}) : {},
    failed: tx.status !== 'fulfilled',
  };
}
