'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * The thin bar above the header. With more than one announcement it rotates every
 * 7 seconds (paused while hovered or focused, and not at all for people who prefer
 * reduced motion); a dot for each lets people switch themselves.
 */
export function AnnouncementBar({ items }: { items: { key: string; href: string; content: ReactNode }[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (items.length < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % items.length), 7000);
    return () => window.clearInterval(t);
  }, [items.length, paused]);
  if (!items.length) return null;
  const item = items[i % items.length];
  return (
    <div className="relative bg-royal text-white" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Link href={item.href} className="group block" aria-live="polite">
        <span className="container-x flex min-h-[44px] flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-sm">{item.content}</span>
      </Link>
      {items.length > 1 && (
        <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 gap-1.5 sm:flex">
          {items.map((x, k) => (
            <button key={x.key} type="button" aria-label={`Show announcement ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} className={`h-2 w-2 rounded-full ${k === i ? 'bg-white' : 'bg-white/40'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
