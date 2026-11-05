// Profile > Team: people who get FreightCompare booking requests on WhatsApp and can Accept / Decline and share files
// for this account. A number is added only after the OTP sent to THAT number is typed in (the member tells the owner).
import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Users, Plus, Trash2, Loader2, ShieldCheck, X, KeyRound, Copy } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';

export interface TeamMember { name: string; phone: string; addedAt?: string; hasLogin?: boolean }

const MAX = 10;
// What the person typed or pasted -> the 10-digit Indian mobile number. Strips +91 / 91 / 091 / 0091 / a leading 0 when
// there are more than 10 digits (a 10-digit number that happens to start with 91 is left alone).
const tenDigits = (raw: string) => {
  const d = raw.replace(/\D/g, '');
  return (d.length > 10 ? d.replace(/^(0091|091|91|0)/, '') : d).slice(0, 10);
};
const fmt = (p: string) => (p.length === 12 ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p);
const input = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#0d2438] text-slate-800 dark:text-white';

const TeamCard = ({ team, onChange }: { team: TeamMember[]; onChange: (t: TeamMember[]) => void }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  // The password just created for a member: shown once here, never stored in readable form.
  const [created, setCreated] = useState<{ name: string; phone: string; password: string } | null>(null);
  useReportIframeHeight([adding, otpSent, team.length, !!created]); // the app embeds this page: grow the frame when the form opens

  const reset = () => { setAdding(false); setName(''); setPhone(''); setOtp(''); setOtpSent(false); setConsent(false); };
  const api = async <T,>(fn: () => Promise<{ data: T }>) => {
    setBusy(true);
    try { return (await fn()).data; } catch (e: any) { toast.error(e?.response?.data?.message || 'Something went wrong. Please try again.'); return null; } finally { setBusy(false); }
  };

  const sendOtp = async () => {
    if (!name.trim() || !/^\d{10}$/.test(phone)) { toast.error('Enter a name and a 10-digit mobile number.'); return; }
    if (!consent) { toast.error(`Please confirm that ${name.trim() || 'they'} agreed to receive booking messages.`); return; }
    const r = await api<{ message: string }>(() => axios.post(`${API_BASE_URL}/api/transporter/profile/team/request-otp`, { name: name.trim(), phone, consent }));
    if (r) { setOtpSent(true); toast.success(r.message); }
  };
  const confirm = async () => {
    const r = await api<{ message: string; team: TeamMember[] }>(() => axios.post(`${API_BASE_URL}/api/transporter/profile/team/confirm-otp`, { phone, otp }));
    if (r) { onChange(r.team); toast.success(r.message); reset(); }
  };
  const createPassword = async (m: TeamMember) => {
    if (m.hasLogin && !window.confirm(`Make a new password for ${m.name}? The old one stops working.`)) return;
    const r = await api<{ password: string; team: TeamMember[] }>(() => axios.post(`${API_BASE_URL}/api/transporter/profile/team/${m.phone}/password`));
    if (r) { onChange(r.team); setCreated({ name: m.name, phone: m.phone, password: r.password }); }
  };
  const remove = async (m: TeamMember) => {
    if (!window.confirm(`Remove ${m.name}? They will stop getting your booking requests.`)) return;
    const r = await api<{ team: TeamMember[] }>(() => axios.delete(`${API_BASE_URL}/api/transporter/profile/team/${m.phone}`));
    if (r) onChange(r.team);
  };

  return (
    <div className="bg-white dark:bg-[#0d2438] rounded-2xl border border-slate-200 dark:border-[#1d3f5c] shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 dark:border-[#1d3f5c]">
        <div className="w-7 h-7 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 flex-none"><Users className="w-4 h-4" /></div>
        <h2 className="text-xs font-bold text-slate-600 dark:text-[#8fb0cf] uppercase tracking-widest">WhatsApp Booking Team</h2>
        <span className="ml-auto text-xs text-slate-400 dark:text-[#6f93b8]">{team.length}/{MAX}</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs text-slate-500 dark:text-[#8fb0cf]">
          Everyone here gets your FreightCompare booking requests on WhatsApp, together with your own WhatsApp number. The first person to tap Accept handles the booking, and files the shipper sends go to them.
        </p>
        {team.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-[#1d3f5c] rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
            {team.map((m) => (
              <li key={m.phone} className="flex items-center gap-3 px-3 py-2">
                <ShieldCheck className="w-4 h-4 text-blue-500 flex-none" aria-label="Verified" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{m.name}</p>
                  <p className="text-xs text-slate-500 dark:text-[#8fb0cf]">{fmt(m.phone)}</p>
                </div>
                <button type="button" onClick={() => createPassword(m)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-[#1d3f5c] dark:text-[#8fb0cf] dark:hover:bg-white/5 disabled:opacity-50">
                  <KeyRound className="w-3.5 h-3.5" /> {m.hasLogin ? 'Reset password' : 'Create password'}
                </button>
                <button type="button" onClick={() => remove(m)} disabled={busy} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50" aria-label={`Remove ${m.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {created && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p><b>{created.name}</b> can now sign in on the transporter page with <b>{fmt(created.phone)}</b> and this password. It is shown only now, so pass it on before closing this.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded-lg bg-white px-3 py-1.5 text-base font-bold tracking-wider text-slate-900 dark:bg-[#0d2438] dark:text-white">{created.password}</code>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(created.password); toast.success('Copied'); }} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-2 py-1 text-xs font-semibold dark:border-amber-500/40"><Copy className="w-3.5 h-3.5" /> Copy</button>
              <button type="button" onClick={() => setCreated(null)} className="ml-auto text-xs font-semibold underline">Done, I have passed it on</button>
            </div>
          </div>
        )}

        {!adding ? (
          team.length < MAX && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1d3f5c] dark:bg-transparent dark:text-white dark:hover:bg-white/5">
              <Plus className="w-4 h-4" /> Add team member
            </button>
          )
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-[#1d3f5c] p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={input} placeholder="Name (e.g. Ramesh)" value={name} maxLength={60} disabled={otpSent || busy} onChange={(e) => setName(e.target.value)} />
              <input className={input} placeholder="10-digit WhatsApp number" inputMode="numeric" value={phone} disabled={otpSent || busy} onChange={(e) => setPhone(tenDigits(e.target.value))} />
            </div>
            {!otpSent && (
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-[#8fb0cf]">
                <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{name.trim() || 'This person'} agreed to receive FreightCompare booking requests and files for my company on WhatsApp.</span>
              </label>
            )}
            {otpSent && (
              <div>
                <p className="text-xs text-slate-500 dark:text-[#8fb0cf] mb-1.5">We sent a code to {name} on <b>+91 {phone.slice(0, 5)} {phone.slice(5)}</b>. If that number is wrong, cancel and start again. Ask them for the code and type it here (valid 10 minutes).</p>
                <input className={input} placeholder="6-digit code" inputMode="numeric" maxLength={6} value={otp} disabled={busy} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </div>
            )}
            <div className="flex items-center gap-2">
              {!otpSent ? (
                <button type="button" onClick={sendOtp} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Send code to their WhatsApp
                </button>
              ) : (
                <>
                  <button type="button" onClick={confirm} disabled={busy || otp.length < 4} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Verify and add
                  </button>
                  <button type="button" onClick={sendOtp} disabled={busy} className="text-xs font-semibold text-blue-600 dark:text-blue-400 disabled:opacity-50">Resend code</button>
                  <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }} disabled={busy} className="text-xs font-semibold text-slate-600 dark:text-[#8fb0cf] disabled:opacity-50">Change name / number</button>
                </>
              )}
              <button type="button" onClick={reset} disabled={busy} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600" aria-label="Cancel"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamCard;
