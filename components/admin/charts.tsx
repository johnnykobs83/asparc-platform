'use client';

import { useState } from 'react';

/**
 * Single-series charts (one hue: ASPARC royal). Per the dataviz method:
 * thin marks with rounded data-ends anchored to the baseline, recessive grid,
 * a hover tooltip on every mark, text in ink tokens (never the series colour),
 * and a table alternative via `aria-label`/visually-hidden list.
 */

export function ColumnChart({ data, height = 180, valueLabel = 'enquiries' }: { data: { label: string; value: number; sub?: string }[]; height?: number; valueLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const W = 100 / data.length;

  return (
    <figure className="relative">
      <div className="relative" style={{ height }}>
        {/* grid */}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="absolute -top-2 right-full mr-2 text-[10px] tabular-nums text-muted">{t}</span>
          </div>
        ))}
        <div className="absolute inset-0 ml-0 flex items-end">
          {data.map((d, i) => (
            <div
              key={d.label}
              className="relative flex h-full items-end justify-center"
              style={{ width: `${W}%` }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${d.value} ${valueLabel}`}
            >
              {hover === i && <div className="absolute inset-y-0 w-full rounded bg-mist" aria-hidden="true" />}
              <div
                className="relative rounded-t-[4px] bg-royal transition-opacity"
                style={{ height: d.value ? `${Math.max(2, (d.value / top) * 100)}%` : 0, width: 'max(3px, 62%)', maxWidth: 22, opacity: hover === null || hover === i ? 1 : 0.55 }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-y-1 whitespace-nowrap rounded-md bg-charcoal px-2.5 py-1.5 text-xs text-white shadow-lg">
                  <span className="font-semibold tabular-nums">{d.value}</span> {valueLabel}
                  <span className="block text-[10px] text-white/70">{d.sub ?? d.label}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex text-[10px] text-muted">
        {data.map((d, i) => (
          <span key={d.label} className="text-center" style={{ width: `${W}%` }}>
            {i % Math.ceil(data.length / 8) === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}

export function BarList({ data, valueLabel = 'leads' }: { data: { label: string; value: number }[]; valueLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length) return <p className="py-6 text-center text-sm text-muted">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={d.label} className="relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-charcoal">{d.label}</span>
            <span className="tabular-nums font-medium text-charcoal">{d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-mist">
            <div className="h-2 rounded-r-[4px] rounded-l-full bg-royal transition-opacity" style={{ width: `${(d.value / max) * 100}%`, opacity: hover === null || hover === i ? 1 : 0.55 }} />
          </div>
          {hover === i && (
            <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 rounded-md bg-charcoal px-2.5 py-1.5 text-xs text-white shadow-lg">
              {d.value} {valueLabel} · {total ? Math.round((d.value / total) * 100) : 0}%
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.pow(10, Math.floor(Math.log10(max)));
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1 && out.length < 7; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}
