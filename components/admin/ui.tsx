'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-charcoal">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, actions, className = '', pad = true }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-line bg-white', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-charcoal">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = 'default', href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'attention' | 'muted'; href?: string }) {
  const body = (
    <div className={cx('h-full rounded-xl border p-5 transition', tone === 'attention' ? 'border-warn/30 bg-[#fff8ec]' : 'border-line bg-white', href && 'hover:border-royal')}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={cx('mt-2 font-display text-4xl font-bold leading-none', tone === 'muted' ? 'text-muted' : 'text-charcoal')}>{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? <a href={href} className="block">{body}</a> : body;
}

type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'sky';
const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-mist text-charcoal/80 border-line',
  blue: 'bg-[#e8f0fa] text-royal-800 border-royal/20',
  sky: 'bg-sky-100 text-royal-800 border-sky/40',
  green: 'bg-[#e9f7ef] text-success border-success/25',
  amber: 'bg-[#fff4e0] text-warn border-warn/25',
  red: 'bg-[#fdecea] text-danger border-danger/25',
};
export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold', BADGE[tone], className)}>{children}</span>;
}

export const STAGE_TONE: Record<string, BadgeTone> = {
  new_enquiry: 'blue',
  contacted: 'sky',
  qualified: 'green',
  booking_requested: 'amber',
  converted: 'green',
  not_proceeding: 'neutral',
};

export function Button({ children, variant = 'primary', size = 'md', className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  const v = {
    primary: 'bg-royal text-white hover:bg-royal-600',
    secondary: 'border border-line bg-white text-charcoal hover:border-royal hover:text-royal',
    ghost: 'text-royal hover:bg-mist',
    danger: 'border border-danger/30 bg-white text-danger hover:bg-[#fdecea]',
  }[variant];
  return (
    <button type="button" className={cx('inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm', v, className)} {...rest}>
      {children}
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-medium text-charcoal">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="animate-pulse rounded-xl border border-line bg-white p-10 text-center text-sm text-muted">Loading…</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-danger/25 bg-[#fdecea] px-4 py-3 text-sm text-danger">{message}</div>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <div className={cx('rounded-lg border px-4 py-3 text-sm', tone === 'warn' ? 'border-warn/30 bg-[#fff8ec] text-warn' : 'border-sky/40 bg-sky-100/60 text-royal-800')}>{children}</div>;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}

/** Searchable, sortable table. `search` returns the text a row is matched on. */
export function DataTable<T extends { id: string }>({ rows, columns, search, onRowClick, empty, filters, initialSort }: { rows: T[]; columns: Column<T>[]; search?: (row: T) => string; onRowClick?: (row: T) => void; empty?: ReactNode; filters?: ReactNode; initialSort?: { key: string; dir: 'asc' | 'desc' } }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const shown = useMemo(() => {
    let r = q && search ? rows.filter((row) => search(row).toLowerCase().includes(q.toLowerCase())) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      r = [...r].sort((a, b) => {
        const av = col.sortValue!(a);
        const bv = col.sortValue!(b);
        return (av < bv ? -1 : av > bv ? 1 : 0) * (sort!.dir === 'asc' ? 1 : -1);
      });
    }
    return r;
  }, [rows, q, search, sort, columns]);

  return (
    <div className="rounded-xl border border-line bg-white">
      {(search || filters) && (
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center">
          {search && (
            <label className="relative flex-1">
              <span className="sr-only">Search</span>
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="9" cy="9" r="6" />
                <path d="M14 14l4 4" />
              </svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="field !py-2 !pl-9 !text-sm" />
            </label>
          )}
          {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
        </div>
      )}
      {shown.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted">{empty ?? 'Nothing here yet.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cx('whitespace-nowrap px-4 py-3 font-medium', c.className)}>
                    {c.sortValue ? (
                      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-charcoal" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                        {c.header}
                        {sort?.key === c.key && <span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-mist focus:bg-mist focus:outline-none')}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cx('px-4 py-3 align-top', c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-line px-4 py-2 text-xs text-muted">{shown.length} of {rows.length}</div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-charcoal/40" aria-label="Close panel" onClick={onClose} />
      <div className={cx('relative flex h-full w-full flex-col bg-mist shadow-2xl', wide ? 'max-w-3xl' : 'max-w-xl')}>
        <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-4">
          <div className="min-w-0 font-display text-xl font-bold uppercase">{title}</div>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-muted hover:bg-mist hover:text-charcoal" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, label, className = '' }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string; className?: string }) {
  return (
    <label className={cx('inline-flex items-center gap-2 text-sm', className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field !w-auto !py-2 !text-sm" aria-label={label}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-charcoal">{v ?? '–'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div role="status" className={cx('fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg', msg.tone === 'ok' ? 'bg-charcoal' : 'bg-danger')}>
      {msg.text}
    </div>
  ) : null;
  return { toast: (text: string, tone: 'ok' | 'err' = 'ok') => setMsg({ text, tone }), toastNode: node };
}
