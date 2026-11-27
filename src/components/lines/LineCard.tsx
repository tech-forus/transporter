// One courier line ("Delhivery (Shipshopy)") opened in the owner's table: its login, pincodes sheet, tracking link and people.
// Name, status, rates and "Manage rates" are on the table row above it, so they are not repeated here.
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Download, KeyRound, Trash2, Upload, UserPlus } from 'lucide-react';
import { API_BASE_URL } from '../../config/apiConfig';
import { parseServiceabilitySheet, type ServiceRow } from '../../lib/serviceabilitySheet';
import CredentialsBox, { type Credentials } from './CredentialsBox';

export interface LineMember { name: string; phone: string; scope: 'all' | 'line'; lineRole: 'primary' | 'backup' | 'operator' | null; hasLogin: boolean }
export interface Line {
  _id: string; courier: string; companyName: string; email: string; kycStatus: string; trackingLink: string;
  coverage: { pincodes: number; zones: string[] };
  // Who can find this courier in the calculator: 'invited' = only the shipper who invited you, 'kyc' = public but waiting for KYC, 'everyone'.
  listing?: 'invited' | 'kyc' | 'everyone';
  ratesStatus: 'none' | 'ok' | 'stale'; ratesUpdatedAt: string | null; ratesUpdatedBy: { name: string; kind: string } | null;
  team: LineMember[];
}
/** Which field to bring into view when the row was opened from a table cell ("+ Add link", "+ Add", "None · Upload"). */
export type LineFocus = 'tracking' | 'people' | 'pincodes' | null;
interface Props { line: Line; onChanged: () => void; focus?: LineFocus }

const base = `${API_BASE_URL}/api/transporter/lines`;
const msg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
// font-normal / text colour: an input inside a bold grey label would otherwise inherit both and look already filled in.
const input = 'w-full px-3 py-1.5 text-sm font-normal text-slate-900 dark:text-white placeholder:text-slate-400 border border-slate-200 dark:border-[#1d3f5c] rounded-lg bg-white dark:bg-[#0b1b2b]';
const ROLE_LABEL: Record<string, string> = { primary: 'Primary', backup: 'Backup', operator: 'Operator' };
const act = 'inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-blue-700 hover:underline disabled:opacity-60';
const row = 'grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[120px_1fr] sm:gap-3';
const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:pt-1';
const zonesOf = (rows: ServiceRow[]) => new Set(rows.map((r) => r.zone.toUpperCase())).size;
const saveSheet = (rows: { Pincode: string | number; Zone: string; ODA: string }[], file: string) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ['Pincode', 'Zone', 'ODA'] }), 'Serviceability');
  XLSX.writeFile(wb, file);
};

