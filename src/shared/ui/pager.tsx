// @ts-nocheck
import React from 'react';
import { Icon } from './icons';

/**
 * Shared pagination bar: "11 — 20 / 134" on the left, numbered pages on the right.
 * Renders nothing when there is a single page and no count to show.
 */
export function Pager({ page, totalPages, onPage, total, pageSize, detached = false }) {
  const pages = Math.max(1, totalPages || 1);
  if (pages <= 1 && !total) return null;

  // window of up to 5 page numbers around the current page
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = [];
  for (let p = start; p <= Math.min(pages, start + 4); p++) nums.push(p);

  const range = total != null && pageSize
    ? (total === 0 ? '0' : `${(page - 1) * pageSize + 1} — ${Math.min(page * pageSize, total)} / ${total}`)
    : `${page} / ${pages}`;

  return (
    <div className={'pager' + (detached ? ' detached' : '')}>
      <span>{range}</span>
      {pages > 1 && (
        <div className="pager-pages">
          <button className="btn sm ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <Icon.ChevronLeft size={15}/>
          </button>
          {nums.map(p => (
            <button key={p} className={'btn sm ' + (p === page ? 'dark' : 'ghost')} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>
              {p}
            </button>
          ))}
          <button className="btn sm ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <Icon.ChevronRight size={15}/>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Viewport-aware position for a row action menu anchored to a trigger button.
 * Opens below-right-aligned; flips above when it would run off the bottom and
 * clamps horizontally so it never leaves the screen.
 */
export function menuPosition(triggerEl, itemCount = 3, width = 190) {
  const r = triggerEl.getBoundingClientRect();
  const height = 12 + itemCount * 38;
  const x = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
  const below = r.bottom + 6;
  const y = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
  return { x, y };
}
