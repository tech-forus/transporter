import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { BadgeCheck, Copy, Mail, MessageCircle, Users } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

interface Stats {
  qualifiedCount: number;
  badge: { threshold: number; earned: boolean; underReview: boolean };
  joined: { transporterId: string; companyName: string; joinedAt: string; counted: boolean }[];
  pendingInvites: { _id: string; recipientName: string; recipientContact: string; channel: string; sentAt: string }[];
}

const api = `${API_BASE_URL}/api/transporter-referral`;

const InviteTransportersPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [link, st] = await Promise.all([axios.get(`${api}/link`), axios.get(`${api}/stats`)]);
      setUrl(link.data.data.url); setStats(st.data.data);
    } catch { toast.error('Could not load your invite link.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const log = (channel: 'whatsapp' | 'copy') => axios.post(`${api}/invites`, { channel }).catch(() => { /* best effort */ });
  const message = `I'm on FreightCompare, a platform that connects transporters and shippers. Join here: ${url}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); log('copy'); }
    catch { toast.error('Could not copy. Select the link and copy it manually.'); }
  };
  const whatsapp = () => { log('whatsapp'); window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener'); };
  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await axios.post(`${api}/invites/send-email`, { to: email, recipientName: name });
      toast.success('Invite sent'); setEmail(''); setName(''); load();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? err.response?.data?.message || 'Could not send.' : 'Could not send.');
    } finally { setSending(false); }
  };

  const pct = stats ? Math.min(100, (stats.qualifiedCount / stats.badge.threshold) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Users size={22} /> Invite transporters</h1>
      <p className="mt-1 text-sm text-slate-600">
        Invite other transporters to FreightCompare. They sign up as normal transporters. Inviting someone does not share your rates or shippers with them.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black text-slate-800">Your invite link</h2>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copy} disabled={!url} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Copy size={14} /> Copy link</button>
            <button type="button" onClick={whatsapp} disabled={!url} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><MessageCircle size={14} /> Share on WhatsApp</button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black text-slate-800">Send by email</h2>
          <form onSubmit={sendEmail} className="mt-2 grid grid-cols-1 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name (optional)" maxLength={100} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="name@company.com" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button type="submit" disabled={sending || !email} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Mail size={14} /> {sending ? 'Sending…' : 'Send invite'}</button>
          </form>
          <p className="mt-2 text-[11px] text-slate-400">Up to 20 email invites a day.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-800"><BadgeCheck size={16} className={stats?.badge.earned ? 'text-emerald-600' : 'text-slate-300'} /> Verified Network badge</h2>
          {stats && (
            <>
              <p className="mt-2 text-sm text-slate-700">
                {stats.badge.earned ? 'You earned the badge.'
                  : stats.badge.underReview ? 'Your badge is on hold while we review a burst of signups.'
                    : `${stats.qualifiedCount} of ${stats.badge.threshold} verified signups`}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              <p className="mt-2 text-[11px] text-slate-400">A signup counts once the transporter is verified and has finished their profile.</p>
            </>
          )}
        </section>
      </div>

      {stats && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-black text-slate-800">Joined ({stats.joined.length})</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {stats.joined.map((j) => (
                <li key={j.transporterId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="truncate font-semibold text-slate-700">{j.companyName}</span>
                  <span className={`text-xs ${j.counted ? 'text-emerald-600' : 'text-slate-400'}`}>{j.counted ? 'Counted' : 'Not counted'}</span>
                </li>
              ))}
              {stats.joined.length === 0 && <li className="text-slate-400">No one has joined yet.</li>}
            </ul>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-black text-slate-800">Waiting ({stats.pendingInvites.length})</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {stats.pendingInvites.map((p) => (
                <li key={p._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="truncate text-slate-700">{p.recipientName || p.recipientContact || 'Shared link'}</span>
                  <span className="text-xs text-slate-400">{p.channel}</span>
                </li>
              ))}
              {stats.pendingInvites.length === 0 && <li className="text-slate-400">No pending invites.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};

export default InviteTransportersPage;