export default function LineCard({ line, onChanged, focus }: Props) {
  // A new password signs out whoever is using that login now, so it is confirmed first; the result is shown right here.
  const [confirmReset, setConfirmReset] = useState<string | null>(null); // 'line' or a member's phone
  const [secret, setSecret] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(line.trackingLink);
  const [adding, setAdding] = useState(focus === 'people');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [form, setForm] = useState({ name: '', phone: '', lineRole: 'primary', consent: false });
  const [otp, setOtp] = useState('');
  // A parsed sheet waiting for "Replace": uploading swaps the courier's whole pincode list, so it is confirmed first.
  const [pending, setPending] = useState<ServiceRow[] | null>(null);
  const trackRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const run = async (fn: () => Promise<void>, fail: string) => { setBusy(true); try { await fn(); } catch (e) { toast.error(msg(e, fail)); } finally { setBusy(false); } };

  useEffect(() => {
    if (focus === 'tracking') trackRef.current?.focus();
    if (focus === 'people') setAdding(true);
    if (focus === 'pincodes') sheetRef.current?.scrollIntoView({ block: 'center' });
  }, [focus]);

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
    setConfirmReset(null);
    setSecret({ title: `New password for ${m.name}`, email: `Mobile ${m.phone.slice(2)}`, password: r.data.password });
    onChanged();
  }, 'Could not create the password.');
  const resetLogin = () => run(async () => {
    const r = await axios.post(`${base}/${line._id}/reset-password`);
    setConfirmReset(null);
    setSecret({ title: `New password for ${line.courier || line.companyName}`, email: line.email, password: r.data.password });
  }, 'Could not reset the password.');
  const confirmBox = (text: string, onYes: () => void) => (
    <div role="alertdialog" aria-label="Confirm new password" className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
      <span className="text-amber-900">{text}</span>
      <button type="button" disabled={busy} onClick={onYes} className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-60">Create new password</button>
      <button type="button" disabled={busy} onClick={() => setConfirmReset(null)} className="text-[11px] font-bold text-slate-600">Cancel</button>
    </div>
  );
  const saveRows = (rows: ServiceRow[]) => run(async () => {
    const r = await axios.put(`${base}/${line._id}/serviceability`, { service: rows });
    toast.success(`Saved: ${r.data.pincodes.toLocaleString('en-IN')} pincodes in ${r.data.zones.length} zone(s).`);
    setPending(null);
    onChanged();
  }, 'Could not save the sheet.');
  const pickSheet = async (file: File) => {
    const parsed = parseServiceabilitySheet(await file.arrayBuffer());
    if ('error' in parsed) { toast.error(parsed.error); return; }
    // Nothing to lose on a first upload; otherwise show old vs new count and wait for "Replace".
    if (line.coverage.pincodes === 0) await saveRows(parsed.rows);
    else setPending(parsed.rows);
  };
  const downloadCurrent = () => run(async () => {
    const r = await axios.get(`${base}/${line._id}/serviceability`);
    saveSheet((r.data.service || []).map((s: { pincode: number; zone: string; isOda: boolean }) => ({ Pincode: s.pincode, Zone: s.zone, ODA: s.isOda ? 'Yes' : 'No' })), `${line.courier || 'courier'}-pincodes.xlsx`);
  }, 'Could not download the current sheet.');
  const remove = (m: LineMember) => run(async () => { await axios.delete(`${base}/${line._id}/team/${m.phone}`); onChanged(); }, 'Could not remove.');

  const has = line.coverage.pincodes > 0;
  return (
    <dl className="divide-y divide-slate-200 dark:divide-[#1d3f5c] border border-slate-200 dark:border-[#1d3f5c] bg-white dark:bg-[#0d2438] px-4 text-xs">
      <div className={row}>
        <dt className={label}>Login</dt>
        <dd>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-slate-700 dark:text-white">{line.email}</span>
            <button type="button" onClick={() => { setSecret(null); setConfirmReset('line'); }} className={act}><KeyRound size={12} /> New password</button>
          </div>
          {confirmReset === 'line' && confirmBox('This signs out whoever is using this login now.', resetLogin)}
          {secret && !confirmReset && secret.email === line.email && <div className="mt-1.5"><CredentialsBox creds={secret} onClose={() => setSecret(null)} /></div>}
        </dd>
      </div>

      <div ref={sheetRef} className={row}>
        <dt className={label}>Pincodes</dt>
        <dd className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {has
              ? <span className="text-slate-700 dark:text-white"><b>{line.coverage.pincodes.toLocaleString('en-IN')}</b></span>
              : <span className="font-bold text-red-700">None yet. Shippers will not see this courier until you upload the pincodes it serves.</span>}
            <label title="Excel or CSV with Pincode, Zone and ODA columns. A new sheet replaces the whole list."
              className={has ? `${act} cursor-pointer` : 'inline-flex cursor-pointer items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-violet-700'}>
              <Upload size={12} /> {has ? 'Replace sheet' : 'Upload sheet'}
              <input type="file" aria-label="Serviceability sheet" accept=".xlsx,.xls,.csv" disabled={busy} className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { pickSheet(f); e.target.value = ''; } }} />
            </label>
            {has && <button type="button" disabled={busy} onClick={downloadCurrent} className={act}><Download size={12} /> Download current</button>}          </div>
          {pending && (
            <div role="alertdialog" aria-label="Replace pincodes" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="font-bold text-amber-900">
                Replace {line.coverage.pincodes.toLocaleString('en-IN')} pincodes ({line.coverage.zones.length} zones) with {pending.length.toLocaleString('en-IN')} pincodes ({zonesOf(pending)} zones)?
              </p>
              {pending.length < line.coverage.pincodes && <p className="mt-0.5 text-amber-800">The new sheet has {(line.coverage.pincodes - pending.length).toLocaleString('en-IN')} fewer pincodes. Shippers on those pincodes will stop seeing this courier.</p>}
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => saveRows(pending)} className="rounded-lg bg-amber-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60">Replace</button>
                <button type="button" disabled={busy} onClick={() => setPending(null)} className="text-[11px] font-bold text-slate-600">Cancel</button>
              </div>
            </div>
          )}
        </dd>
      </div>

      <div className={row}>
        <dt className={label}>Tracking link</dt>
        <dd className="flex items-center gap-2">
          <input ref={trackRef} aria-label="Tracking link" className={`${input} max-w-xl`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://courier.example/track/{awb}   ({awb} = where the number goes)" />
          {/* Shown only when there is something to save, so the panel has no dead button. */}
          {link !== line.trackingLink && <button type="button" disabled={busy} onClick={saveLink} className="whitespace-nowrap rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save link</button>}
        </dd>
      </div>

      <div className={row}>
        <dt className={label}>People</dt>
        <dd>
          {line.team.length === 0 && !adding && <span className="mr-3 text-slate-500">Nobody yet: bookings reach the courier login only.</span>}
          {line.team.length > 0 && (
            <ul className="mb-1.5 divide-y divide-slate-100 dark:divide-[#1d3f5c]">
              {line.team.map((m) => (
                <li key={m.phone} className="py-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold text-slate-800 dark:text-white">{m.name}</span>
                    <span className="text-slate-500">+{m.phone.slice(0, 2)} {m.phone.slice(2)}</span>
                    <span className="text-slate-500">{m.scope === 'all' ? 'All couriers (desk)' : ROLE_LABEL[m.lineRole || 'operator']}</span>
                    {m.scope === 'line' && (
                      <span className="ml-auto flex gap-1">
                        {/* A first password needs no warning; replacing one signs that person out. */}
                        <button type="button" title={m.hasLogin ? 'New password' : 'Create login'} aria-label={`New password for ${m.name}`} disabled={busy}
                          onClick={() => { setSecret(null); if (m.hasLogin) setConfirmReset(m.phone); else password(m); }} className="p-1.5 rounded border border-slate-200 hover:bg-slate-50"><KeyRound size={12} /></button>
                        <button type="button" title="Remove" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => remove(m)} className="p-1.5 rounded border border-slate-200 hover:bg-red-50"><Trash2 size={12} /></button>
                      </span>
                    )}
                  </div>
                  {confirmReset === m.phone && confirmBox(`This signs ${m.name} out now.`, () => password(m))}
                  {secret && !confirmReset && secret.email === `Mobile ${m.phone.slice(2)}` && <div className="mt-1.5"><CredentialsBox creds={secret} onClose={() => setSecret(null)} /></div>}
                </li>
              ))}
            </ul>
          )}
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className={act}><UserPlus size={12} /> Add person</button>
          ) : step === 'details' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg border border-slate-200 p-3">
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
                <button type="button" disabled={busy || !form.name || form.phone.length !== 10 || !form.consent} onClick={sendOtp} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Send OTP</button>
                <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2 rounded-lg border border-slate-200 p-3">
              <label className="flex-1 text-[11px] font-bold text-slate-500">OTP sent to {form.name}<input className={input} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} /></label>
              <button type="button" disabled={busy || otp.length < 4} onClick={confirm} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Verify and add</button>
            </div>
          )}
        </dd>
      </div>
    </dl>
  );
}
