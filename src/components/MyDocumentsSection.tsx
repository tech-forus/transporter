// Profile > "KYC documents": everything the transporter uploaded at signup
// and in KYC — view it, replace it, see its review status — plus their uploaded
// rate files. (The fleet summary lives in Operations on the Profile page.) Works the same for Business and Individual
// accounts, and for referral and non-referral signups (nothing here depends on
// either).
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  FileSpreadsheet, Eye, RefreshCw,
  Loader2, X,
} from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import DocStatusBadge from './DocStatusBadge';
import SectionCard from './SectionCard';
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
  title: string;
  hint: string;
  info: (DocInfo | PhotoGroupInfo) | null;
  kind: Kind;
  showStatus: boolean; // false when the card header already shows the one status all documents share
  onReplaced: () => void;
}

// Small preview of one office photo; PDFs (or a failed load) fall back to a numbered button. Click opens it full size.
const PhotoThumb: React.FC<{ fileId: string; fileName?: string; index: number }> = ({ fileId, fileName, index }) => {
  const [src, setSrc] = useState<string | null>(null);
  const isImage = !/\.pdf$/i.test(fileName || '');
  useEffect(() => {
    if (!isImage) return undefined;
    let url: string | null = null;
    let alive = true;
    axios.get(`${API_BASE_URL}/api/transporter/kyc/my-file/${fileId}`, { responseType: 'blob' })
      .then((res) => { if (alive) { url = URL.createObjectURL(res.data); setSrc(url); } })
      .catch(() => { /* keep the numbered fallback */ });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [fileId, isImage]);
  return (
    <button onClick={() => openMyFile(fileId)} aria-label={`Open photo ${index}`} title={`Photo ${index}`}
      className="flex h-7 w-9 flex-none items-center justify-center overflow-hidden rounded-md bg-slate-100 text-xs font-semibold text-slate-500 ring-1 ring-slate-200 hover:ring-blue-400 dark:bg-white/5 dark:ring-[#1d3f5c]">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : index}
    </button>
  );
};

const DocTile: React.FC<TileProps> = ({ title, hint, info, kind, showStatus, onReplaced }) => {
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

  const btn = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold';

  // One line per document: name (+ photo thumbs) · status only if it differs from the card's · View/Replace.
  // Upload date and file name live in the tooltip — they matter rarely and repeated on every row.
  return (
    <li className="py-1.5">
      <div className="flex items-center gap-2" title={info ? `${hint} · uploaded ${formatDate(info.uploadedAt)}` : hint}>
        <span className="min-w-0 flex-1 text-sm font-medium text-slate-800 dark:text-white">{title}</span>
        {isGroup && files.map((f, i) => <PhotoThumb key={f.fileId} fileId={f.fileId} fileName={f.fileName} index={i + 1} />)}
        {showStatus && info && <DocStatusBadge status={status} />}
        {!isGroup && files.map((f) => (
          <button key={f.fileId} onClick={() => openMyFile(f.fileId)} className={`${btn} text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:text-[#8fb0cf] dark:hover:bg-white/5`}>
            <Eye size={13} /> View
          </button>
        ))}
        <button onClick={startReplace} disabled={busy} className={`${btn} ${info ? 'text-slate-500 hover:text-blue-600 dark:text-[#8fb0cf] hover:bg-slate-100 dark:hover:bg-white/5' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-60`}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : info && <RefreshCw size={13} />} {info ? 'Replace' : 'Upload'}
        </button>
      </div>
      {status === 'rejected' && info && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {info.rejectionReason ? `Reason: ${info.rejectionReason}. ` : ''}Please replace this document to keep your account active.
        </p>
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
    </li>
  );
};

// Data comes from the Profile page (it also feeds the Fleet row in Operations), so the API is called once.
const MyDocumentsSection: React.FC<{ docs: ReturnType<typeof useMyDocuments> }> = ({ docs }) => {
  const { data, loading, error, refresh } = docs;
  // All uploaded and in the same state (the usual case) -> one badge in the header instead of one per row.
  const infos = data ? [data.documents.aadhaar, data.documents.selfie, data.documents.businessPhotos] : [];
  const statuses = new Set(infos.map((i) => (i ? i.status ?? 'pending' : 'missing')));
  const shared = statuses.size === 1 && !statuses.has('missing') ? ([...statuses][0] as DocStatus) : null;

  return (
    <SectionCard title="KYC documents" right={shared && <DocStatusBadge status={shared} />}>
      <div className="space-y-3">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading your documents…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {data && (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-[#1d3f5c]">
              <DocTile kind="aadhaar" title="Aadhaar card" hint="Of the company representative" info={data.documents.aadhaar} showStatus={!shared} onReplaced={refresh} />
              <DocTile kind="selfie" title="Live selfie" hint="Matched with your Aadhaar" info={data.documents.selfie} showStatus={!shared} onReplaced={refresh} />
              <DocTile kind="businessPhotos" title="Office / warehouse photos" hint="At least 3, different angles" info={data.documents.businessPhotos} showStatus={!shared} onReplaced={refresh} />
            </ul>

            {data.rateFiles.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-slate-500 dark:text-[#8fb0cf]">Rate files you uploaded at signup</p>
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
    </SectionCard>
  );
};

export default MyDocumentsSection;
