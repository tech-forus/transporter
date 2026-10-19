import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Check, Globe, Hourglass, Lock, Users } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

// Marketing figure shown on the Go-public card (product decision). Not read from the DB.
const WAITING_SHIPPERS_LABEL = '1000+';

export interface PublicStatus {
  eligible: boolean;
  accountType: 'business' | 'individual';
  visibility: 'private' | 'pending_public' | 'public' | 'rejected';
  rejectionReason: string;
  shipperCount: number;
  // Admin approval waits for verified KYC; the card says what it is waiting on.
  kycStatus?: 'not_started' | 'submitted' | 'verified' | 'rejected' | 'exempt';
}

// Anything on the page (e.g. the dashboard Refresh button) can dispatch this to refetch the card.
export const PUBLIC_STATUS_REFRESH_EVENT = 'fc:public-status-refresh';
// While a request waits for the admin, check this often so the decision shows up by itself.
const PENDING_POLL_MS = 15000;

export function usePublicStatus() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const refresh = useCallback(async () => {
    try { setStatus((await axios.get(`${API_BASE_URL}/api/transporter/public/status`)).data.data); }
    catch { /* card stays hidden */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Live: refetch when the tab/window is focused again or something asks for it.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PUBLIC_STATUS_REFRESH_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PUBLIC_STATUS_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  // Poll only while waiting for the admin's decision (nothing else changes on its own).
  const waiting = status?.visibility === 'pending_public';
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [waiting, refresh]);

  return { status, refresh };
}

export async function requestGoPublic(): Promise<string> {
  const r = await axios.post(`${API_BASE_URL}/api/transporter/public/request`);
  return r.data.data.visibility as string;
}

// Undo "Go public" while it is still waiting for approval.
export async function cancelGoPublicRequest(): Promise<void> {
  await axios.post(`${API_BASE_URL}/api/transporter/public/cancel`);
}

// Approval needs verified KYC, so say exactly what the request is waiting on.
function pendingKycNote(kyc: PublicStatus['kycStatus']): { text: string; link?: string } {
  if (kyc === 'verified') return { text: 'Your KYC is verified. Waiting for the final approval.' };
  if (kyc === 'submitted') return { text: 'Your KYC documents are under review. We approve public listings once KYC is verified.' };
  if (kyc === 'rejected') return { text: 'A KYC document needs fixing. Approval can happen only after KYC is verified.', link: '/transporter-kyc' };
  return { text: 'Complete your KYC to get approved. We approve public listings once KYC is verified.', link: '/transporter-kyc' };
}

// Shown on Profile and Dashboard for transporters who joined through a shipper's invite.
// Legacy transporters (not eligible) never see it.
const GoPublicCard: React.FC<{ banner?: boolean; sidebar?: boolean }> = ({ banner, sidebar }) => {
  const { status, refresh } = usePublicStatus();
  const [busy, setBusy] = useState(false);

  // Tell the transporter the moment the admin decides while this page is open.
  const prevVisibility = useRef<string | null>(null);
  useEffect(() => {
    const v = status?.visibility;
    if (!v) return;
    if (prevVisibility.current === 'pending_public') {
      if (v === 'public') toast.success("You're public! Every shipper can now find and book you.");
      else if (v === 'rejected') toast.error('Your request to go public was not approved. See the details on the card.');
    }
    prevVisibility.current = v;
  }, [status?.visibility]);

  if (!status || !status.eligible) return null;

  const go = async () => {
    setBusy(true);
    try { await requestGoPublic(); toast.success('Submitted for approval'); await refresh(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not submit.'); }
    finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true);
    try { await cancelGoPublicRequest(); toast.success('Request withdrawn'); await refresh(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not withdraw the request.'); await refresh(); }
    finally { setBusy(false); }
  };
  const wrap = (children: React.ReactNode, tone: string) => (
    <div className={banner ? 'mx-auto max-w-6xl px-4 pt-4' : ''}>
      <div className={`grid grid-cols-1 items-center gap-3 rounded-2xl border p-4 ${sidebar ? '' : 'sm:grid-cols-[1fr_auto]'} ${tone}`}>{children}</div>
    </div>
  );

  const v = status.visibility;
  if (v === 'public') {
    return wrap(
      <>
        <div><b>You're public.</b> <span className="text-sm">Every shipper can now see and book your rates.</span></div>
        <Link to="/profile/rates/edit" className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700">Edit rates</Link>
      </>, 'border-emerald-200 bg-emerald-50 text-emerald-900');
  }
  if (v === 'pending_public') {
    const kycNote = pendingKycNote(status.kycStatus);
    const steps = [
      { label: 'Submitted', state: 'done' },
      { label: 'Under review', state: 'now' },
      { label: "You're public", state: 'next' },
    ] as const;
    return (
      <div className={banner ? 'mx-auto max-w-6xl px-4 pt-4' : ''}>
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-amber-950">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-amber-500 text-white"><Hourglass size={18} /></span>
            <div>
              <div className="text-base font-black leading-tight">Request submitted!</div>
              <div className="text-sm text-amber-900/80"><b>Awaiting approval.</b> We're reviewing your profile.</div>
            </div>
          </div>
          <ol className="mt-4 flex items-center">
            {steps.map((s, i) => (
              <li key={s.label} className="flex flex-1 items-center last:flex-none">
                <span className="flex items-center gap-1.5">
                  <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-black ${s.state === 'done' ? 'bg-emerald-500 text-white' : s.state === 'now' ? 'bg-amber-500 text-white ring-4 ring-amber-200' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>
                    {s.state === 'done' ? <Check size={14} /> : i + 1}
                  </span>
                  <span className={`text-xs font-bold ${s.state === 'next' ? 'text-slate-400' : 'text-slate-800'}`}>{s.label}</span>
                </span>
                {i < steps.length - 1 && <span className={`mx-2 h-0.5 flex-1 rounded ${s.state === 'done' ? 'bg-emerald-400' : 'bg-amber-200'}`} />}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-amber-900/80">Once approved, every shipper on FreightCompare can find and book you.</p>
          <p className="mt-1.5 rounded-lg bg-white/70 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
            {kycNote.text}
            {kycNote.link && <> <Link to={kycNote.link} className="underline underline-offset-2">Open KYC</Link></>}
          </p>
          <button onClick={withdraw} disabled={busy} className="mt-2 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950 disabled:opacity-60">Withdraw request</button>
        </div>
      </div>
    );
  }
  return (
    <div className={banner ? 'mx-auto max-w-6xl px-4 pt-4' : ''}>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-blue-100">
          <Users size={13} /> Shippers are waiting
        </div>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-5xl font-black leading-none tracking-tight">{WAITING_SHIPPERS_LABEL}</span>
          <span className="pb-1 text-sm font-semibold text-blue-100">shippers want to book transporters like you</span>
        </div>
        <p className="mt-3 text-sm text-blue-50">
          {v === 'rejected'
            ? `Your last request wasn't approved${status.rejectionReason ? `: ${status.rejectionReason}` : ''}. Update your info and try again.`
            : 'Right now, only the shipper who invited you can see your rates. Go public and get found by all of them.'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/20">
            <div className="flex items-center gap-1 font-black"><Lock size={12} /> Today</div>
            <div className="mt-0.5 text-blue-100">Only your inviting shipper sees you</div>
          </div>
          <div className="rounded-xl bg-white p-2.5 text-indigo-900 shadow">
            <div className="flex items-center gap-1 font-black text-emerald-600"><Globe size={12} /> After going public</div>
            <div className="mt-0.5">Every shipper can find &amp; book you</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={go} disabled={busy} className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-indigo-700 shadow hover:bg-blue-50 disabled:opacity-60">Go public</button>
          <Link to="/profile/rates/edit" className="rounded-xl px-3 py-2.5 text-xs font-bold text-white ring-1 ring-white/40 hover:bg-white/10">Edit first</Link>
        </div>
      </div>
    </div>
  );
};

export default GoPublicCard;
