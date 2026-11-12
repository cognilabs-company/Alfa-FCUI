// @ts-nocheck
import React from 'react';
import { Icon } from './icons';

/**
 * Status badge: tinted pill with a meaningful filled icon.
 * tone: success | warning | danger | info | accent | neutral
 */
export function Badge({ tone = 'neutral', icon: Ic, children, live = false, title, className }) {
  return (
    <span className={'badge ' + tone + (live ? ' live' : '') + (className ? ' ' + className : '')} title={title}>
      {Ic && <Ic size={15} weight="fill"/>}
      <span>{children}</span>
    </span>
  );
}

const I = Icon;

export function studentStatusBadge(status, t) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return <Badge tone="success" icon={I.CheckCircle}>{t('status_active')}</Badge>;
  if (s === 'inactive') return <Badge tone="warning" icon={I.Pause}>{t('status_inactive')}</Badge>;
  if (s === 'archived') return <Badge tone="neutral" icon={I.Archive}>{t('status_archived')}</Badge>;
  if (s === 'deleted') return <Badge tone="danger" icon={I.Prohibit}>{t('status_deleted')}</Badge>;
  return <Badge tone="neutral" icon={I.Dashed}>{status || '—'}</Badge>;
}

export function contractStatusBadge(status, t) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIVE') return <Badge tone="success" icon={I.Sealed}>{t('status_active')}</Badge>;
  if (s === 'TERMINATED') return <Badge tone="danger" icon={I.XCircle}>{t('status_terminated')}</Badge>;
  if (s === 'EXPIRED') return <Badge tone="warning" icon={I.Hourglass}>{t('status_cancelled')}</Badge>;
  if (s === 'ARCHIVED') return <Badge tone="neutral" icon={I.Archive}>{t('status_archived')}</Badge>;
  return <Badge tone="neutral" icon={I.Dashed}>{status || '—'}</Badge>;
}

export function txStatusBadge(status, t) {
  const s = String(status || '').toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'settled') return <Badge tone="success" icon={I.CheckCircle}>{t('tx_st_success')}</Badge>;
  if (s === 'pending') return <Badge tone="warning" icon={I.Hourglass}>{t('tx_st_pending')}</Badge>;
  if (s === 'unassigned') return <Badge tone="info" icon={I.Question}>{t('tx_scope_unassigned')}</Badge>;
  if (s === 'cancelled' || s === 'failed') return <Badge tone="danger" icon={I.XCircle}>{t('tx_st_cancelled')}</Badge>;
  return <Badge tone="neutral" icon={I.Dashed}>{status || '—'}</Badge>;
}

/** kind: completed | today | upcoming */
export function sessionStatusBadge(kind, t) {
  if (kind === 'completed') return <Badge tone="success" icon={I.CheckCircle}>{t('sessions_completed_chip')}</Badge>;
  if (kind === 'today') return <Badge tone="accent" icon={I.Lightning} live>{t('sessions_today_chip')}</Badge>;
  return <Badge tone="info" icon={I.CalendarCheck}>{t('sessions_upcoming_chip')}</Badge>;
}

export function attendanceBadge(status, t) {
  if (status === 'present') return <Badge tone="success" icon={I.CheckCircle}>{t('att_present')}</Badge>;
  if (status === 'late') return <Badge tone="warning" icon={I.Clock}>{t('att_late')}</Badge>;
  if (status === 'absent') return <Badge tone="danger" icon={I.XCircle}>{t('att_absent')}</Badge>;
  if (status === 'not_marked') return <Badge tone="neutral" icon={I.Dashed}>{t('att_unmarked')}</Badge>;
  return <Badge tone="neutral" icon={I.Dashed}>{status || '—'}</Badge>;
}

export function userStatusBadge(status, t) {
  return status === 'active'
    ? <Badge tone="success" icon={I.UserCheck}>{t('users_active_chip')}</Badge>
    : <Badge tone="neutral" icon={I.UserMinus}>{t('users_inactive_chip')}</Badge>;
}

export function gateBadge(allowed, t) {
  return allowed !== false
    ? <Badge tone="success" icon={I.Login}>{t('gate_allowed_chip')}</Badge>
    : <Badge tone="danger" icon={I.ShieldOff}>{t('gate_denied_chip')}</Badge>;
}

/** Visual meta for an audit action: tone + icon */
export function auditActionMeta(action) {
  const s = String(action || '').toUpperCase();
  if (s === 'CREATE') return { tone: 'success', icon: I.PlusCircle };
  if (s === 'UPDATE' || s === 'PATCH') return { tone: 'warning', icon: I.Edit };
  if (s === 'DELETE') return { tone: 'danger', icon: I.Trash };
  if (s === 'LOGIN') return { tone: 'info', icon: I.Login };
  if (s === 'CANCEL' || s === 'TERMINATE') return { tone: 'danger', icon: I.Prohibit };
  return { tone: 'neutral', icon: I.Dashed };
}

/* ------------------------------------------------------------------
 * Side-line tones: the colour of a row's left bar (data-sl). Each one
 * mirrors the tone of the badge the same row shows, so the bar and
 * the chip always agree. Values: success | warning | danger | info |
 * accent | violet | neutral.
 * ------------------------------------------------------------------ */

export function studentTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'success';
  if (s === 'inactive') return 'warning';
  if (s === 'deleted') return 'danger';
  return 'neutral';
}

export function contractTone(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ACTIVE') return 'success';
  if (s === 'TERMINATED') return 'danger';
  if (s === 'EXPIRED') return 'warning';
  return 'neutral';
}

export function txTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'settled') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'unassigned') return 'info';
  if (s === 'cancelled' || s === 'failed') return 'danger';
  return 'neutral';
}

/** kind: completed | today | upcoming */
export function sessionTone(kind) {
  if (kind === 'completed') return 'success';
  if (kind === 'today') return 'accent';
  return 'info';
}

export function attendanceTone(status) {
  if (status === 'present') return 'success';
  if (status === 'late') return 'warning';
  if (status === 'absent') return 'danger';
  return 'neutral';
}

export function userTone(status) {
  return status === 'active' ? 'success' : 'neutral';
}

export function gateTone(allowed) {
  return allowed !== false ? 'success' : 'danger';
}

/** Money direction: income green, expense red, zero neutral. */
export function moneyTone(n) {
  const v = Number(n) || 0;
  if (v > 0) return 'success';
  if (v < 0) return 'danger';
  return 'neutral';
}

/** Attendance / completion percentage: ≥85 green, ≥60 amber, below red. */
export function pctTone(pct) {
  const v = Number(pct);
  if (!Number.isFinite(v)) return 'neutral';
  if (v >= 85) return 'success';
  if (v >= 60) return 'warning';
  return 'danger';
}
