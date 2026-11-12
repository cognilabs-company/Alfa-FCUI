// @ts-nocheck
import React from 'react';
import { Icon } from '@/shared/ui/icons';
import { useT } from '@/shared/i18n/lang';
import { apiGetStudentPayments } from '@/shared/api';
import { fmt } from '@/shared/lib/format';
import { STATUS_TONE } from '@/shared/lib/expenses';
import { ExpenseStatusBadge, useMoney } from '@/widgets/expenses';

const PAGE_SIZE = 500; // the server's maximum
const num = (v) => Number(v) || 0;
const byName = (a, b) => String(a.student_name || '').localeCompare(String(b.student_name || ''));

/** Every page of GET /reports/student-payments: a group's counts need all its students. */
async function loadAll(params) {
  const items = [];
  let page = 1, pages = 1;
  do {
    const res = await apiGetStudentPayments({ ...params, page, page_size: PAGE_SIZE });
    items.push(...(res?.data?.items || []));
    pages = num(res?.data?.pagination?.total_pages) || 1;
    page += 1;
  } while (page <= pages);
  return items;
}

/** Students of the response per group, the groups with the most unpaid first. */
function groupStudents(items, noGroup) {
  const groups = new Map();
  items.forEach(s => {
    const id = s.group_id ?? 'none';
    if (!groups.has(id)) groups.set(id, { id, name: s.group_name || noGroup, total: 0, debt: 0, paid: 0, partial: [], unpaid: [] });
    const g = groups.get(id);
    g.total += 1;
    g.debt += num(s.debt);
    const status = s.status || 'unpaid';
    if (status === 'paid') g.paid += 1;
    else if (status === 'partial') g.partial.push(s);
    else g.unpaid.push(s);
  });
  return [...groups.values()].sort((a, b) => (
    b.unpaid.length - a.unpaid.length || b.partial.length - a.partial.length || a.name.localeCompare(b.name)
  ));
}

/**
 * Reports → To'lovlar, by group: in each group how many students paid, paid in
 * part and did not pay, for the same span as the list. A group opens to the
 * names of those who still owe.
 */
export function PaymentsByGroup({ fromDate, toDate, groupId, refresh }) {
  const I = Icon;
  const { t } = useT();
  const money = useMoney();
  const [items, setItems] = React.useState(null);
  const [error, setError] = React.useState('');
  const [open, setOpen] = React.useState(() => new Set());

  React.useEffect(() => {
    let alive = true;
    setItems(null);
    setError('');
    setOpen(new Set());
    const params = { to_date: toDate };
    if (fromDate) params.from_date = fromDate;
    if (groupId) params.group_id = groupId;
    loadAll(params)
      .then(res => alive && setItems(res))
      .catch(e => { if (alive) { setItems([]); setError(e.message); } });
    return () => { alive = false; };
  }, [fromDate, toDate, groupId, refresh]);

  function toggle(id) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpen(next);
  }

  if (items === null) return <div className="empty loading" style={{ padding: 40 }}>{t('loading')}</div>;
  if (error) return <div className="alert danger"><I.AlertTriangle size={16}/> <span>{error}</span></div>;
  if (items.length === 0) return <div className="card empty" style={{ padding: 40 }}>{t('sp_empty')}</div>;

  return (
    <div className="att-tree">
      {groupStudents(items, t('sp_no_group')).map(g => {
        const isOpen = open.has(g.id);
        const owing = [...[...g.unpaid].sort(byName), ...[...g.partial].sort(byName)];
        return (
          <div key={g.id} className={'att-group' + (isOpen ? ' open' : '')}>
            <button type="button" className="att-row sl" aria-expanded={isOpen} onClick={() => toggle(g.id)}
              data-sl={g.unpaid.length > 0 ? 'danger' : g.partial.length > 0 ? 'warning' : 'success'}>
              <I.ChevronRight size={15} className="att-caret"/>
              <div className="att-main">
                <b>{g.name}</b>
                <small>{g.total} {t('nav_students').toLowerCase()} · {t('sp_debt')}: {money(g.debt)}</small>
              </div>
              <div className="sp-group-counts">
                <span className="chip success">{t('sp_tab_paid')}: {g.paid}</span>
                {g.partial.length > 0 && <span className="chip warning">{t('exp_status_partial')}: {g.partial.length}</span>}
                <span className="chip danger">{t('exp_status_unpaid')}: {g.unpaid.length}</span>
              </div>
            </button>
            {isOpen && (
              <div className="att-body">
                {owing.length === 0
                  ? <div className="att-note"><I.CheckCircle size={14} color="var(--success)"/> {t('sp_group_all_paid')}</div>
                  : (
                    <div className="att-students sp-group-students">
                      {owing.map(s => (
                        <div key={s.student_id} className="att-student sp-group-student sl" data-sl={STATUS_TONE[s.status || 'unpaid'] || 'danger'}>
                          <span className="name">{s.student_name || `#${s.student_id}`}</span>
                          <span className="sp-group-owes">
                            <span className="money" style={{ color: 'var(--danger)' }}>{fmt.format(Math.round(num(s.debt)))}</span>
                            <ExpenseStatusBadge status={s.status || 'unpaid'}/>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
