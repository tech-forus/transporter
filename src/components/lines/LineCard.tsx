// One courier line ("Delhivery (Shipshopy)") as the organisation owner sees it: its people and their roles, its rates (who
// last saved them, and whether they are missing or stale), its tracking link, and "Manage rates".
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import { API_BASE_URL } from '../../config/apiConfig';
import { useAuth } from '../../hooks/useAuth';
import { parseServiceabilitySheet } from '../../lib/serviceabilitySheet';

export interface LineMember { name: string; phone: string; scope: 'all' | 'line'; lineRole: 'primary' | 'backup' | 'operator' | null; hasLogin: boolean }
export interface Line {
  _id: string; courier: string; companyName: string; email: string; kycStatus: string; trackingLink: string;
  coverage: { pincodes: number; zones: string[] };
  ratesStatus: 'none' | 'ok' | 'stale'; ratesUpdatedAt: string | null; ratesUpdatedBy: { name: string; kind: string } | null;
  team: LineMember[];
}
interface Props { line: Line; onChanged: () => void; onSecret: (s: { title: string; email: string; password: string }) => void }

const base = `${API_BASE_URL}/api/transporter/lines`;
const msg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const input = 'w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-lg bg-white dark:bg-[#0b1b2b]';
const ROLE_LABEL: Record<string, string> = { primary: 'Primary', backup: 'Backup', operator: 'Operator' };
const RATES_TEXT = { none: ['No rates yet', 'bg-red-50 text-red-700 border-red-200'], stale: ['Rates not updated for 90+ days', 'bg-amber-50 text-amber-800 border-amber-200'], ok: ['Rates OK', 'bg-emerald-50 text-emerald-700 border-emerald-200'] } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function LineCard({ line, onChanged, onSecret }: Props) {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(line.trackingLink);
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [form, setForm] = useState({ name: '', phone: '', lineRole: 'primary', consent: false });
  const [otp, setOtp] = useState('');
  const run = async (fn: () => Promise<void>, fail: string) => { setBusy(true); try { await fn(); } catch (e) { toast.error(msg(e, fail)); } finally { setBusy(false); } };

  const manageRates = () => run(async () => {
    const r = await axios.post(`${base}/${line._id}/manage-token`);
    loginWithToken(r.data.token);
    navigate('/profile/rates');
  }, 'Could not open this courier\'s rates.');
  const saveLink = () => run(async () => { await axios.patch(`${base}/${line._id}`, { trackingLink: link }); toast.success('Tracking link saved.'); onChanged(); }, 'Could not save the link.');
  const sendOtp = () => run(async () => {
    await axios.post(`${base}/${line._id}/team/request-otp`, { name: form.name, phone: form.phone, lineRole: form.lineRole, consent: form.consent });
    setStep('otp');
  }, 'Could not send the OTP.');
  const confirm = () => run(async () => {
    await axios.post(`${base}/${line._id}/team/confirm-otp`, { phone: form.phone, otp });
    toast.success(`${form.name} added.`);
    setAdding(false); setStep('details'); setOtp(''); setForm({ name: '', phone: '', lineRole: 'primary', consent: false });
    onChanged();
  }, 'Wrong or expired OTP.');
  const password = (m: LineMember) => run(async () => {
    const r = await axios.post(`${base}/${line._id}/team/${m.phone}/password`);
    onSecret({ title: `${m.name} on ${line.companyName}`, email: `Mobile ${m.phone.slice(2)}`, password: r.data.password });
    onChanged();
  }, 'Could not create the password.');
  const uploadSheet = (file: File) => run(async () => {
    const parsed = parseServiceabilitySheet(await file.arrayBuffer());
    if ('error' in parsed) { toast.error(parsed.error); return; }
    const r = await axios.put(`${base}/${line._id}/serviceability`, { service: parsed.rows });
    toast.success(`Saved: ${r.data.pincodes.toLocaleString('en-IN')} pincodes in ${r.data.zones.length} zone(s).`);
    onChanged();
  }, 'Could not save the sheet.');
  const remove = (m: LineMember) => run(async () => { await axios.delete(`${base}/${line._id}/team/${m.phone}`); onChanged(); }, 'Could not remove.');

  const [ratesLabel, ratesTone] = RATES_TEXT[line.ratesStatus] || RATES_TEXT.none;
  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{line.companyName}</p>
          <p className="text-xs text-slate-500 truncate">{line.email} · KYC {line.kycStatus}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ratesTone}`}>{ratesLabel}</span>
          <button type="button" disabled={busy} onClick={manageRates} className="rounded-lg border border-slate-200 dark:border-[#1d3f5c] px-3 py-1.5 text-xs font-bold hover:bg-slate-50">Manage rates</button>
        </div>
      </div>
      {line.ratesUpdatedBy && line.ratesUpdatedAt && <p className="text-[11px] text-slate-500">Updated by {line.ratesUpdatedBy.name} on {day(line.ratesUpdatedAt)}</p>}

      <div className="rounded-lg border border-slate-200 dark:border-[#1d3f5c] p-3 text-xs space-y-1.5">
        <p className="font-bold text-slate-800 dark:text-white">
          {line.coverage.pincodes > 0 ? `Serves ${line.coverage.pincodes.toLocaleString('en-IN')} pincodes in ${line.coverage.zones.join(', ')}` : 'No pincodes yet'}
        </p>
        {line.coverage.pincodes === 0 && <p className="text-amber-700">Shippers will not see this courier until you upload the pincodes it serves.</p>}
        <label className="block text-[11px] font-bold text-slate-500">Serviceability sheet (Excel or CSV with Pincode, Zone and ODA columns)
          <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} className="mt-1 block text-xs"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { uploadSheet(f); e.target.value = ''; } }} />
        </label>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex-1 text-[11px] font-bold text-slate-500">Tracking link (use {'{awb}'} where the number goes)
          <input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://courier.example/track/{awb}" />
        </label>
        <button type="button" disabled={busy || link === line.trackingLink} onClick={saveLink} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save link</button>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">People on this courier</p>
        <ul className="divide-y divide-slate-100 dark:divide-[#1d3f5c] rounded-lg border border-slate-200 dark:border-[#1d3f5c] text-xs">
          {line.team.length === 0 && <li className="px-3 py-2 text-slate-500">Nobody yet. Bookings reach the courier login only.</li>}
          {line.team.map((m) => (
            <li key={m.phone} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="font-bold text-slate-800 dark:text-white">{m.name}</span>
              <span className="text-slate-500">+{m.phone.slice(0, 2)} {m.phone.slice(2)}</span>
              <span className="rounded bg-blue-50 px-1.5 text-blue-700">{m.scope === 'all' ? 'All couriers (desk)' : ROLE_LABEL[m.lineRole || 'operator']}</span>
              {m.scope === 'line' && (
                <span className="ml-auto flex gap-1">
                  <button type="button" title="New password" disabled={busy} onClick={() => password(m)} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50"><KeyRound size={12} /></button>
                  <button type="button" title="Remove" disabled={busy} onClick={() => remove(m)} className="p-1.5 rounded border border-slate-200 hover:bg-red-50"><Trash2 size={12} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700"><UserPlus size={14} /> Add person</button>
        ) : step === 'details' ? (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border border-slate-200 p-3">
            <label className="text-[11px] font-bold text-slate-500">Name<input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-[11px] font-bold text-slate-500">Mobile<input className={input} inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="text-[11px] font-bold text-slate-500">Role
              <select className={input} value={form.lineRole} onChange={(e) => setForm({ ...form, lineRole: e.target.value })}>
                <option value="primary">Primary</option><option value="backup">Backup</option><option value="operator">Operator</option>
              </select>
            </label>
            <label className="sm:col-span-3 flex items-center gap-2 text-[11px] text-slate-600">
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} /> {form.name || 'This person'} agreed to receive booking messages on WhatsApp
            </label>
            <div className="sm:col-span-3 flex gap-2">
              <button type="button" disabled={busy || !form.name || form.phone.length !== 10 || !form.consent} onClick={sendOtp} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Send OTP</button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-end gap-2 rounded-lg border border-slate-200 p-3">
            <label className="flex-1 text-[11px] font-bold text-slate-500">OTP sent to {form.name}<input className={input} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} /></label>
            <button type="button" disabled={busy || otp.length < 4} onClick={confirm} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Verify and add</button>
          </div>
        )}
      </div>
    </div>
  );
}
