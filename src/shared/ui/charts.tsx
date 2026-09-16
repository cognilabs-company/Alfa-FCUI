// @ts-nocheck
import React from 'react';

/**
 * Small SVG chart kit for the analytics screens.
 *
 * Marks follow one spec across every chart: columns are capped at 24px with a
 * 4px rounded data-end, stacked segments are separated by a 2px surface gap,
 * lines are 2px with an 8px end marker, area fills are a 10% wash. Series
 * colours come from the --viz-* tokens (validated for both themes), and text
 * always wears text tokens — never the series colour.
 */

/** Width of an element, tracked so charts can lay out in real pixels (crisp text). */
export function useChartWidth(ref, fallback = 560) {
  const [w, setW] = React.useState(fallback);
  React.useLayoutEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setW(next);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const niceStep = (v) => {
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
};

/** Round axis top: every gridline lands on a clean number (0 / 5 mln / 10 mln). */
const niceMax = (max, ticks = 3) => {
  if (!(max > 0)) return 1;
  let step = niceStep(max / ticks);
  while (step * ticks < max) step = niceStep(step * 1.5);
  return step * ticks;
};

const ticksOf = (max, count = 3) => Array.from({ length: count + 1 }, (_, i) => (max / count) * i);

function Tooltip({ x, width, children, align = 'auto' }) {
  const left = align === 'auto' ? Math.min(Math.max(x, 70), Math.max(width - 70, 70)) : x;
  return (
    <div className="chart-tip" style={{ left, transform: 'translate(-50%, -100%)' }}>
      {children}
    </div>
  );
}

/**
 * Columns — magnitude over an ordered axis. One series by default; pass
 * `series` to stack (payment sources, statuses…).
 */
export function Columns({
  data, height = 190, format = (v) => v, color = 'var(--viz-accent)',
  series = null, grouped = false, labelEvery = 1, emphasisLast = false, onSelect,
}) {
  const wrapRef = React.useRef(null);
  const width = useChartWidth(wrapRef);
  const [hover, setHover] = React.useState(null);

  const padL = 46, padR = 8, padT = 12, padB = 22;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(40, height - padT - padB);
  const totals = data.map(d => (series ? series.reduce((s, sr) => s + (Number(d.parts?.[sr.id]) || 0), 0) : Number(d.value) || 0));
  // Grouped bars stand side by side, so the axis follows the tallest single bar.
  const peak = grouped && series
    ? Math.max(...data.flatMap(d => series.map(sr => Number(d.parts?.[sr.id]) || 0)), 0)
    : Math.max(...totals, 0);
  const max = niceMax(peak);
  const band = plotW / Math.max(data.length, 1);
  const groupW = Math.min(24 * (series?.length || 1) + 4 * ((series?.length || 1) - 1), Math.max(8, band - 10));
  const barW = grouped && series
    ? Math.max(3, (groupW - 3 * (series.length - 1)) / series.length)
    : Math.min(24, Math.max(4, band - 10));
  const y = (v) => padT + plotH - (v / max) * plotH;

  return (
    <div className="chart" ref={wrapRef} style={{ height }}>
      <svg width={width} height={height} role="img">
        {ticksOf(max).map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className="chart-grid"/>
            <text x={padL - 8} y={y(v) + 4} className="chart-axis" textAnchor="end">{format(v, true)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + band * i + (band - (grouped && series ? groupW : barW)) / 2;
          const dim = emphasisLast && i !== data.length - 1;
          if (series && grouped) {
            return (
              <g key={i}>
                {series.map((sr, k) => {
                  const v = Number(d.parts?.[sr.id]) || 0;
                  const h = (v / max) * plotH;
                  return (
                    <rect key={sr.id} x={x + k * (barW + 3)} y={y(v)} width={barW} height={Math.max(h, v > 0 ? 2 : 0)} rx={4}
                      fill={sr.color} opacity={hover == null || hover === i ? 1 : 0.45}/>
                  );
                })}
              </g>
            );
          }
          if (series) {
            let acc = 0;
            return (
              <g key={i}>
                {series.map((sr) => {
                  const v = Number(d.parts?.[sr.id]) || 0;
                  if (v <= 0) return null;
                  const h = (v / max) * plotH;
                  const top = y(acc + v);
                  acc += v;
                  const isTop = acc >= totals[i] - 0.001;
                  return (
                    <rect key={sr.id} x={x} y={top} width={barW} height={Math.max(h - 2, 1)}
                      rx={isTop ? 4 : 0} fill={sr.color} opacity={hover == null || hover === i ? 1 : 0.45}/>
                  );
                })}
              </g>
            );
          }
          const v = totals[i];
          const h = (v / max) * plotH;
          return (
            <rect key={i} x={x} y={y(v)} width={barW} height={Math.max(h, v > 0 ? 2 : 0)} rx={4}
              fill={dim ? 'var(--viz-dim)' : color} opacity={hover == null || hover === i ? 1 : 0.55}/>
          );
        })}
        {data.map((d, i) => (i % labelEvery === 0 ? (
          <text key={'l' + i} x={padL + band * i + band / 2} y={height - 6} className="chart-axis" textAnchor="middle">{d.label}</text>
        ) : null))}
        {data.map((d, i) => (
          <rect key={'h' + i} x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent"
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(data[i], i)}/>
        ))}
      </svg>
      {hover != null && (
        <Tooltip x={padL + band * hover + band / 2} width={width}>
          <b>{data[hover].full || data[hover].label}</b>
          {series
            ? series.map(sr => {
              const v = Number(data[hover].parts?.[sr.id]) || 0;
              if (!v && !grouped) return null;
              return <span key={sr.id}><i style={{ background: sr.color }}/>{sr.label}<b>{format(v)}</b></span>;
            })
            : <span><b>{format(totals[hover])}</b>{data[hover].sub ? <small>{data[hover].sub}</small> : null}</span>}
          {series && !grouped && <span className="tip-total">{'Σ'}<b>{format(totals[hover])}</b></span>}
          {grouped && data[hover].sub ? <span className="tip-total">{data[hover].sub}</span> : null}
        </Tooltip>
      )}
    </div>
  );
}

