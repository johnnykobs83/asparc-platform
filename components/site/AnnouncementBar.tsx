'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/** One offer or announcement in the bar above the header. Everything in it comes from real prices and terms. */
export interface Deal {
  key: string;
  href: string;
  /** Small label at the start, e.g. "Now enrolling" or "Intro special". */
  tag: string;
  title: string;
  /** e.g. "Ages 8–16 · Term 1 2027". */
  detail?: string;
  price?: string;
  was?: string;
  /** e.g. "Save $100" – only when there really is a standard price. */
  save?: string;
  /** Short honest condition, e.g. "First 10 athletes". */
  note?: string;
  cta: string;
}

const ROTATE_MS = 7000;

/**
 * The deal bar above the header. With more than one deal it rotates every 7 seconds
 * (paused while hovered or focused, and not at all for people who prefer reduced
 * motion); a dot for each lets people switch themselves.
 */
export function AnnouncementBar({ items }: { items: Deal[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  useEffect(() => {
    if (items.length < 2 || paused || still) return;
    const t = window.setTimeout(() => setI((x) => (x + 1) % items.length), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [items.length, paused, still, i]);
  if (!items.length) return null;
  const d = items[i % items.length];
  return (
    <div
      className="relative overflow-hidden bg-[linear-gradient(100deg,#0e3c75_0%,#14519c_45%,#1a5fb4_70%,#14519c_100%)] text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* sweeping shine */}
      <span className="deal-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/15 to-transparent" aria-hidden="true" />
      <Link href={d.href} className="group relative block" aria-live="polite">
        <span key={d.key} className="deal-in container-x flex min-h-[48px] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2 pr-10 text-center text-sm sm:pr-16">
          <span className="inline-flex items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[0.16em] text-sky-100">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
            </span>
            {d.tag}
          </span>
          <span className="font-semibold">{d.title}</span>
          {d.detail && <span className="hidden text-white/80 md:inline">{d.detail}</span>}
          {d.price && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="font-display text-xl font-extrabold leading-none">{d.price}</span>
              {d.was && <s className="text-white/55">{d.was}</s>}
            </span>
          )}
          {d.save && (
            <span className="deal-pop rounded-full bg-[#D9822B] px-2.5 py-0.5 font-display text-[13px] font-bold uppercase tracking-wider text-white shadow-[0_0_0_3px_rgba(217,130,43,0.25)]">
              {d.save}
            </span>
          )}
          {d.note && <span className="hidden text-xs font-semibold uppercase tracking-wider text-sky-100 sm:inline">{d.note}</span>}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 font-display text-[13px] font-bold uppercase tracking-wider text-royal shadow-sm transition group-hover:bg-sky-100">
            {d.cta}
            <span className="deal-nudge inline-block" aria-hidden="true">→</span>
          </span>
        </span>
      </Link>
      {items.length > 1 && (
        <>
          <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 gap-1.5 sm:flex">
            {items.map((x, k) => (
              <button
                key={x.key}
                type="button"
                aria-label={`Show offer ${k + 1} of ${items.length}`}
                aria-current={k === i}
                onClick={() => setI(k)}
                className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
          {/* fills while this deal is shown */}
          {!paused && !still && (
            <span key={`bar-${i}`} className="deal-fill absolute bottom-0 left-0 h-[2px] w-full bg-white/50" style={{ ['--deal-ms' as string]: `${ROTATE_MS}ms` }} aria-hidden="true" />
          )}
        </>
      )}
    </div>
  );
}
