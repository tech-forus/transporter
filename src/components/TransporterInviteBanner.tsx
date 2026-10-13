import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Handshake, Mail, PackageCheck, TrendingUp, UserPlus, Users, X } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { captureTransporterReferralFromUrl, clearStoredTransporterReferral } from '../utils/referral';

const hasTrefInUrl = () => {
  try { return !!new URLSearchParams(window.location.search).get('tref'); } catch { return false; }
};

const BENEFITS = [
  { icon: <PackageCheck size={18} />, text: 'Get direct bookings from shippers on the platform' },
  { icon: <TrendingUp size={18} />, text: 'Keep your rates and lanes in one place, no more rate-card emails' },
  { icon: <Users size={18} />, text: 'Be found by more shippers whenever you choose to go public' },
];

// Shown on /transporter-signup when the visitor arrived through another transporter's invite (?tref=).
// Personal welcome only: unlike a shipper invite it does not link them to anyone.
const TransporterInviteBanner: React.FC = () => {
  const [inviter, setInviter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const code = captureTransporterReferralFromUrl();
    if (!code) return;
    axios.get(`${API_BASE_URL}/api/transporter-referral/public/${code}`)
      .then((r) => {
        if (r.data?.valid) { setInviter(r.data.inviterName); setOpen(hasTrefInUrl()); }
        else clearStoredTransporterReferral();
      })
      .catch(() => { /* keep the code; the server re-validates at submit */ });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    startRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!inviter) return null;

  return (
    <>
      <div className="mx-auto mb-2 mt-1 flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-sm text-slate-700">
        <span><b className="text-slate-900">{inviter}</b> invited you to join FreightCompare.</span>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
          <Mail size={14} /> View invitation
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="transporter-invite-title" className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-5 py-5 text-white sm:px-8 sm:py-6">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-blue-200 hover:bg-white/10 hover:text-white"><X size={20} /></button>
              <div className="relative flex items-start gap-4">
                <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl font-black text-white shadow-lg ring-4 ring-white/20 sm:h-16 sm:w-16 sm:text-3xl">
                  {inviter.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest text-amber-300 ring-1 ring-amber-300/30">
                    <Handshake size={12} /> Personal invitation
                  </span>
                  <h2 id="transporter-invite-title" className="mt-1.5 text-xl font-black leading-tight sm:text-2xl">
                    <span className="text-amber-300">{inviter}</span> invited you to join them on FreightCompare
                  </h2>
                  <p className="mt-1 text-sm text-blue-100">
                    They're already part of the transporter network and thought you'd be a great fit. Creating your account takes a few minutes.
                  </p>
                </div>
              </div>

              <ol className="relative mt-5 grid grid-cols-3 gap-2 text-center text-xs sm:gap-3">
                {[
                  { icon: <Mail size={16} />, title: 'Invited', sub: `By ${inviter}`, state: 'done' },
                  { icon: <UserPlus size={16} />, title: 'Sign up', sub: 'You are here', state: 'now' },
                  { icon: <PackageCheck size={16} />, title: 'Get bookings', sub: 'Join the network', state: 'next' },
                ].map((s) => (
                  <li key={s.title} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-left ring-1 ${s.state === 'now' ? 'bg-amber-400 text-slate-900 ring-amber-300 shadow-lg' : s.state === 'done' ? 'bg-white/10 text-white ring-white/20' : 'bg-white/5 text-blue-200 ring-white/10'}`}>
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-black/10">{s.icon}</span>
                    <div className="min-w-0">
                      <div className="font-black leading-tight">{s.title}</div>
                      <div className={`truncate text-[11px] leading-tight ${s.state === 'now' ? 'text-slate-800' : 'text-blue-200'}`}>{s.sub}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid grid-cols-1 gap-3 bg-slate-50 px-5 py-4 sm:grid-cols-3 sm:px-8">
              {BENEFITS.map((b) => (
                <div key={b.text} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-blue-100 text-blue-700">{b.icon}</span>
                  <span className="leading-snug">{b.text}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-8">
              <p className="text-xs text-slate-500">Your rates and shippers stay yours. This invite doesn't share anything.</p>
              <button ref={startRef} type="button" onClick={() => setOpen(false)} className="flex-none rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-white hover:bg-amber-600">
                Accept invite &amp; start sign-up
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TransporterInviteBanner;
