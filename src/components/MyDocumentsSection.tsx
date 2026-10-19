// Profile > "Documents & Files": everything the transporter uploaded at signup
// and in KYC — view it, replace it, see its review status — plus their uploaded
// rate files and a fleet summary. Works the same for Business and Individual
// accounts, and for referral and non-referral signups (nothing here depends on
// either).
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CreditCard, Camera, Building2, FileSpreadsheet, Truck, Contact, Eye, RefreshCw,
  Loader2, FolderOpen, ArrowRight, X,
} from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import DocStatusBadge from './DocStatusBadge';
import LiveSelfieCapture from './LiveSelfieCapture';
import {
  useMyDocuments, openMyFile, validateDocFile, formatSize, formatDate,
  type DocInfo, type PhotoGroupInfo, type DocStatus,
} from '../hooks/useMyDocuments';

axios.defaults.withCredentials = true;

type Kind = 'aadhaar' | 'selfie' | 'businessPhotos';

const CATEGORY_LABELS: Record<string, string> = {
  serviceability: 'Serviceable pincodes',
  charges: 'Charges / rate card',
  zone_matrix: 'Zone-to-zone rates',
  price_chart: 'Price chart',
  pincode: 'Pincodes',
  rate_file: 'Rate file',
};
const categoryLabel = (c: string) => CATEGORY_LABELS[c] || c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) || 'Rate file';

interface TileProps {
  icon: React.ReactNode;
  tone: string;
  title: string;
  hint: string;
  info: (DocInfo | PhotoGroupInfo) | null;
  kind: Kind;
  onReplaced: () => void;
}

const DocTile: React.FC<TileProps> = ({ icon, tone, title, hint, info, kind, onReplaced }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);

  const isGroup = kind === 'businessPhotos';
  const files = info
    ? isGroup ? (info as PhotoGroupInfo).files : [{ fileId: (info as DocInfo).fileId, fileName: (info as DocInfo).fileName, size: (info as DocInfo).size }]
    : [];
  const status = (info?.status ?? 'pending') as DocStatus;

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    if (isGroup && picked.length < 3) { toast.error('Please choose at least 3 photos.'); return; }
    for (const f of picked) {
      const err = validateDocFile(f);
      if (err) { toast.error(err); return; }
    }
    setBusy(true);
    try {
      const fd = new FormData();
      picked.forEach((f) => fd.append('files', f));
      await axios.put(`${API_BASE_URL}/api/transporter/kyc/my-documents/${kind}`, fd);
      toast.success(info?.status === 'verified' ? 'Replaced. Our team will review it again.' : 'Uploaded. Our team will review it.');
      setSelfieOpen(false);
      setSelfie(null);
      onReplaced();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not upload. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const startReplace = () => (kind === 'selfie' ? setSelfieOpen(true) : inputRef.current?.click());

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${tone}`}>{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="text-xs text-slate-400">{hint}</p>
          </div>
        </div>
        {info && <DocStatusBadge status={status} />}
      </div>

      {info ? (
        <>
          <p className="mt-3 text-xs text-slate-500">
            {isGroup ? `${files.length} photos` : files[0]?.fileName}
            {!isGroup && files[0]?.size ? ` · ${formatSize(files[0].size)}` : ''} · uploaded {formatDate(info.uploadedAt)}
          </p>
          {status === 'rejected' && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {info.rejectionReason ? `Reason: ${info.rejectionReason}. ` : ''}Please replace this document to keep your account active.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <button key={f.fileId} onClick={() => openMyFile(f.fileId)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <Eye size={13} /> {isGroup ? `Photo ${i + 1}` : 'View'}
              </button>
            ))}
            <button onClick={startReplace} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Replace
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-xs text-slate-400">Not uploaded yet.</p>
          <button onClick={startReplace} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} Upload
          </button>
        </div>
      )}

      <input
        ref={inputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf" multiple={isGroup}
        onChange={(e) => { const picked = Array.from(e.target.files || []); e.target.value = ''; upload(picked); }}
      />

      {selfieOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setSelfieOpen(false)}>
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelfieOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            <h3 className="mb-3 text-base font-bold text-slate-900">Take a new selfie</h3>
            <LiveSelfieCapture capturedFile={selfie} onCapture={setSelfie} onRetake={() => setSelfie(null)} />
            <button
              onClick={() => selfie && upload([selfie])} disabled={!selfie || busy}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" />} Save selfie
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MyDocumentsSection: React.FC = () => {
  const { data, loading, error, refresh } = useMyDocuments();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2.5">
        <FolderOpen className="text-blue-600 w-4 h-4" />
        <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Documents &amp; Files</h2>
      </div>

      <div className="p-5 space-y-5">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading your documents…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {data && (
          <>
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Identity &amp; location</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <DocTile kind="aadhaar" title="Aadhaar card" hint="Of the company representative" icon={<CreditCard size={18} />} tone="bg-blue-50 text-blue-600" info={data.documents.aadhaar} onReplaced={refresh} />
                <DocTile kind="selfie" title="Live selfie" hint="Matched with your Aadhaar" icon={<Camera size={18} />} tone="bg-violet-50 text-violet-600" info={data.documents.selfie} onReplaced={refresh} />
                <DocTile kind="businessPhotos" title="Office / warehouse photos" hint="At least 3, different angles" icon={<Building2 size={18} />} tone="bg-emerald-50 text-emerald-600" info={data.documents.businessPhotos} onReplaced={refresh} />
              </div>
            </div>

            <Link to="/profile/fleet" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Truck size={18} /></span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Vehicles &amp; drivers</p>
                  <p className="text-xs text-slate-500 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><Truck size={12} /> {data.vehicles.length} vehicle{data.vehicles.length === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1"><Contact size={12} /> {data.drivers.length} driver{data.drivers.length === 1 ? '' : 's'}</span>
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">Manage <ArrowRight size={14} /></span>
            </Link>

            {data.rateFiles.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Rate files you uploaded at signup</p>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {data.rateFiles.map((f) => (
                    <li key={f.fileId} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileSpreadsheet size={16} /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{f.fileName}</p>
                          <p className="text-xs text-slate-400">{categoryLabel(f.category)} · {formatSize(f.size)} · {formatDate(f.uploadedAt)}</p>
                        </div>
                      </div>
                      <button onClick={() => openMyFile(f.fileId)} className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <Eye size={13} /> Open
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">To change your prices, use <Link to="/profile/rates/edit" className="font-semibold text-blue-600">Edit rates</Link>.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MyDocumentsSection;
