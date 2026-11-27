// Courier lines: an aggregator (a business that sells several couriers, e.g. Shipshopy) adds one line per courier.
// Each line is its own login with its own rates, tracking link, team and bookings; shippers see "Delhivery (Shipshopy)"
// and "Blue Dart (Shipshopy)" as separate carriers. The organisation owner sees every line's bookings here.
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, Plus, Truck } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { type Line } from '../components/lines/LineCard';
import LinesTable from '../components/lines/LinesTable';
import CredentialsBox from '../components/lines/CredentialsBox';
import OrgDashboard from '../components/lines/OrgDashboard';

axios.defaults.withCredentials = true;

type Gate = 'loading' | 'ok' | 'not_aggregator' | 'line_login';

const input = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#0b1b2b]';
const base = `${API_BASE_URL}/api/transporter/lines`;
const errText = (e: any, fallback: string) => e?.response?.data?.message || fallback;

export default function LinesPage() {
  const [gate, setGate] = useState<Gate>('loading');
  const [lines, setLines] = useState<Line[]>([]);
  const [couriers, setCouriers] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);
  const [courier, setCourier] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLineId, setNewLineId] = useState<string | null>(null);
  const [openByLine, setOpenByLine] = useState<Record<string, number>>({});
  const [shown, setShown] = useState<{ title: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(base);
      setLines(r.data.lines || []); setCouriers(r.data.couriers || []); setSuggested(r.data.suggested || []); setInvitedBy(r.data.invitedBy || null); setGate('ok'); if (!(r.data.lines || []).length) setAdding(true);
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
      setShown({ title: `Login for ${r.data.line.companyName}`, email: r.data.line.email, password: r.data.password });
      setNewLineId(r.data.line._id); setAdding(false); // open the new courier's row: its setup checklist is the next thing to do
      setCourier(''); setEmail(''); await load();
    } catch (err: any) { toast.error(errText(err, 'Could not add the courier.')); }
    finally { setBusy(false); }
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
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Truck size={20} /> Courier lines</h1>
          <p className="text-xs text-slate-500 dark:text-[#8fb0cf]">Each courier you sell, shown to shippers as "Courier (Your company)".</p>
        </div>
        {/* Filled only while there is no courier yet: then adding one IS the next step. Otherwise it must not compete. */}
        <button type="button" onClick={() => setAdding((a) => !a)}
          className={lines.length === 0 ? 'inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white'
            : 'inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-[#1d3f5c] bg-white dark:bg-transparent px-4 py-2 text-xs font-bold text-slate-700 dark:text-white hover:bg-slate-50'}>
          <Plus size={14} /> {adding ? 'Close' : 'Add courier'}
        </button>
      </div>

      {/* Bookings are on the Dashboard; this screen only needs each courier's open-booking count for its table. */}
      <OrgDashboard silent onOpenByLine={setOpenByLine} />

      {/* A courier just added: its login appears here, under the Add form it came from. Password resets show inside the row. */}
      {shown && <CredentialsBox creds={shown} onClose={() => setShown(null)} />}

      {adding && (
        <div className="space-y-3">
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
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus size={14} /> Create courier</button>
          </form>
          <p className="text-[11px] text-slate-500">After creating it: set its pincodes, then its rates (Manage rates). A courier is shown to shippers only when it has both.</p>
        </div>
      )}

      {lines.some((l) => l.listing === 'kyc') && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Your couriers are not visible to shippers yet</p>
          <p className="mt-0.5 text-xs">
            {lines[0]?.kycStatus === 'rejected'
              ? 'A KYC document was rejected. Re-upload it from your profile; the reason is in the e-mail we sent.'
              : 'Your KYC is under review. Shippers can find your couriers in their search only after our team verifies it. You will get a message here and on WhatsApp when it is done.'}
          </p>
        </div>
      )}

      <section aria-label="Couriers" className="space-y-2">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Your couriers</h2>
        <LinesTable lines={lines} openByLine={openByLine} onChanged={load} autoOpenId={newLineId} invitedBy={invitedBy} />
      </section>
    </div>
  );
}
