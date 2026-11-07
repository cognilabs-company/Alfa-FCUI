// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { Stat } from '@/shared/ui/stat';
import { Pager } from '@/shared/ui/pager';
import { SearchableGroupSelect } from '@/shared/ui/controls';
import { apiGetStudentPayments } from '@/shared/api';
import { avatarColor } from '@/shared/lib/avatar';
import { fmt, fmtMoneyRoll, monthShort, todayISO } from '@/shared/lib/format';
import { periodLabel } from '@/shared/lib/selected-month';
import { PaymentsByGroup } from './payments-by-group';
import { ExpenseStatusBadge, useMoney } from '@/widgets/expenses';

const PAGE_SIZE = 50;
const num = (v) => Number(v) || 0;

/** "2026-07" → "Iyl 26" */
export function monthTag(label, lang) {
  const m = String(label || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${monthShort(Number(m[2]) - 1, lang)} ${m[1].slice(2)}` : label;
}

/**
 * Reports → O'quvchilar to'lovi (GET /reports/student-payments): every student
 * with what they owed, paid and still owe, by month, with the totals above —
 * for the months of the Reports period, or since each contract began.
 */
export function StudentPaymentsTab({ period, groups = [], initialStatus = 'all' }) {
  const I = Icon;
  const { t, tp, lang } = useT();
  const money = useMoney();
  // "since the contract began": only to_date is sent, the server starts each student at their contract
  const [allTime, setAllTime] = React.useState(false);
  const { from_date, to_date } = period;
  const [groupId, setGroupId] = React.useState('');
  const [status, setStatus] = React.useState(initialStatus);
  // the student list, or the same students counted per group
  const [view, setView] = React.useState('list');
  const listStatus = view === 'list' ? status : 'all';
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [unsupported, setUnsupported] = React.useState(false);

  React.useEffect(() => { setPage(1); }, [allTime, from_date, to_date, groupId, listStatus]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const params = { page, page_size: PAGE_SIZE, to_date: allTime ? todayISO() : to_date };
    if (!allTime) params.from_date = from_date;
    if (groupId) params.group_id = groupId;
    if (listStatus !== 'all') params.status = listStatus;
    apiGetStudentPayments(params)
      .then(res => { if (alive) { setData(res?.data || null); setUnsupported(false); } })
      .catch(e => {
        if (!alive) return;
        setData(null);
        if (e.status === 404) setUnsupported(true);
        else setError(e.message);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [allTime, from_date, to_date, groupId, listStatus, page, period.version]);

  if (unsupported) {
    return (
      <div className="card empty" style={{ padding: 48, display: 'grid', gap: 10, placeItems: 'center' }}>
        <I.Wrench size={28} color="var(--muted)"/>
        <div style={{ fontWeight: 700 }}>{t('ps_unsupported')}</div>
      </div>
    );
  }

  const items = data?.items || [];
  const sum = data?.summary || {};
  const pg = data?.pagination || {};
  // the server's label is raw dates ("2026-09-01 – 2026-09-30"), so the span is named here
  const spanLabel = allTime ? t('sp_since_contract') : periodLabel(period, lang);
  const statusTabs = [
    { key: 'all', label: t('all'), icon: I.Stack },
    { key: 'unpaid', label: t('sp_tab_debtors'), icon: I.AlertCircle },
    { key: 'partial', label: t('exp_status_partial'), icon: I.Hourglass },
    { key: 'paid', label: t('sp_tab_paid'), icon: I.CheckCircle },
  ];

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="pill-row">
          <button type="button" className={'pill' + (!allTime ? ' active' : '')} onClick={() => setAllTime(false)}>
            <I.Calendar size={13}/> {periodLabel(period, lang)}
          </button>
          <button type="button" className={'pill' + (allTime ? ' active' : '')} onClick={() => setAllTime(true)}>{t('sp_since_contract')}</button>
        </div>
        <SearchableGroupSelect value={groupId} onChange={v => setGroupId(v === 'all' ? '' : v)} groups={groups} placeholder={t('students_all_groups')}/>
        {(allTime || groupId || listStatus !== 'all') && (
          <button className="btn sm ghost" onClick={() => { setAllTime(false); setGroupId(''); setStatus('all'); }}>
            <I.X size={14}/> {t('clear_filters')}
          </button>
        )}
        {loading && data && <span className="toolbar-meta">{t('loading')}</span>}
      </div>

      {error && <div className="alert danger" style={{ marginBottom: 14 }}><I.AlertTriangle size={16}/> <span>{error}</span></div>}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <Stat feature label={t('sp_students')} icon={I.Users} value={data ? num(sum.students_total) : '—'}
          sub={data ? `${num(sum.fully_paid_count)} ${t('sp_tab_paid').toLowerCase()} · ${num(sum.partial_count)} ${t('exp_status_partial').toLowerCase()} · ${num(sum.unpaid_count)} ${t('exp_status_unpaid').toLowerCase()}` : null}/>
        <Stat label={t('sp_expected_total')} icon={I.Receipt} value={data ? num(sum.expected_total) : '—'} format={fmtMoneyRoll} unit={data ? t('currency') : undefined}
          sub={data ? `${money(sum.expected_total)} · ${spanLabel}` : null}/>
        <Stat label={t('exp_totals_paid')} tone="success" icon={I.HandCoins} value={data ? num(sum.paid_total) : '—'} format={fmtMoneyRoll} unit={data ? t('currency') : undefined}
          sub={data ? money(sum.paid_total) : null}>
          {/* students on a contract and pending ones, apart, when pending students paid anything */}
          {data && num(sum.paid_pending) > 0 && (
            <div className="stat-sub">{t('tx_stat_official')}: {money(sum.paid_official)} · {t('tx_stat_pending')}: {money(sum.paid_pending)}</div>
          )}
        </Stat>
        <Stat label={t('rpt_total_debt')} tone="danger" icon={I.AlertCircle} value={data ? num(sum.debt_total) : '—'} format={fmtMoneyRoll} unit={data ? t('currency') : undefined}
          sub={data ? `${money(sum.debt_total)} · ${spanLabel}` : null}/>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            <I.Student size={14}/> {t('sp_view_list')}
          </button>
          <button type="button" className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}>
            <I.UsersFour size={14}/> {t('sp_view_groups')}
          </button>
        </div>
        {view === 'list' && (
          <div className="seg">
            {statusTabs.map(s => (
              <button key={s.key} type="button" className={status === s.key ? 'active' : ''} onClick={() => setStatus(s.key)}>
                <s.icon size={14}/> {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'groups' ? (
        <PaymentsByGroup fromDate={allTime ? null : from_date} toDate={allTime ? todayISO() : to_date} groupId={groupId} refresh={period.version}/>
      ) : (
      <div className="table-wrap">
        {loading && !data ? (
          <div className="empty loading" style={{ padding: 40 }}>{t('loading')}</div>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('rpt_payers_col_student')}</th>
                  <th>{t('rpt_payers_col_group')}</th>
                  <th style={{ textAlign: 'right' }}>{t('sp_monthly_fee')}</th>
                  <th>{t('sp_months')}</th>
                  <th style={{ textAlign: 'right' }}>{t('exp_totals_paid')}</th>
                  <th style={{ textAlign: 'right' }}>{t('sp_debt')}</th>
                  <th>{t('students_col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr className="static"><td colSpan={7} className="empty-cell">{t('sp_empty')}</td></tr>
                )}
                {items.map(s => {
                  const name = s.student_name || `#${s.student_id}`;
                  const total = num(s.months_total);
                  const paidPct = total > 0 ? Math.round((num(s.months_paid) / total) * 100) : 0;
                  const unpaid = s.unpaid_month_labels || [];
                  return (
                    <tr key={s.student_id} className="static">
                      <td>
                        <div className="row-name">
                          <div className="avatar" style={{ background: avatarColor(num(s.student_id)) }}>
                            {name.split(/\s+/).slice(0, 2).map(w => w[0]).join('')}
                          </div>
                          <div className="meta">
                            <span className="name">{name}</span>
                            <span className="sub">{s.contract_number || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>{s.group_name || '—'}</td>
                      <td className="money" style={{ textAlign: 'right' }}>{fmt.format(Math.round(num(s.monthly_fee)))}</td>
                      <td style={{ minWidth: 150 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12.5, fontWeight: 700 }}>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{num(s.months_paid)} / {total}</span>
                          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{tp('sp_months_sfx', total)}</span>
                        </div>
                        <div className={'progress' + (paidPct >= 100 ? ' green' : paidPct > 0 ? ' gold' : ' red')} style={{ marginTop: 5 }}>
                          <span style={{ width: `${Math.max(paidPct, total > 0 ? 3 : 0)}%` }}/>
                        </div>
                        {unpaid.length > 0 && (
                          <div className="sp-months" title={unpaid.map(l => monthTag(l, lang)).join(', ')}>
                            {unpaid.slice(0, 3).map(l => <span key={l} className="chip danger">{monthTag(l, lang)}</span>)}
                            {unpaid.length > 3 && <span className="chip">+{unpaid.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="money" style={{ textAlign: 'right', color: 'var(--success)' }}>{fmt.format(Math.round(num(s.paid_total)))}</td>
                      <td className="money" style={{ textAlign: 'right', color: num(s.debt) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt.format(Math.round(num(s.debt)))}</td>
                      <td><ExpenseStatusBadge status={s.status || 'unpaid'}/></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} totalPages={num(pg.total_pages) || 1} total={num(pg.total)} pageSize={PAGE_SIZE} onPage={setPage}/>
      </div>
      )}
    </div>
  );
}
