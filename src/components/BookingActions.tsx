// The steps a courier operator records on a booking: LR / AWB (and a correction), delivered, POD or another document.
// Each one is the same thing WhatsApp and the e-mail page already do, so the shipper is told exactly as before.
import { useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';

interface Props {
  booking: { _id: string; transporterAckStatus: 'pending' | 'acknowledged' | 'confirmed' | 'declined'; shipmentStatus?: string; lrNumber?: string; podAt?: string };
  onChanged: () => void;
  /** The courier's own login: view-only on bookings. */
  readOnly?: boolean;
  /** Document type preselected in the upload picker (e.g. 'box_slip' when opened from "Send box slip"). */
  initialKind?: string;
  /** Closes the surrounding window: shown as "Done" once something was uploaded. */
  onDone?: () => void;
}

const KINDS: [string, string][] = [['pod', 'POD (proof of delivery)'], ['lr', 'LR copy'], ['box_slip', 'Box slip'], ['freight_invoice', 'Freight invoice']];
const msg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const btn = 'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const ghost = 'rounded-lg border border-slate-300 dark:border-[#1d3f5c] bg-white dark:bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-50 disabled:opacity-50';
const field = 'w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-lg bg-white dark:bg-[#0b1b2b]';
const sizeOf = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function BookingActions({ booking, onChanged, readOnly, initialKind, onDone }: Props) {
  const [lr, setLr] = useState(booking.lrNumber || '');
  const [kind, setKind] = useState(initialKind || 'pod');
  const [busy, setBusy] = useState(false);
  // A file is chosen first, then sent with the Upload button; once sent, "Done" closes the window or another file can follow.
  const [picked, setPicked] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `${API_BASE_URL}/api/bookings/${booking._id}/portal`;

  const closed = readOnly || booking.transporterAckStatus !== 'confirmed' || ['cancelled', 'completed'].includes(booking.shipmentStatus || '') || !!booking.podAt;
  if (closed && !uploaded) return null;
  const delivered = booking.shipmentStatus === 'delivered';

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e) { toast.error(msg(e, 'Could not save. Please try again.')); }
    finally { setBusy(false); }
  };
  const saveLr = () => run(() => (booking.lrNumber ? axios.patch(`${base}/lr`, { lr }) : axios.post(`${base}/lr`, { lr })), booking.lrNumber ? 'AWB corrected. The shipper has been told.' : 'AWB saved. The shipper has been told.');
  const markDelivered = () => run(() => axios.post(`${base}/delivered`), 'Marked delivered.');
  const upload = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('kind', kind); form.append('file', picked);
      const res = await axios.post(`${base}/files`, form, { timeout: 60000 });
      const n = res.data?.lrNumber as string | undefined;
      if (n) setLr(n); // read from the LR PDF: no typing
      toast.success(n ? (res.data?.lrSaved ? `Uploaded. LR / AWB ${n} was read from the file and saved.` : `Uploaded. The file shows LR / AWB ${n}.`) : 'Uploaded. The shipper has been told.');
      setUploaded(picked.name); setPicked(null);
      onChanged();
    } catch (e) { toast.error(msg(e, 'Could not save. Please try again.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#1d3f5c] space-y-3" data-testid="booking-actions">
      {!delivered && !closed && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1" htmlFor={`lr-${booking._id}`}>LR / AWB number</label>
          <div className="flex gap-2">
            <input id={`lr-${booking._id}`} className={field} value={lr} onChange={(e) => setLr(e.target.value)} maxLength={30} autoComplete="off" placeholder="e.g. 12345678901" />
            <button type="button" className={btn} disabled={busy || lr.trim().length < 4} onClick={saveLr}>{booking.lrNumber ? 'Correct AWB' : 'Save AWB'}</button>
          </div>
        </div>
      )}
      {booking.lrNumber && !delivered && !closed && (
        <button type="button" className={btn} disabled={busy} onClick={markDelivered}>Mark delivered</button>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{delivered ? 'Upload POD' : 'Upload a document'}</p>
        {uploaded ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 size={16} className="shrink-0" />
            <span className="min-w-0 flex-1"><b className="break-all">{uploaded}</b> was uploaded and the shipper has been told.</span>
            {!closed && <button type="button" className={ghost} onClick={() => setUploaded(null)}>Upload another</button>}
            <button type="button" className={btn} onClick={onDone}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Document type" className={`${field} !w-auto`} value={kind} onChange={(e) => setKind(e.target.value)} disabled={closed}>
                {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <input ref={input} aria-label="Choose file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv" disabled={busy || closed} className="text-xs"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPicked(f); }} />
              {picked && (
                <>
                  <span className="text-xs text-slate-600">{picked.name} · {sizeOf(picked.size)}</span>
                  <button type="button" className={btn} disabled={busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</button>
                  <button type="button" className={ghost} disabled={busy} onClick={() => { setPicked(null); if (input.current) input.current.value = ''; }}>Clear</button>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">PDF, photo or spreadsheet, up to 5 MB. Pick the file, then press Upload.</p>
          </>
        )}
      </div>
    </div>
  );
}
