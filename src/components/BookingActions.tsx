// The steps a courier operator records on a booking: LR / AWB (and a correction), delivered, POD or another document.
// Each one is the same thing WhatsApp and the e-mail page already do, so the shipper is told exactly as before.
import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/apiConfig';

interface Props {
  booking: { _id: string; transporterAckStatus: 'pending' | 'acknowledged' | 'confirmed' | 'declined'; shipmentStatus?: string; lrNumber?: string; podAt?: string };
  onChanged: () => void;
  /** The courier's own login: view-only on bookings. */
  readOnly?: boolean;
  /** Document type preselected in the upload picker (e.g. 'box_slip' when opened from "Send box slip"). */
  initialKind?: string;
}

const KINDS: [string, string][] = [['pod', 'POD (proof of delivery)'], ['lr', 'LR copy'], ['box_slip', 'Box slip'], ['freight_invoice', 'Freight invoice']];
const msg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const btn = 'rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const field = 'w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-lg bg-white dark:bg-[#0b1b2b]';

export default function BookingActions({ booking, onChanged, readOnly, initialKind }: Props) {
  const [lr, setLr] = useState(booking.lrNumber || '');
  const [kind, setKind] = useState(initialKind || 'pod');
  const [busy, setBusy] = useState(false);
  const base = `${API_BASE_URL}/api/bookings/${booking._id}/portal`;

  const closed = readOnly || booking.transporterAckStatus !== 'confirmed' || ['cancelled', 'completed'].includes(booking.shipmentStatus || '') || !!booking.podAt;
  if (closed) return null;
  const delivered = booking.shipmentStatus === 'delivered';

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e) { toast.error(msg(e, 'Could not save. Please try again.')); }
    finally { setBusy(false); }
  };
  const saveLr = () => run(() => (booking.lrNumber ? axios.patch(`${base}/lr`, { lr }) : axios.post(`${base}/lr`, { lr })), booking.lrNumber ? 'AWB corrected. The shipper has been told.' : 'AWB saved. The shipper has been told.');
  const markDelivered = () => run(() => axios.post(`${base}/delivered`), 'Marked delivered.');
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('kind', kind); form.append('file', file);
      const res = await axios.post(`${base}/files`, form, { timeout: 60000 });
      const n = res.data?.lrNumber as string | undefined;
      if (n) setLr(n); // read from the LR PDF: no typing
      toast.success(n ? (res.data?.lrSaved ? `Uploaded. LR / AWB ${n} was read from the file and saved.` : `Uploaded. The file shows LR / AWB ${n}.`) : 'Uploaded. The shipper has been told.');
      onChanged();
    } catch (e) { toast.error(msg(e, 'Could not save. Please try again.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#1d3f5c] space-y-3" data-testid="booking-actions">
      {!delivered && (
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1" htmlFor={`lr-${booking._id}`}>LR / AWB number</label>
          <div className="flex gap-2">
            <input id={`lr-${booking._id}`} className={field} value={lr} onChange={(e) => setLr(e.target.value)} maxLength={30} autoComplete="off" placeholder="e.g. 12345678901" />
            <button type="button" className={btn} disabled={busy || lr.trim().length < 4} onClick={saveLr}>{booking.lrNumber ? 'Correct AWB' : 'Save AWB'}</button>
          </div>
        </div>
      )}
      {booking.lrNumber && !delivered && (
        <button type="button" className={btn} disabled={busy} onClick={markDelivered}>Mark delivered</button>
      )}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{delivered ? 'Upload POD' : 'Upload a document'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Document type" className={`${field} !w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input aria-label="Choose file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv" disabled={busy} className="text-xs"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload(f); e.target.value = ''; } }} />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">PDF, photo or spreadsheet, up to 5 MB.</p>
      </div>
    </div>
  );
}
