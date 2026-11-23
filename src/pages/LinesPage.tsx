// Courier lines: an aggregator (a business that sells several couriers, e.g. Shipshopy) adds one line per courier.
// Each line is its own login with its own rates, tracking link, team and bookings; shippers see "Delhivery (Shipshopy)"
// and "Blue Dart (Shipshopy)" as separate carriers. The organisation owner sees every line's bookings here.
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Copy, KeyRound, Loader2, Plus, Truck } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import LineCard, { type Line } from '../components/lines/LineCard';
import OrgDashboard from '../components/lines/OrgDashboard';

axios.defaults.withCredentials = true;

interface LineBooking { _id: string; bookingCode: string; line: string; pickupPincode: string; dropPincode: string; transporterAckStatus: string; shipmentStatus?: string; lrNumber?: string; createdAt: string }
type Gate = 'loading' | 'ok' | 'not_aggregator' | 'line_login';

const input = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#0b1b2b]';
const base = `${API_BASE_URL}/api/transporter/lines`;
const errText = (e: any, fallback: string) => e?.response?.data?.message || fallback;

export default function LinesPage() {
  const [gate, setGate] = useState<Gate>('loading');
  const [lines, setLines] = useState<Line[]>([]);
  const [couriers, setCouriers] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [bookings, setBookings] = useState<LineBooking[]>([]);
  const [courier, setCourier] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ title: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(base);
      setLines(r.data.lines || []); setCouriers(r.data.couriers || []); setSuggested(r.data.suggested || []); setGate('ok');
      const b = await axios.get(`${base}/bookings`);
      setBookings(b.data.data || []);
    } catch (e: any) {
      const code = e?.response?.data?.code;
      setGate(code === 'NOT_AGGREGATOR' ? 'not_aggregator' : code === 'OWNER_ONLY' ? 'line_login' : 'ok');
      if (!code) toast.error(errText(e, 'Could not load courier lines.'));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const becomeAggregator = async () => {
    setBusy(true);
    try { await axios.patch(`${base}/org-type`, { orgType: 'aggregator' }); await load(); }
    catch (e: any) { toast.error(errText(e, 'Could not switch.')); }
    finally { setBusy(false); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await axios.post(base, { courier, email });
      setShown({ title: r.data.line.companyName, email: r.data.line.email, password: r.data.password });
      setCourier(''); setEmail(''); await load();
    } catch (err: any) { toast.error(errText(err, 'Could not add the courier.')); }
    finally { setBusy(false); }
  };
  const reset = async (l: Line) => {
    try {
      const r = await axios.post(`${base}/${l._id}/reset-password`);
      setShown({ title: l.companyName, email: l.email, password: r.data.password });
    } catch (e: any) { toast.error(errText(e, 'Could not reset the password.')); }
  };

  if (gate === 'loading') return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

  if (gate === 'line_login') return (
    <div className="max-w-2xl mx-auto p-6"><p className="text-sm text-slate-600">This is a courier login. Courier lines are managed by the organisation owner.</p></div>
  );

  if (gate === 'not_aggregator') return (
    <div className="max-w-2xl mx-auto p-6 space-y-3">
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Courier lines</h1>
      <p className="text-sm text-slate-600 dark:text-[#8fb0cf]">If your business sells several couriers (for example Delhivery and Blue Dart), switch to an aggregator account. Each courier gets its own login, rates and bookings, and shippers see them as separate carriers.</p>
      <button type="button" disabled={busy} onClick={becomeAggregator} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">We are an aggregator</button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Truck size={20} /> Courier lines</h1>
        <p className="text-xs text-slate-500 dark:text-[#8fb0cf]">Add each courier you sell. Each one gets its own login, rates, tracking link and bookings. Shippers see it as "Courier (Your company)".</p>
      </div>

      <OrgDashboard />

      {shown && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm" role="status">
          <p className="font-bold text-emerald-900">Login for {shown.title}</p>
          <p className="text-emerald-800">Email: <b>{shown.email}</b></p>
          <p className="text-emerald-800 flex items-center gap-2">Password: <b className="font-mono text-base">{shown.password}</b>
            <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={() => navigator.clipboard?.writeText(shown.password).catch(() => {})}><Copy size={12} /> Copy</button>
          </p>
          <p className="text-xs text-emerald-700 mt-1">Shown once. Share it with the person who handles this courier.</p>
          <button type="button" className="mt-2 text-xs font-bold text-emerald-900 underline" onClick={() => setShown(null)}>Done</button>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs">
          <p className="font-bold text-amber-900">Couriers you chose at signup. Tap one, then enter its login e-mail:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggested.map((c) => <button key={c} type="button" onClick={() => { setCourier(c); document.getElementById('line-email')?.focus(); }} className={`rounded-full border px-3 py-1 font-bold ${courier === c ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-white text-amber-800'}`}>{c}</button>)}
          </div>
        </div>
      )}

      <form onSubmit={add} className="rounded-2xl border border-slate-200 dark:border-[#1d3f5c] p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="text-xs font-bold text-slate-600 dark:text-[#8fb0cf]">Courier
          <input id="line-courier" list="line-couriers" className={input} value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Delhivery" required />
          <datalist id="line-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="text-xs font-bold text-slate-600 dark:text-[#8fb0cf]">Login email for this courier
          <input id="line-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="delhivery@yourcompany.in" required />
        </label>
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} /> Add courier</button>
      </form>

      <div className="rounded-2xl border border-slate-200 dark:border-[#1d3f5c] divide-y divide-slate-100 dark:divide-[#1d3f5c]">
        {lines.length === 0 && <p className="p-4 text-sm text-slate-500">No couriers added yet.</p>}
        {lines.map((l) => (
          <div key={l._id}>
            <LineCard line={l} onChanged={load} onSecret={setShown} />
            <div className="px-4 pb-3">
              <button type="button" onClick={() => reset(l)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800"><KeyRound size={12} /> New password for the courier's own login ({l.email})</button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2">Bookings across all couriers</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#1d3f5c]">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-[#0b1b2b] text-slate-500"><tr>
              {['Booking', 'Courier', 'Route', 'Status', 'LR / AWB'].map((h) => <th key={h} className="text-left px-3 py-2 font-bold uppercase tracking-wider text-[10px]">{h}</th>)}
            </tr></thead>
            <tbody>
              {bookings.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No bookings yet.</td></tr>}
              {bookings.map((b) => (
                <tr key={b._id} className="border-t border-slate-100 dark:border-[#1d3f5c]">
                  <td className="px-3 py-2 font-mono">{b.bookingCode}</td>
                  <td className="px-3 py-2">{b.line}</td>
                  <td className="px-3 py-2">{b.pickupPincode} → {b.dropPincode}</td>
                  <td className="px-3 py-2">{b.shipmentStatus || b.transporterAckStatus}</td>
                  <td className="px-3 py-2 font-mono">{b.lrNumber || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">To accept, decline or send documents for a booking, sign in to that courier's own login (or reply on WhatsApp as usual).</p>
      </div>
    </div>
  );
}
