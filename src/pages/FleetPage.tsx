// src/pages/FleetPage.tsx
//
// Fleet: every vehicle and driver on the account, including the primary pair
// proven at signup. View the RC / DL, edit details, replace a document, add
// more, remove extras. The primary vehicle/driver can be edited and their
// documents replaced, but not removed. Same for Business and Individual
// accounts. See docs/superpowers/specs/2026-09-22-transporter-kyc-design.md.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Truck, Contact, Eye, Pencil, Trash2, Plus, X, Star } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import DocStatusBadge from '../components/DocStatusBadge';
import {
  useMyDocuments, openMyFile, validateDocFile, formatDate,
  type VehicleInfo, type DriverInfo,
} from '../hooks/useMyDocuments';

axios.defaults.withCredentials = true;

const INPUT = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const API = `${API_BASE_URL}/api/transporter/kyc`;
const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

const PrimaryBadge = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-200"><Star size={10} /> Registered at signup</span>
);

const FileField: React.FC<{ label: string; file: File | null; onPick: (f: File | null) => void }> = ({ label, file, onPick }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
    <input
      type="file" accept=".jpg,.jpeg,.png,.pdf"
      onChange={(e) => {
        const f = e.target.files?.[0] || null;
        if (f) { const err = validateDocFile(f); if (err) { toast.error(err); e.target.value = ''; return; } }
        onPick(f);
      }}
      className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
    />
    {file && <span className="mt-1 block text-[11px] text-slate-400">{file.name}</span>}
  </label>
);

