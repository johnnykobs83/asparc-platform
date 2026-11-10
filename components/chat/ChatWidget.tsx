'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatAction, ChatReply } from '@/lib/ai/types';
import { EnquiryForm, type ServiceOption } from '../site/EnquiryForm';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  actions?: ChatAction[];
}

const STORE_KEY = 'asparc_chat_v1';

const store = {
  get(): { visitorId?: string; conversationId?: string } {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  set(v: { visitorId?: string; conversationId?: string }) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable – conversation stays in memory */
    }
  },
};

function newVisitorId() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return `v_${Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')}`.slice(0, 40);
}

/** Minimal, safe formatting: **bold** and line breaks only (no HTML injection). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} className="block min-h-[0.6em]">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </span>
      ))}
    </>
  );
}

const STARTERS = ['Tell me about the Performance Academy', 'Sports performance training', 'Remedial massage prices', 'Club partnerships'];

export function ChatWidget({ services = [], defaultOpen = false }: { services?: ServiceOption[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState<{ visitorId: string; conversationId?: string }>({ visitorId: '' });
  const [formsDone, setFormsDone] = useState<Record<number, boolean>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = store.get();
    const visitorId = s.visitorId && /^[A-Za-z0-9_-]{16,64}$/.test(s.visitorId) ? s.visitorId : newVisitorId();
    setIds({ visitorId, conversationId: s.conversationId });
    store.set({ visitorId, conversationId: s.conversationId });
    if (s.conversationId) {
      fetch(`/api/chat/history?conversationId=${s.conversationId}&visitorId=${visitorId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { messages: Msg[] } | null) => d?.messages?.length && setMessages(d.messages))
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy || !ids.visitorId) return;
      setMessages((m) => [...m, { role: 'user', content: t }]);
      setInput('');
      setBusy(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId: ids.visitorId, conversationId: ids.conversationId, message: t }),
        });
        const body = (await res.json()) as ChatReply & { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'error');
        setIds((p) => {
          const next = { ...p, conversationId: body.conversationId };
          store.set(next);
          return next;
        });
        setMessages((m) => [...m, { role: 'assistant', content: body.reply, actions: body.actions }]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: e instanceof Error && e.message !== 'error' ? e.message : "Sorry – I couldn't connect just now. Please try again, or use the enquiry form on the Contact page.", actions: [{ type: 'enquiry_form', form: 'contact' }] },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, ids],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const lastAssistant = messages.map((m, i) => (m.role === 'assistant' ? i : -1)).filter((i) => i >= 0).pop();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="asparc-chat"
        className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-full bg-royal py-3 pl-3 pr-5 text-white shadow-[0_14px_40px_-10px_rgba(20,81,156,0.8)] transition hover:bg-royal-600 ${open ? 'max-sm:hidden' : ''}`}
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />}
          </svg>
          {!open && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-royal bg-[#3ccf7e]" aria-hidden="true" />}
        </span>
        <span className="font-display text-base font-semibold uppercase tracking-wider">{open ? 'Close' : 'Ask ASPARC AI'}</span>
      </button>

      {open && (
        <section
          id="asparc-chat"
          role="dialog"
          aria-label="ASPARC AI – Your Performance Assistant"
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-line sm:shadow-[0_30px_80px_-20px_rgba(16,24,32,0.45)]"
        >
          <header className="relative overflow-hidden bg-charcoal px-5 py-4 text-white">
            <div className="speed-lines absolute inset-0" aria-hidden="true" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold uppercase leading-none tracking-wide">ASPARC AI</p>
                <p className="mt-1 text-xs text-sky">Your Performance Assistant</p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#3ccf7e]" aria-hidden="true" /> AI assistant · not a person
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close chat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-mist px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="rounded-xl bg-white p-4 text-[14px] leading-relaxed shadow-sm">
                <p>
                  Hi, I&apos;m <strong>ASPARC AI</strong> – an AI assistant. I can answer questions about our services, pricing and the Performance Academy, and pass your enquiry to the team.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-royal/30 bg-white px-3 py-1.5 text-xs font-medium text-royal hover:border-royal hover:bg-royal hover:text-white">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[88%] ${m.role === 'user' ? 'rounded-2xl rounded-br-sm bg-royal px-4 py-2.5 text-[14px] text-white' : 'w-full'}`}>
                  {m.role === 'user' ? (
                    m.content
                  ) : (
                    <>
                      <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-[14px] leading-relaxed text-charcoal shadow-sm">
                        <Rich text={m.content} />
                      </div>
                      {m.actions?.map((a, j) => {
                        if (a.type === 'quick_replies' && i === lastAssistant)
                          return (
                            <div key={j} className="mt-2 flex flex-wrap gap-1.5">
                              {a.options.map((o) => (
                                <button key={o} type="button" disabled={busy} onClick={() => void send(o)} className="rounded-full border border-royal/30 bg-white px-3 py-1.5 text-xs font-medium text-royal hover:bg-royal hover:text-white">
                                  {o}
                                </button>
                              ))}
                            </div>
                          );
                        if (a.type === 'payment_link')
                          return (
                            <a key={j} href={a.url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 !py-2 !text-sm">
                              {a.label}
                            </a>
                          );
                        if (a.type === 'enquiry_form')
                          return (
                            <details key={j} className="mt-2 rounded-xl border border-line bg-white p-3 shadow-sm" open={i === lastAssistant || formsDone[i]}>
                              <summary className="cursor-pointer font-display text-sm font-semibold uppercase tracking-wider text-royal">
                                {formsDone[i] ? 'Details sent ✓' : a.form === 'academy' ? 'Parent/guardian registration' : a.form === 'booking' || a.form === 'massage' ? 'Send a booking request' : a.form === 'club' ? 'Club partnership details' : 'Leave your details'}
                              </summary>
                              <div className="mt-3">
                                <EnquiryForm
                                  compact
                                  form={a.form}
                                  leadType={a.leadType}
                                  serviceInterest={a.serviceInterest}
                                  ageGroup={a.ageGroup}
                                  services={services}
                                  conversationId={ids.conversationId}
                                  onSubmitted={() => setFormsDone((f) => ({ ...f, [i]: true }))}
                                />
                              </div>
                            </details>
                          );
                        return null;
                      })}
                    </>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-1.5 px-2 py-1" aria-label="ASPARC AI is typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-royal/50" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-line bg-white p-3">
            <div className="flex items-end gap-2">
              <label htmlFor="asparc-chat-input" className="sr-only">
                Message ASPARC AI
              </label>
              <textarea
                id="asparc-chat-input"
                ref={inputRef}
                rows={1}
                maxLength={1000}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Ask about training, the Academy, pricing…"
                className="field max-h-28 min-h-[44px] flex-1 resize-none !py-2.5"
              />
              <button type="submit" disabled={busy || !input.trim()} className="btn-primary h-11 !px-4" aria-label="Send message">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[10.5px] leading-snug text-muted">
              AI assistant – not medical advice. In an emergency call <strong>000</strong>. Please don&apos;t share card or medical details.
            </p>
          </form>
        </section>
      )}
    </>
  );
}