/** Trend — a single series over time: 2px line, 10% wash, crosshair on hover. */
export function Trend({ data, height = 180, format = (v) => v, color = 'var(--viz-accent)', labelEvery = 6, max: maxProp }) {
  const wrapRef = React.useRef(null);
  const width = useChartWidth(wrapRef);
  const [hover, setHover] = React.useState(null);

  const padL = 46, padR = 10, padT = 12, padB = 22;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(40, height - padT - padB);
  const values = data.map(d => Number(d.value) || 0);
  const max = maxProp || niceMax(Math.max(...values, 0));
  const step = plotW / Math.max(data.length - 1, 1);
  const x = (i) => padL + step * i;
  const y = (v) => padT + plotH - (v / max) * plotH;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${x(values.length - 1)},${padT + plotH} L${padL},${padT + plotH} Z`;
  const last = values.length - 1;

  return (
    <div className="chart" ref={wrapRef} style={{ height }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const i = Math.round((e.clientX - rect.left - padL) / step);
        setHover(Math.max(0, Math.min(values.length - 1, i)));
      }}>
      <svg width={width} height={height} role="img">
        {/* a fixed ceiling (percent) divides into quarters; an auto one into thirds */}
        {ticksOf(max, maxProp ? 4 : 3).map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className="chart-grid"/>
            <text x={padL - 8} y={y(v) + 4} className="chart-axis" textAnchor="end">{format(v, true)}</text>
          </g>
        ))}
        <path d={area} fill={color} opacity={0.1}/>
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
        {values.length > 0 && <circle cx={x(last)} cy={y(values[last])} r={4} fill={color} stroke="var(--surface)" strokeWidth={2}/>}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} className="chart-cross"/>
            <circle cx={x(hover)} cy={y(values[hover])} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2}/>
          </g>
        )}
        {data.map((d, i) => (i % labelEvery === 0 || i === last ? (
          <text key={i} x={x(i)} y={height - 6} className="chart-axis"
            textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>{d.label}</text>
        ) : null))}
      </svg>
      {hover != null && (
        <Tooltip x={x(hover)} width={width}>
          <b>{data[hover].full || data[hover].label}</b>
          <span><b>{format(values[hover])}</b></span>
        </Tooltip>
      )}
    </div>
  );
}

/** Horizontal bars — ranked magnitude with long labels (groups, buckets, top lists). */
export function BarList({ items, format = (v) => v, color = 'var(--viz-accent)', max: maxProp, onSelect }) {
  const max = maxProp || Math.max(...items.map(i => Number(i.value) || 0), 1);
  return (
    <div className="bar-list">
      {items.map((it, i) => {
        const v = Number(it.value) || 0;
        const pct = Math.max((v / max) * 100, v > 0 ? 1.5 : 0);
        const Tag = onSelect ? 'button' : 'div';
        return (
          <Tag key={it.key ?? i} className="bar-row" type={onSelect ? 'button' : undefined}
            onClick={onSelect ? () => onSelect(it, i) : undefined}>
            <span className="bar-label" title={it.label}>{it.label}</span>
            <span className="bar-track">
              <i style={{ width: pct + '%', background: it.color || color, animationDelay: `${i * 60}ms` }}/>
            </span>
            <span className="bar-value">{format(v)}{it.sub ? <small>{it.sub}</small> : null}</span>
          </Tag>
        );
      })}
    </div>
  );
}

/** Donut — part-to-whole for a handful of slices; the legend carries the values. */
export function Donut({ items, format = (v) => v, size = 148, centerLabel, centerValue }) {
  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const r = size / 2 - 10;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={14}/>
        {total > 0 && items.map((it) => {
          const v = Number(it.value) || 0;
          if (v <= 0) return null;
          const len = (v / total) * C;
          const el = (
            <circle key={it.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color} strokeWidth={14}
              strokeDasharray={`${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}/>
          );
          offset += len;
          return el;
        })}
        {centerValue != null && (
          <>
            <text x={size / 2} y={size / 2 - 2} className="donut-value" textAnchor="middle">{centerValue}</text>
            <text x={size / 2} y={size / 2 + 16} className="donut-label" textAnchor="middle">{centerLabel}</text>
          </>
        )}
      </svg>
      <div className="chart-legend">
        {items.map(it => (
          <div key={it.id}>
            <i style={{ background: it.color }}/>
            <span>{it.label}</span>
            <b>{format(Number(it.value) || 0)}</b>
            {total > 0 && <small>{Math.round(((Number(it.value) || 0) / total) * 100)}%</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend for multi-series charts — always present, values included. */
export function ChartLegend({ items, format = (v) => v, inline = false }) {
  return (
    <div className={'chart-legend' + (inline ? ' inline' : '')}>
      {items.map(it => (
        <div key={it.id}>
          <i style={{ background: it.color }}/>
          <span>{it.label}</span>
          {it.value != null && <b>{format(it.value)}</b>}
        </div>
      ))}
    </div>
  );
}

/** Meter — one ratio against a limit (collection rate, capacity). */
export function Meter({ value, max, format = (v) => v, tone = 'accent', label, hint }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <b>{pct}%</b>
      </div>
      <div className={'meter-track tone-' + tone}><i style={{ width: pct + '%' }}/></div>
      <div className="meter-foot">
        <span>{format(value)}</span>
        <span>{hint ?? format(max)}</span>
      </div>
    </div>
  );
}
