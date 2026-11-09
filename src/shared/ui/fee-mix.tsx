// @ts-nocheck
import React from 'react';
import { fmt } from '@/shared/lib/format';

const num = (v) => Number(v) || 0;

/**
 * A monthly-income total taken apart by fee (by_fee of GET
 * /reports/fee-distribution): "300 000 × 134 … 40 200 000", one line a fee,
 * so a total that is not count × one fee explains itself. For dark cards.
 */
export function FeeMix({ fees, title }) {
  if (!fees?.length) return null;
  return (
    <div className="fee-mix" title={title}>
      {fees.map(f => (
        <div key={f.fee}>
          <span>{fmt.format(num(f.fee))} × {num(f.student_count)}</span>
          <b>{fmt.format(Math.round(num(f.subtotal)))}</b>
        </div>
      ))}
    </div>
  );
}