// ── Vehicle row ──────────────────────────────────────────────────────────
const VehicleRow: React.FC<{ v: VehicleInfo; onChanged: () => void }> = ({ v, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(v.vehicleNumber);
  const [type, setType] = useState(v.vehicleType);
  const [rc, setRc] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const numberChanged = number.trim().toUpperCase().replace(/[\s-]/g, '') !== v.vehicleNumber;
    if (numberChanged && !rc) { toast.error('A new vehicle number needs its RC. Please upload the RC.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('vehicleNumber', number);
      fd.append('vehicleType', type);
      if (rc) fd.append('rc', rc);
      await axios.put(`${API}/vehicles/${v._id}`, fd);
      toast.success(rc ? 'Saved. The new RC will be reviewed.' : 'Vehicle updated.');
      setEditing(false); setRc(null);
      onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not save the vehicle.')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Remove vehicle ${v.vehicleNumber}?`)) return;
    setBusy(true);
    try { await axios.delete(`${API}/vehicles/${v._id}`); toast.success('Vehicle removed.'); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not remove the vehicle.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-extrabold tracking-wide text-slate-900">{v.vehicleNumber}</p>
          <p className="text-xs text-slate-500">{v.vehicleType || 'Type not added'} · added {formatDate(v.addedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {v.isPrimary && <PrimaryBadge />}
          {v.rc && <DocStatusBadge status={v.rc.status} />}
        </div>
      </div>
      {v.rc?.status === 'rejected' && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {v.rc.rejectionReason ? `Reason: ${v.rc.rejectionReason}. ` : ''}Please upload the RC again.
        </p>
      )}

      {editing ? (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Vehicle number</span>
              <input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} maxLength={13} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Vehicle type</span>
              <input className={INPUT} value={type} onChange={(e) => setType(e.target.value)} maxLength={30} placeholder="e.g. Eicher 19 ft" /></label>
          </div>
          <FileField label="New RC (needed only if you change the number, or want to replace it)" file={rc} onPick={setRc} />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {busy && <Loader2 size={13} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setEditing(false); setNumber(v.vehicleNumber); setType(v.vehicleType); setRc(null); }} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.rc?.fileId && (
            <button onClick={() => openMyFile(v.rc!.fileId)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Eye size={13} /> View RC</button>
          )}
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"><Pencil size={13} /> Edit / replace RC</button>
          {!v.isPrimary && (
            <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><Trash2 size={13} /> Remove</button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Driver row ───────────────────────────────────────────────────────────
const DriverRow: React.FC<{ d: DriverInfo; onChanged: () => void }> = ({ d, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const [phone, setPhone] = useState(d.phone);
  const [dl, setDl] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Enter the driver's name."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('phone', phone);
      if (dl) fd.append('dl', dl);
      await axios.put(`${API}/drivers/${d._id}`, fd);
      toast.success(dl ? 'Saved. The new DL will be reviewed.' : 'Driver updated.');
      setEditing(false); setDl(null);
      onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not save the driver.')); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Remove driver ${d.name}?`)) return;
    setBusy(true);
    try { await axios.delete(`${API}/drivers/${d._id}`); toast.success('Driver removed.'); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not remove the driver.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-extrabold text-slate-900">{d.name}</p>
          <p className="text-xs text-slate-500">{d.phone || 'Phone not added'} · added {formatDate(d.addedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {d.isPrimary && <PrimaryBadge />}
          {d.dl && <DocStatusBadge status={d.dl.status} />}
        </div>
      </div>
      {d.dl?.status === 'rejected' && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {d.dl.rejectionReason ? `Reason: ${d.dl.rejectionReason}. ` : ''}Please upload the licence again.
        </p>
      )}

      {editing ? (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Driver name</span>
              <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Phone</span>
              <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" /></label>
          </div>
          <FileField label="New driving licence (optional)" file={dl} onPick={setDl} />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {busy && <Loader2 size={13} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setEditing(false); setName(d.name); setPhone(d.phone); setDl(null); }} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {d.dl?.fileId && (
            <button onClick={() => openMyFile(d.dl!.fileId)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Eye size={13} /> View licence</button>
          )}
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"><Pencil size={13} /> Edit / replace licence</button>
          {!d.isPrimary && (
            <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><Trash2 size={13} /> Remove</button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Add forms ────────────────────────────────────────────────────────────
const AddVehicle: React.FC<{ onAdded: () => void }> = ({ onAdded }) => {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [type, setType] = useState('');
  const [rc, setRc] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!number.trim()) return toast.error('Enter the vehicle number.');
    if (!rc) return toast.error('Upload the RC.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('vehicleNumber', number); fd.append('vehicleType', type); fd.append('rc', rc);
      await axios.post(`${API}/vehicles`, fd);
      toast.success('Vehicle added.');
      setNumber(''); setType(''); setRc(null); setOpen(false);
      onAdded();
    } catch (e) { toast.error(errMsg(e, 'Could not add the vehicle.')); }
    finally { setBusy(false); }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600">
      <Plus size={16} /> Add a vehicle
    </button>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-900">Add a vehicle</p>
        <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-white"><X size={16} /></button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={INPUT} value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder="Vehicle number (MH12AB1234)" maxLength={13} />
        <input className={INPUT} value={type} onChange={(e) => setType(e.target.value)} placeholder="Vehicle type (optional)" maxLength={30} />
      </div>
      <FileField label="RC (JPG, PNG or PDF, up to 5 MB)" file={rc} onPick={setRc} />
      <button onClick={add} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
        {busy ? <><Loader2 className="animate-spin" size={15} /> Adding…</> : 'Add vehicle'}
      </button>
    </div>
  );
};

const AddDriver: React.FC<{ onAdded: () => void }> = ({ onAdded }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dl, setDl] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return toast.error("Enter the driver's name.");
    if (!dl) return toast.error('Upload the driving licence.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', name); fd.append('phone', phone); fd.append('dl', dl);
      await axios.post(`${API}/drivers`, fd);
      toast.success('Driver added.');
      setName(''); setPhone(''); setDl(null); setOpen(false);
      onAdded();
    } catch (e) { toast.error(errMsg(e, 'Could not add the driver.')); }
    finally { setBusy(false); }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600">
      <Plus size={16} /> Add a driver
    </button>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-900">Add a driver</p>
        <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-white"><X size={16} /></button></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Driver name" maxLength={60} />
        <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="Phone (optional)" />
      </div>
      <FileField label="Driving licence (JPG, PNG or PDF, up to 5 MB)" file={dl} onPick={setDl} />
      <button onClick={add} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
        {busy ? <><Loader2 className="animate-spin" size={15} /> Adding…</> : 'Add driver'}
      </button>
    </div>
  );
};

export default function FleetPage() {
  const { data, loading, error, refresh } = useMyDocuments();

  return (
    <div className="mx-auto max-w-6xl py-2">
      <Link to="/profile" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600">
        <ArrowLeft size={16} /> Profile
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Vehicles &amp; Drivers</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Everything on your account, including the vehicle and driver you registered with. Documents you replace are reviewed again by our team.
      </p>

      {loading && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-500"><Truck size={16} /> Vehicles ({data.vehicles.length})</h2>
            {data.vehicles.map((v) => <VehicleRow key={v._id} v={v} onChanged={refresh} />)}
            <AddVehicle onAdded={refresh} />
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-500"><Contact size={16} /> Drivers ({data.drivers.length})</h2>
            {data.drivers.map((d) => <DriverRow key={d._id} d={d} onChanged={refresh} />)}
            <AddDriver onAdded={refresh} />
          </section>
        </div>
      )}
    </div>
  );
}
