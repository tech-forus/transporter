import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Circle, Mail, PackageCheck, Pause, Play, UserPlus, X } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { captureReferralFromUrl, clearStoredReferral } from '../utils/referral';
import {
  CHECKLIST, hasRefInUrl, loadChecked, progress, saveChecked, type AccountTab,
} from '../utils/referralChecklist';

// How long each checklist section stays on screen before sliding to the next.
const DWELL_MS = 6000;

const TABS: { id: AccountTab; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'individual', label: 'Individual' },
];

const ReferralBanner: React.FC = () => {
  const [inviter, setInviter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AccountTab>('business');
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked);
  const startRef = useRef<HTMLButtonElement>(null);
  // The checklist is a slideshow (one section at a time). It advances on its own, but the user can
  // pause it, hover/focus to hold it, or step through manually.
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [held, setHeld] = useState(false);
  // The viewport takes the height of the section on screen, so short sections leave no empty gap.
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const [viewH, setViewH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) return;
    const el = panelRefs.current[page];
    if (!el) return;
    const measure = () => setViewH(el.offsetHeight);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [open, page, tab]);

  useEffect(() => {
    const code = captureReferralFromUrl();
    if (!code) return;
    axios.get(`${API_BASE_URL}/api/vendor-referral/public/${code}`)
      .then((r) => {
        if (r.data?.valid) { setInviter(r.data.inviterName); setOpen(hasRefInUrl(window.location.search)); }
        else clearStoredReferral();
      })
      .catch(() => { /* keep the code; the server re-validates at submit */ });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    setPage(0);
    startRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!inviter) return null;

  const toggle = (id: string) => setChecked((prev) => {
    const next = { ...prev, [id]: !prev[id] };
    saveChecked(next);
    return next;
  });
  const { done, total } = progress(tab, checked);
  const sections = CHECKLIST[tab];

  return (
    <>
      <div className="mx-auto mb-2 mt-1 flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-sm text-slate-700">
        <span><b className="text-slate-900">{inviter}</b> is waiting to work with you on FreightCompare.</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
        >
          <ClipboardList size={14} /> What to keep ready
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="referral-checklist-title" className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="relative flex-none overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-5 py-3 text-white sm:px-8 sm:py-4">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-blue-200 hover:bg-white/10 hover:text-white">
                <X size={20} />
              </button>
              <div className="relative grid grid-cols-1 items-center gap-5">
                <div className="flex items-start gap-4">
                  <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-black text-white shadow-lg ring-4 ring-white/20 sm:h-16 sm:w-16 sm:text-3xl">
                    {inviter.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-amber-300 ring-1 ring-amber-300/30">
                      <Mail size={12} /> Personal invitation
                    </span>
                    <h2 id="referral-checklist-title" className="mt-1.5 text-xl font-black leading-tight sm:text-2xl [@media(max-height:820px)]:text-lg sm:[@media(max-height:820px)]:text-xl">
                      <span className="text-amber-300">{inviter}</span> wants you as their transporter
                    </h2>
                    <p className="mt-1 text-sm text-blue-100 [@media(max-height:800px)]:hidden">
                      They picked you personally and want to book their shipments with you. Finish sign-up and you're in their vendor list right away.
                    </p>
                  </div>
                </div>

                <ol className="grid grid-cols-3 gap-2 text-center text-xs sm:gap-3">
                  {[
                    { icon: <Mail size={16} />, title: 'Invited', sub: 'Invite received', state: 'done' },
                    { icon: <UserPlus size={16} />, title: 'Sign up', sub: 'You are here', state: 'now' },
                    { icon: <PackageCheck size={16} />, title: 'Get booked', sub: 'In their vendor list', state: 'next' },
                  ].map((s) => (
                    <li key={s.title} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-left ring-1 ${s.state === 'now' ? 'bg-amber-400 text-slate-900 ring-amber-300 shadow-lg' : s.state === 'done' ? 'bg-white/10 text-white ring-white/20' : 'bg-white/5 text-blue-200 ring-white/10'}`}>
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-black/10">{s.icon}</span>
                      <div className="min-w-0"><div className="font-black leading-tight">{s.title}</div>
                      <div className={`truncate text-[11px] leading-tight ${s.state === 'now' ? 'text-slate-800' : 'text-blue-200'}`}>{s.sub}</div></div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2 sm:px-6">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-bold text-slate-700">Keep these handy before you start:</p>
                <div role="tablist" aria-label="Account type" className="inline-flex rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => { setTab(t.id); setPage(0); }}
                      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm ${tab === t.id ? 'bg-amber-500 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-500" aria-live="polite">
                {done} of {total} ready
                <span className="ml-2 inline-block h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 align-middle">
                  <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                </span>
              </p>
            </div>

            <div
              className="flex min-h-0 flex-col"
              onMouseEnter={() => setHeld(true)}
              onMouseLeave={() => setHeld(false)}
              onFocusCapture={() => setHeld(true)}
              onBlurCapture={() => setHeld(false)}
            >
              <style>{'@keyframes fc-dwell{from{width:0}to{width:100%}}'}</style>
              <div className="flex items-stretch gap-1 border-b border-slate-200 px-3 pt-2 sm:px-4">
                <div role="tablist" aria-label="Checklist sections" className="flex min-w-0 flex-1 gap-1">
                  {sections.map((section, idx) => {
                    const active = idx === page;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => { setPage(idx); setPlaying(false); }}
                        className={`relative flex min-w-0 flex-1 items-center gap-2 rounded-t-lg px-3 py-2 text-left transition-colors ${active ? 'bg-slate-50 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                      >
                        <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-black ${active ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{idx + 1}</span>
                        <span className="truncate text-xs font-black uppercase tracking-wide sm:text-sm">{section.title.replace(/^(Step \d+|Right after sign-up):\s*/i, '')}</span>
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
                          {active && (
                            <span
                              key={`${tab}-${page}`}
                              className="block h-full bg-amber-500"
                              style={{ animation: `fc-dwell ${DWELL_MS}ms linear forwards`, animationPlayState: playing && !held ? 'running' : 'paused' }}
                              onAnimationEnd={() => setPage((p) => (p + 1) % sections.length)}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-none items-center gap-0.5 pb-1 pl-1">
                  <button type="button" aria-label="Previous section" onClick={() => { setPage((p) => (p - 1 + sections.length) % sections.length); setPlaying(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ChevronLeft size={18} /></button>
                  <button type="button" aria-label={playing ? 'Pause auto-advance' : 'Resume auto-advance'} onClick={() => setPlaying((v) => !v)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
                  <button type="button" aria-label="Next section" onClick={() => { setPage((p) => (p + 1) % sections.length); setPlaying(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ChevronRight size={18} /></button>
                </div>
              </div>

              <div className="min-h-0 shrink overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[height] duration-500 ease-out motion-reduce:transition-none" style={{ height: viewH }}>
                <div className="flex items-start transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${page * 100}%)` }}>
                  {sections.map((section, idx) => (
                    <section key={section.id} ref={(el) => { panelRefs.current[idx] = el; }} aria-hidden={idx !== page} className="min-w-full px-5 py-4 sm:px-8">
                      <p className="text-sm text-slate-600">{section.subtitle}</p>
                      <ul className="mt-4 grid grid-cols-1 gap-y-4 [@media(max-height:820px)]:mt-3 [@media(max-height:820px)]:gap-y-2.5">
                        {section.items.map((item) => {
                          const on = !!checked[item.id];
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                tabIndex={idx === page ? 0 : -1}
                                onClick={() => toggle(item.id)}
                                className="flex w-full items-start gap-2.5 text-left"
                              >
                                {on
                                  ? <CheckCircle2 size={20} className="mt-0.5 flex-none text-emerald-500" />
                                  : <Circle size={20} className="mt-0.5 flex-none text-slate-300" />}
                                <span className="min-w-0">
                                  <span className={`block text-sm font-semibold leading-snug ${on ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                    {item.label}
                                    {item.optional && <span className="ml-1.5 text-[11px] font-medium uppercase text-slate-400 no-underline">optional</span>}
                                  </span>
                                  {item.hint && <span className="block text-xs leading-snug text-slate-500 [@media(max-height:820px)]:hidden">{item.hint}</span>}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-2.5 sm:px-6">
              <p className="text-xs text-slate-500">Reopen this list any time from the top of the page.</p>
              <button
                ref={startRef}
                type="button"
                onClick={() => setOpen(false)}
                className="flex-none rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600"
              >
                Accept invite &amp; start sign-up
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReferralBanner;
