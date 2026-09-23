// @ts-nocheck
/**
 * On phones every table row becomes a card: each cell shows its column name
 * beside the value (see the `@media (max-width: 640px)` table block in the
 * stylesheet). The labels come from the table's own header, so pages don't
 * have to repeat them — this walks the DOM and stamps them on:
 *
 *   data-label    the matching <th> text
 *   .cell-lead    a leading unlabelled cell (the row checkbox)
 *   .cell-main    the first real cell — the card's title line
 *   .cell-actions a trailing unlabelled cell (the row menu)
 *
 * Runs once after every render batch; cheap because tables hold tens of rows.
 */

const LABELLED = 'data-label';

function labelTable(table) {
  const head = table.tHead;
  if (!head || table.classList.contains('performance-table')) return;
  const heads = [...(head.rows[0]?.cells || [])].map(th => th.textContent.trim());
  const last = heads.length - 1;

  for (const row of table.tBodies[0]?.rows || []) {
    const cells = [...row.cells];
    if (cells.length === 1) continue;           // "nothing found" rows span everything
    let mainDone = false;
    cells.forEach((cell, i) => {
      // a cell can span columns; label it with the first column it covers
      const label = heads[i] ?? '';
      if (cell.getAttribute(LABELLED) !== label) cell.setAttribute(LABELLED, label);
      const lead = i === 0 && !label && !!cell.querySelector('input[type="checkbox"]');
      const actions = i === last && !label && !lead;
      cell.classList.toggle('cell-lead', lead);
      cell.classList.toggle('cell-actions', actions);
      const main = !lead && !actions && !mainDone;
      if (main) mainDone = true;
      cell.classList.toggle('cell-main', main);
    });
  }
}

export function startTableLabels(root = document) {
  if (typeof MutationObserver === 'undefined') return () => {};
  let queued = false;
  const run = () => {
    queued = false;
    root.querySelectorAll('table.table').forEach(labelTable);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root.body || root, { childList: true, subtree: true });
  schedule();
  return () => observer.disconnect();
}
