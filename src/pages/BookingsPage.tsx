// src/pages/BookingsPage.tsx
//
// Real-time(ish) view of bookings shippers have made against this
// transporter's account via the "Book Now" flow — closes the loop that
// previously ended at an email into the transporter's inbox. Polls rather
// than pushes (see brainstorming discussion): simple, no new infra, and a
// human checking a dashboard tab doesn't need sub-second delivery.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  RefreshCw, ChevronDown, Trash2, IndianRupee, Clock, Mail, Phone,
  CheckCircle2, XCircle, ThumbsUp, Bell, Eye, X,
  TrendingUp, ArrowRight, AlertTriangle, Paperclip, Download,
} from 'lucide-react';
import { useRateSetup } from '../hooks/useRateSetup';
import GoPublicCard, { PUBLIC_STATUS_REFRESH_EVENT, usePublicStatus } from '../components/GoPublicCard';
import { IS_WEB } from '../config/host';

// Website only. GST returns registered names in ALL CAPS ("SHIPSHOPY PRIVATE LIMITED"); show them in title case for reading.
// Short tokens (TCI, DHL, PVT, LTD, CO.) stay as typed so acronyms survive. Names with any lowercase are left alone.
const displayCompanyName = (name: string) =>
  !IS_WEB || /[a-z]/.test(name) ? name : name.replace(/\S+/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()));
import CopyableAddress from '../components/CopyableAddress';
import { useAuth } from '../hooks/useAuth';
import BookingActions from '../components/BookingActions';
import AggregatorBanner from '../components/lines/AggregatorBanner';
import { API_BASE_URL } from '../config/apiConfig';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';
import { useModalIframePin } from '../hooks/useModalIframePin';

axios.defaults.withCredentials = true;

const POLL_INTERVAL_MS = 20000;
// A pending booking younger than this gets a "New" badge — cheap, self-
// contained way to flag recent arrivals without tracking a last-seen
// timestamp per transporter.
const NEW_BADGE_WINDOW_MS = 10 * 60 * 1000;

interface ShipperInfo {
  _id: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  // customers.phone is stored as Number in Mongo — comes back from the API
  // as a number, not a string (confirmed live; see digitsOnly below).
  phone?: string | number;
}

interface BookingBox {
  boxNo?: string;
  count?: number;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  description?: string;
}

interface Booking {
  _id: string;
  // Organisation view (linesMode): which courier line this booking belongs to.
  lineId?: string;
  line?: string;
  bookingCode: string;
  customerID: ShipperInfo | null;
  pickupPincode: string;
  dropPincode: string;
  pickupAddress?: string;
  dropAddress?: string;
  pickupDate?: string;
  pickupTime?: string;
  dimensionUnit?: 'cm' | 'inch';
  boxes?: BookingBox[];
  totalBoxes: number;
  totalChargeableWeight: number;
  invoiceValue: number;
  freightCharge: number;
  customerContactName?: string;
  customerContactPhone?: string;
  customerContactEmail?: string;
  transporterAckStatus: 'pending' | 'acknowledged' | 'confirmed' | 'declined';
  transporterDeclineReason?: string;
  // WhatsApp team relay: who tapped Accept on WhatsApp, the shipment after acceptance, and files shared on WhatsApp.
  transporterAckBy?: string;
  shipmentStatus?: 'picked_up' | 'delivered' | 'completed' | 'cancelled';
  lrNumber?: string;
  podAt?: string;
  podIssue?: { text?: string; at?: string };
  invoiceNo?: string;
  ewayBillNo?: string;
  sharedFiles?: { fileId?: string; size?: number; expired?: boolean; filename: string; fromSide: 'shipper' | 'transporter'; status: string; kind?: 'lr' | 'box_slip' | 'pod' | 'freight_invoice' | 'packing_list' | 'invoice' | 'eway_bill'; at: string }[];
  createdAt: string;
}

const SHIPMENT_LABEL: Record<NonNullable<Booking['shipmentStatus']>, string> = {
  picked_up: 'LR issued', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled by shipper',
};
// Open a stored document: download with the login attached, then show it (PDF, photo) or save it (spreadsheet).
const openFile = async (bookingId: string, fileId: string, filename: string) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/bookings/${bookingId}/transporter-files/${fileId}`, { responseType: 'blob', timeout: 60000 });
    const blob = res.data as Blob;
    const url = URL.createObjectURL(blob);
    if (/^(application\/pdf|image\/)/i.test(blob.type)) {
      window.open(url, '_blank', 'noopener');
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    toast.error('This file is no longer available.');
  }
};

// Save a stored document to the computer (the open button shows it instead).
// Remove a file this team uploaded (the shipper is not messaged).
const deleteFile = async (bookingId: string, fileId: string, filename: string, done: () => void) => {
  if (!window.confirm(`Delete ${filename}? The shipper will no longer be able to open it.`)) return;
  try {
    await axios.delete(`${API_BASE_URL}/api/bookings/${bookingId}/portal/files/${fileId}`);
    toast.success('File deleted.');
    done();
  } catch (e: any) {
    toast.error(e?.response?.data?.message || 'Could not delete the file.');
  }
};

const saveFile = async (bookingId: string, fileId: string, filename: string) => {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/bookings/${bookingId}/transporter-files/${fileId}`, { responseType: 'blob', timeout: 60000 });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    toast.error('This file is no longer available.');
  }
};

const FILE_KIND: Record<string, string> = { lr: 'LR', box_slip: 'Box slip', pod: 'POD', freight_invoice: 'Freight invoice', packing_list: 'Packing list', invoice: 'Goods invoice', eway_bill: 'E-way bill' };
const fmtPhone = (p?: string) => (p && p.length === 12 ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p || '');

// `accent` drives the colored left stripe on each card (dashboard-style
// visual grouping at a glance); `badge` is the pill text/border colors.
const STATUS_THEME: Record<Booking['transporterAckStatus'], { badge: string; accent: string }> = {
  pending: { badge: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200', accent: 'bg-blue-300' },
  acknowledged: { badge: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200', accent: 'bg-blue-500' },
  confirmed: { badge: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200', accent: 'bg-blue-700' },
  declined: { badge: 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200', accent: 'bg-slate-400' },
};

// Fixed picker rather than free text — a decline reason is only useful if
// it's consistent enough to act on later (both for the shipper, once
// there's a page to show it on, and for FreightCompare's own ops).
const DECLINE_REASONS = [
  'Vehicle unavailable',
  "Route isn't covered right now",
  'Price too low',
  'Other',
];

// lucide-react has no brand glyphs by design — inline the real WhatsApp
// mark instead of a generic icon, same as BookNowModal.tsx does.
const WhatsAppIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.71 14.02c-.24.68-1.4 1.32-1.93 1.4-.5.08-1.12.11-1.81-.11-.42-.13-.95-.31-1.64-.6-2.9-1.25-4.79-4.17-4.93-4.36-.14-.19-1.17-1.56-1.17-2.98 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36h.56c.18 0 .42-.03.65.5.24.55.82 1.9.9 2.04.07.14.12.3.02.48-.1.19-.15.3-.29.46-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.23 1.6 1.99 1.1.98 2.03 1.29 2.32 1.43.29.15.46.13.63-.08.17-.2.72-.84.92-1.13.19-.29.39-.24.66-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.13.07.72-.17 1.4z" />
  </svg>
);

// Live "time to pickup" — ticks every minute (pickup windows are hours/days
// out, unlike the bidding page's second-level countdown, so this is cheap).
// Same color-tiering idea as AvailableBidsSection's bid countdown.
function usePickupCountdown(pickupDate?: string, pickupTime?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  if (!pickupDate) return null;
  const target = new Date(`${pickupDate}T${pickupTime || '00:00'}`).getTime();
  if (!Number.isFinite(target)) return null;

  const diffMs = target - now;
  const past = diffMs <= 0;
  const totalMin = Math.round(Math.abs(diffMs) / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;

  let label: string;
  if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${mins}m`;
  else label = `${mins}m`;

  const tier: 'urgent' | 'soon' | 'safe' | 'past' = past
    ? 'past'
    : totalMin <= 180
      ? 'urgent'
      : totalMin <= 1440
        ? 'soon'
        : 'safe';

  return { label: past ? `${label} ago` : `in ${label}`, tier };
}

// Always red — pickup urgency is the one thing on this card that should
// grab the eye immediately, top-right, regardless of tier.
function PickupBadge({ pickupDate, pickupTime }: { pickupDate?: string; pickupTime?: string }) {
  const countdown = usePickupCountdown(pickupDate, pickupTime);
  if (!countdown) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">
      <Clock size={12} aria-hidden="true" /> Pickup {countdown.label}
    </span>
  );
}

// A read-only field that visibly looks like a disabled form input — filled
// in with what the shipper actually typed when present, or a greyed-out
// "Not provided" placeholder when it's genuinely empty, so it's obvious at
// a glance which parts of this booking have real data and which don't.
const DetailField = ({ label, value }: { label: string; value?: string | number | null }) => {
  const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 dark:text-[#6f93b8] uppercase tracking-widest">{label}</label>
      <input
        disabled
        value={hasValue ? String(value) : ''}
        placeholder={hasValue ? undefined : 'Not provided'}
        className={`w-full px-3 py-2 rounded-lg text-sm font-medium border cursor-not-allowed ${
          hasValue ? 'bg-slate-50 dark:bg-[#08141f] border-slate-200 dark:border-[#1d3f5c] text-slate-800 dark:text-white' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-[#1d3f5c] text-slate-400 dark:text-[#6f93b8] italic'
        }`}
      />
    </div>
  );
};

// Colours by what a document is, so a list can be read at a glance (neutral grey for anything else).
const KIND_TONE: Record<string, string> = {
  lr: 'bg-blue-50 text-blue-700 border-blue-200',
  pod: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  box_slip: 'bg-amber-50 text-amber-800 border-amber-200',
  freight_invoice: 'bg-rose-50 text-rose-700 border-rose-200',
  invoice: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  packing_list: 'bg-teal-50 text-teal-700 border-teal-200',
  eway_bill: 'bg-orange-50 text-orange-800 border-orange-200',
};
const fileSize = (n?: number) => (n ? (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`) : '');

// Everything on this booking from either side (and anything shared on WhatsApp), as a table: open or download each file.
const BookingFilesModal = ({ booking, onClose, onChanged, readOnly, initialKind }: { booking: Booking; onClose: () => void; onChanged: () => void; readOnly?: boolean; initialKind?: string }) => {
  const files = booking.sharedFiles || [];
  const th = 'border-b border-slate-200 dark:border-[#1d3f5c] bg-slate-50 dark:bg-white/5 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap';
  const td = 'border-b border-slate-100 dark:border-[#1d3f5c] px-3 py-2.5 align-middle text-xs text-slate-700 dark:text-[#c9dbec]';
  const neutral = 'inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-[#1d3f5c] bg-white dark:bg-transparent px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5';
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-[#0d2438] w-[94vw] max-w-5xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-900 px-5 py-4 text-white relative rounded-t-2xl">
          <button onClick={onClose} aria-label="Close" className="absolute top-3.5 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
          <h3 className="text-base font-bold">Files for booking {booking.bookingCode}</h3>
          <p className="text-slate-400 text-xs mt-0.5">Documents from both sides. Open a file to read it, or download it.</p>
        </div>
        {/* Save the LR / AWB number, or send the LR copy, box slip, POD: the shipper is told on every channel. */}
        <div className="px-5 pt-1"><BookingActions booking={booking} onChanged={onChanged} onDone={onClose} readOnly={readOnly} initialKind={initialKind} /></div>
        <div className="p-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
            {/* Fixed column widths: the file name gets the room, and Open / Download / Delete sit in the same place on every row. */}
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col className="w-[120px]" /><col className="w-[90px]" /><col className="w-[140px]" /><col className="w-[70px]" /><col className="w-[260px]" /></colgroup>
              <thead>
                <tr><th className={th}>File</th><th className={th}>Type</th><th className={th}>From</th><th className={th}>Date</th><th className={th}>Size</th><th className={`${th} text-right`}>Actions</th></tr>
              </thead>
              <tbody>
                {files.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500 dark:text-[#8fb0cf]">No files were uploaded for this booking.</td></tr>}
                {files.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.03]">
                    <td className={td}><span className="flex items-center gap-2"><Paperclip size={13} className="shrink-0 text-slate-400" /><span className="min-w-0 break-words font-semibold text-slate-900 dark:text-white" title={f.filename}>{f.filename}</span></span></td>
                    <td className={`${td} whitespace-nowrap`}>
                      {f.kind ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${KIND_TONE[f.kind] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{FILE_KIND[f.kind] || f.kind}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{f.fromSide === 'shipper' ? 'Shipper' : 'Your team'}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{new Date(f.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums text-slate-500`}>{fileSize(f.size) || '—'}</td>
                    <td className={`${td} text-right`}>
                      {f.fileId ? (
                        <div className="grid grid-cols-[1fr_1fr_32px] items-center gap-1.5">
                          <button type="button" onClick={() => openFile(booking._id, f.fileId!, f.filename)} className={`${neutral} justify-center`}><Eye size={13} /> Open</button>
                          <button type="button" onClick={() => saveFile(booking._id, f.fileId!, f.filename)} className={`${neutral} justify-center`}><Download size={13} /> Download</button>
                          {f.fromSide === 'transporter' && !readOnly && booking.shipmentStatus !== 'completed' ? (
                            <button type="button" aria-label={`Delete ${f.filename}`} title="Delete this file" onClick={() => deleteFile(booking._id, f.fileId!, f.filename, onChanged)} className="inline-flex h-[26px] items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
                          ) : <span />}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{f.expired ? 'Deleted after 12 months' : 'Only in WhatsApp'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
// Booking detail modal — same fields the shipper's Book Now form collects
// (see freight-compare-frontend's BookNowModal.tsx), rendered read-only so
// the transporter sees exactly what was submitted, including gaps.
const BookingDetailModal = ({ booking, onClose, onChanged, readOnly, pin }: { booking: Booking; onClose: () => void; onChanged: () => void; readOnly?: boolean; pin?: React.CSSProperties }) => {
  const shipperName = [booking.customerID?.firstName, booking.customerID?.lastName].filter(Boolean).join(' ') || booking.customerID?.companyName || 'A shipper';
  const boxes = booking.boxes || [];
  const unit = booking.dimensionUnit || 'cm';

  // Opening a booking reads the shipper's documents (invoice, e-way bill, packing list) and fills the invoice / e-way bill numbers that
  // are still empty; the list is refreshed when something was filled. The server also does this as soon as a document arrives.
  useEffect(() => {
    if (readOnly || (booking.invoiceNo && booking.ewayBillNo)) return;
    axios.post(`${API_BASE_URL}/api/bookings/${booking._id}/portal/detect-details`)
      .then((r) => { if (r.data?.filled?.length) onChanged(); })
      .catch(() => { /* best effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking._id]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={pin}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#0d2438] w-[94vw] max-w-6xl rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto"
        style={pin?.height ? { maxHeight: '100%' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-6 py-4 text-white relative rounded-t-2xl">
          <button onClick={onClose} className="absolute top-3.5 right-4 text-slate-400 dark:text-[#6f93b8] hover:text-white transition-colors">
            <X size={20} />
          </button>
          <h3 className="text-lg font-bold">Booking {booking.bookingCode}</h3>
          <p className="text-slate-400 dark:text-[#6f93b8] text-xs mt-0.5">Exactly what {shipperName} submitted.</p>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* LEFT: route/schedule/address/value fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="Pickup Pincode" value={booking.pickupPincode} />
              <DetailField label="Drop Pincode" value={booking.dropPincode} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="Pickup Date" value={booking.pickupDate} />
              <DetailField label="Pickup Time" value={booking.pickupTime} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CopyableAddress label="Pickup Address" value={booking.pickupAddress} />
              <CopyableAddress label="Drop Address" value={booking.dropAddress} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailField label="Invoice Value (₹)" value={booking.invoiceValue > 0 ? booking.invoiceValue.toLocaleString('en-IN') : null} />
              <DetailField label="Invoice No" value={booking.invoiceNo || null} />
              <DetailField label="E-way Bill No" value={booking.ewayBillNo || null} />
              <DetailField label="Freight Charge (₹)" value={booking.freightCharge > 0 ? booking.freightCharge.toLocaleString('en-IN') : null} />
            </div>
            {booking.transporterAckStatus === 'declined' && (
              <DetailField label="Decline Reason (from you)" value={booking.transporterDeclineReason} />
            )}
            {(booking.shipmentStatus || booking.lrNumber || booking.transporterAckBy) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DetailField label="Shipment" value={booking.shipmentStatus ? SHIPMENT_LABEL[booking.shipmentStatus] : null} />
                <DetailField label="LR / AWB No." value={booking.lrNumber} />
                <DetailField label="Handled by (WhatsApp)" value={fmtPhone(booking.transporterAckBy)} />
              </div>
            )}
            <BookingActions booking={booking} onChanged={onChanged} readOnly={readOnly} />
            {booking.podIssue?.text && (
              <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
                <span className="font-bold">Issue reported by the shipper:</span> {booking.podIssue.text}
              </div>
            )}
            {(booking.sharedFiles?.length ?? 0) > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-[#1d3f5c]">
                <p className="text-[10px] font-bold text-slate-400 dark:text-[#6f93b8] uppercase tracking-widest mb-1.5">Files</p>
                <ul className="divide-y divide-slate-100 dark:divide-[#1d3f5c] rounded-lg border border-slate-200 dark:border-[#1d3f5c] text-xs">
                  {booking.sharedFiles!.map((f, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5 text-slate-700 dark:text-[#8fb0cf]">
                      {f.fileId ? (
                        <button type="button" onClick={() => openFile(booking._id, f.fileId!, f.filename)} className="font-semibold text-blue-700 dark:text-blue-300 hover:underline break-all text-left">{f.filename}</button>
                      ) : (
                        <span className="font-semibold text-slate-800 dark:text-white break-all">{f.filename}</span>
                      )}
                      {f.kind && <span className="rounded bg-blue-50 dark:bg-blue-900/20 px-1.5 text-blue-700 dark:text-blue-300">{FILE_KIND[f.kind]}</span>}
                      <span>{f.fromSide === 'shipper' ? 'from the shipper' : 'from your team'}</span>
                      <span className="text-slate-400">· {new Date(f.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {f.status === 'failed' && <span className="text-red-600 dark:text-red-400">· not delivered</span>}
                      {!f.fileId && <span className="text-slate-400">· {f.expired ? 'deleted after 12 months' : 'only in WhatsApp'}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-[#6f93b8]">Click a file to open it. Files over 5 MB stay in your WhatsApp chat with FreightCompare.</p>
              </div>
            )}

            {!(booking.shipmentStatus === 'cancelled' || booking.transporterAckStatus === 'declined') && (
            <div className="pt-2 border-t border-slate-100 dark:border-[#1d3f5c]">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#6f93b8] uppercase tracking-widest mb-1.5">Shipper's Customer (optional, if notified)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DetailField label="Name" value={booking.customerContactName} />
                <DetailField label="Phone" value={booking.customerContactPhone} />
                <DetailField label="Email" value={booking.customerContactEmail} />
              </div>
            </div>
            )}
          </div>

          {/* RIGHT: packing list — same slot BookNowModal.tsx uses for it */}
          <div className="lg:border-l lg:border-slate-200 lg:pl-6">
            <p className="text-[10px] font-bold text-slate-400 dark:text-[#6f93b8] uppercase tracking-widest mb-1.5">Packing List</p>
            {boxes.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-500 dark:text-[#8fb0cf] uppercase text-[10px] bg-slate-100 dark:bg-white/5">
                      <th className="text-left py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">Box no</th>
                      <th className="text-left py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">Qty</th>
                      <th className="text-left py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">Desc</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">L ({unit})</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">W ({unit})</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">H ({unit})</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200 dark:border-[#1d3f5c]">Wt (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((b, i) => (
                      <tr key={i} className="bg-white dark:bg-[#0d2438]">
                        <td className="py-1.5 px-2 text-left text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.boxNo || '-'}</td>
                        <td className="py-1.5 px-2 text-center font-semibold text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.count ?? '-'}</td>
                        <td className="py-1.5 px-2 text-left text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.description || '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.length ?? '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.width ?? '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.height ?? '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 dark:text-[#8fb0cf] border border-slate-200 dark:border-[#1d3f5c]">{b.weight ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-[#6f93b8] italic bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-[#1d3f5c] rounded-lg px-3 py-2">Not provided</p>
            )}
            <p className="text-xs text-slate-500 dark:text-[#8fb0cf] mt-2">
              Total: {booking.totalBoxes} box{booking.totalBoxes === 1 ? '' : 'es'} · {booking.totalChargeableWeight} kg chargeable
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Decline reason picker — small, fixed set of reasons rather than free text
// (see DECLINE_REASONS comment). "Skip" still declines, just without a
// reason recorded, so this is never a blocker on the actual action.
const DeclineReasonModal = ({
  onPick,
  onSkip,
  onClose,
  pin,
}: {
  onPick: (reason: string) => void;
  onSkip: () => void;
  onClose: () => void;
  pin?: React.CSSProperties;
}) => createPortal(
  <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" style={pin} onClick={onClose}>
    <div className="bg-white dark:bg-[#0d2438] w-full max-w-sm rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Why decline this booking?</h3>
      <p className="text-xs text-slate-500 dark:text-[#8fb0cf] mb-4">Optional, but it helps the shipper understand what happened.</p>
      <div className="space-y-2">
        {DECLINE_REASONS.map((reason) => (
          <button
            key={reason}
            onClick={() => onPick(reason)}
            className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-slate-700 dark:text-[#8fb0cf] bg-slate-50 dark:bg-[#08141f] border border-slate-200 dark:border-[#1d3f5c] rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 transition-colors"
          >
            {reason}
          </button>
        ))}
      </div>
      <button
        onClick={onSkip}
        className="w-full mt-3 px-3.5 py-2 text-xs font-semibold text-slate-400 dark:text-[#6f93b8] hover:text-slate-600 transition-colors"
      >
        Skip — decline without a reason
      </button>
    </div>
  </div>,
  document.body
);

// "Actions" dropdown for a table row. Opens on hover (and on click, for touch). Rendered in a portal with fixed
// coordinates so the table's horizontal-scroll wrapper cannot clip it.
type MenuItem = { label: string; icon: React.ReactNode; onClick: () => void; tone?: 'primary' | 'danger'; disabled?: boolean };
const ActionsMenu = ({ items }: { items: MenuItem[] }) => {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = () => {
    window.clearTimeout(timer.current);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  const closeSoon = () => { timer.current = window.setTimeout(() => setPos(null), 160); };
  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos]);
  if (items.length === 0) return null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={open}
        onMouseLeave={closeSoon}
        onClick={() => (pos ? setPos(null) : open())}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#1d3f5c] dark:bg-transparent dark:text-white dark:hover:bg-white/5 whitespace-nowrap"
      >
        Actions <ChevronDown size={12} className={`transition-transform ${pos ? 'rotate-180' : ''}`} />
      </button>
      {pos && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={closeSoon}
          className="z-[9998] min-w-[180px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-[#1d3f5c] dark:bg-[#0d2438]"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={it.disabled}
              onClick={() => { setPos(null); it.onClick(); }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold disabled:opacity-50 ${
                it.tone === 'danger' ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                : it.tone === 'primary' ? 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-white/5'
                : 'text-slate-700 hover:bg-slate-50 dark:text-white dark:hover:bg-white/5'}`}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};

// Where a booking stands (same rules as the server's dashboard, services/lineDashboard.js), so the aggregator's list can be sorted by
// what each booking needs next instead of a single "Upcoming / History" split (an accepted booking used to vanish into History).
type Stage = 'pendingAccept' | 'awaitingLr' | 'inTransit' | 'awaitingPod' | 'done' | 'closed';
const stageOf = (b: Booking): Stage => {
  if (b.transporterAckStatus === 'declined' || b.shipmentStatus === 'cancelled') return 'closed';
  if (b.podAt || b.shipmentStatus === 'completed') return 'done';
  if (b.shipmentStatus === 'delivered') return 'awaitingPod';
  if (b.shipmentStatus === 'picked_up' || b.lrNumber) return 'inTransit';
  if (b.transporterAckStatus === 'confirmed') return 'awaitingLr';
  return 'pendingAccept';
};
const STAGE_TABS: { key: Stage; label: string; action: boolean; hint: string }[] = [
  { key: 'pendingAccept', label: 'Needs reply', action: true, hint: 'Nobody has answered yet: confirm or decline.' },
  { key: 'awaitingLr', label: 'Needs AWB', action: true, hint: 'Accepted: add the LR / AWB number when the courier picks it up.' },
  { key: 'inTransit', label: 'In transit', action: false, hint: 'Picked up and on the way.' },
  { key: 'awaitingPod', label: 'Needs POD', action: true, hint: 'Delivered: send the proof of delivery (POD).' },
  { key: 'done', label: 'Done', action: false, hint: 'Delivered with the proof received.' },
  { key: 'closed', label: 'Declined / cancelled', action: false, hint: 'Declined by the courier or cancelled by the shipper.' },
];

// `linesMode`: an aggregator organisation's bookings screen (on Courier lines): every courier's bookings in one list, with the same
// Confirm / Decline / Send LR / box slip / POD / files actions a transporter has. Each action is sent for that booking's courier.
const BookingsPage: React.FC<{ linesMode?: boolean }> = ({ linesMode = false }) => {
  const { user, isAuthenticated } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [filesId, setFilesId] = useState<string | null>(null);
  const [filesKind, setFilesKind] = useState<string | undefined>(undefined);
  const openFiles = (id: string, kind?: string) => { setFilesKind(kind); setFilesId(id); };
  const filesBooking = bookings.find((x) => x._id === filesId) || null; // from the live list, so a file just sent shows at once
  const readOnlyLogin = !!user?.isLine && user?.role !== 'employee';
  const [decliningBooking, setDecliningBooking] = useState<Booking | null>(null);

  // Tracks booking ids already seen this page session — anything that shows
  // up in a LATER poll and wasn't here on the first load gets a toast. Ref,
  // not state: it's bookkeeping for the effect below, not something that
  // should trigger a re-render on its own.
  const knownIdsRef = useRef<Set<string> | null>(null);

  // /dashboard?booking=<id> (from the header bell or the notifications page) opens that booking.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantedId = searchParams.get('booking');

  const fetchBookings = useCallback(async (silent = false) => {
    if (!user?._id) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await axios.get<{ success: boolean; data: Booking[] }>(
        linesMode ? `${API_BASE_URL}/api/transporter/lines/bookings` : `${API_BASE_URL}/api/bookings/transporter/${user._id}`
      );
      const fresh = res.data.data;

      if (knownIdsRef.current === null) {
        // First load this session — nothing to compare against, just record it.
        knownIdsRef.current = new Set(fresh.map((b) => b._id));
      } else {
        const newlyArrived = fresh.filter((b) => !knownIdsRef.current!.has(b._id));
        knownIdsRef.current = new Set(fresh.map((b) => b._id));
        for (const b of newlyArrived) {
          const shipperName = [b.customerID?.firstName, b.customerID?.lastName].filter(Boolean).join(' ') || b.customerID?.companyName || 'A shipper';
          toast.success(`New booking from ${shipperName} — ${b.pickupPincode} → ${b.dropPincode}`, { icon: '📦', duration: 6000 });
        }
      }

      setBookings(fresh);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
      if (!silent) setError('Failed to fetch bookings.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?._id, linesMode]);

  // The open booking follows the latest data: after saving an AWB the card shows it at once.
  useEffect(() => {
    setViewingBooking((cur) => (cur ? bookings.find((b) => b._id === cur._id) || cur : cur));
  }, [bookings]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchBookings();
    const id = setInterval(() => fetchBookings(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, fetchBookings]);

  // Business and owner-operator alike: no rates yet → every "rates" entry point goes to first-time setup.
  const { needsSetup, isAggregator, setupPath } = useRateSetup();
  const publicEligible = !!usePublicStatus().status?.eligible;
  const ratesLink = needsSetup ? setupPath : '/profile/rates';

  // Without this the embedding parent iframe never learns this page grew
  // (e.g. a modal opening), so it stays sized for the plain list and the
  // modal renders partly off the visible page instead of centered in view
  // — same fix every other page here already has.
  useReportIframeHeight([bookings.length, viewingBooking, filesBooking, decliningBooking, loading, error, needsSetup]);

  // Without this, the two modals below — centered via `fixed inset-0` — center
  // themselves against this iframe's full auto-grown content height instead of
  // the physically visible screen, which is what made "View Details" open a
  // popup the user had to scroll far down to actually see.
  const modalPin = useModalIframePin(!!viewingBooking || !!filesBooking || !!decliningBooking);

  const setAckStatus = async (bookingId: string, status: 'acknowledged' | 'confirmed' | 'declined', reason?: string) => {
    if (!user?._id) return;
    setActingOn(bookingId);
    try {
      // expectedStatus: what this screen was showing. If a teammate already decided on WhatsApp, the server says 409
      // instead of silently overriding them.
      const shown = bookings.find((b) => b._id === bookingId)?.transporterAckStatus;
      await axios.patch(`${API_BASE_URL}/api/bookings/${bookingId}/ack`, {
        transporterId: linesMode ? bookings.find((b) => b._id === bookingId)?.lineId : user._id,
        status,
        ...(shown ? { expectedStatus: shown } : {}),
        ...(reason ? { reason } : {}),
      });
      setBookings((prev) => prev.map((b) => (
        b._id === bookingId ? { ...b, transporterAckStatus: status, transporterAckBy: '', ...(reason ? { transporterDeclineReason: reason } : {}) } : b
      )));
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast(err.response.data?.message || 'This booking changed in the meantime.', { icon: 'ℹ️', duration: 6000 });
        fetchBookings(true);
        return;
      }
      console.error('Failed to update booking status:', err);
      toast.error('Could not update this booking — please try again.');
    } finally {
      setActingOn(null);
    }
  };

  // "Delete for me": gone from this list only (the shipper still has it).
  const removeForMe = async (b: Booking) => {
    if (!window.confirm(`Remove booking ${b.bookingCode} from your list? This only removes it for you; the shipper still sees it.`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/bookings/${b._id}/portal`);
      setBookings((prev) => prev.filter((x) => x._id !== b._id));
    } catch { toast.error('Could not remove it right now — please try again.'); }
  };

  const handleDeclineClick = (booking: Booking) => setDecliningBooking(booking);
  const confirmDecline = (reason?: string) => {
    if (!decliningBooking) return;
    setAckStatus(decliningBooking._id, 'declined', reason);
    setDecliningBooking(null);
  };

  const byCreatedDesc = (a: Booking, b: Booking) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  // One tab per stage (what each booking needs next), opening on the first stage that has something to do. An accepted booking
  // stays visible (Needs AWB / In transit / Needs POD) instead of vanishing into a "History" tab.
  const [stageTab, setStageTab] = useState<Stage | 'all' | null>(null);
  const byStage = useMemo(() => {
    const m: Record<string, Booking[]> = {};
    for (const b of bookings) (m[stageOf(b)] ||= []).push(b);
    for (const k of Object.keys(m)) m[k].sort(byCreatedDesc);
    return m;
  }, [bookings]);
  useEffect(() => {
    if (stageTab !== null || bookings.length === 0) return;
    setStageTab((['pendingAccept', 'awaitingLr', 'awaitingPod', 'inTransit'] as Stage[]).find((k) => byStage[k]?.length) || 'done');
  }, [stageTab, bookings.length, byStage]);
  useEffect(() => {
    if (!wantedId || bookings.length === 0) return;
    const hit = bookings.find((x) => x._id === wantedId);
    if (hit) {
      setStageTab(stageOf(hit));
      setViewingBooking(hit);
    } else {
      toast('That booking is no longer in your list.', { icon: 'ℹ️' });
    }
    setSearchParams({}, { replace: true });
  }, [wantedId, bookings, setSearchParams]);

  // Count of pending bookings still inside the "New" window — drives the
  // notification dot next to the Upcoming tab so a new arrival is visible
  // without needing to catch the (also still-firing) toast in time.
  const newCount = useMemo(
    () => bookings.filter((b) => b.transporterAckStatus === 'pending' && b.shipmentStatus !== 'cancelled' && (Date.now() - new Date(b.createdAt).getTime()) < NEW_BADGE_WINDOW_MS).length,
    [bookings]
  );

  // All-time, this transporter's own numbers only — a factual "here's what
  // FreightCompare has brought you" line, not a platform-wide vanity metric.
  const stats = useMemo(() => {
    const totalOrders = bookings.length;
    const totalValue = bookings.reduce((sum, b) => sum + (b.freightCharge || b.invoiceValue || 0), 0);
    const confirmed = bookings.filter((b) => b.transporterAckStatus === 'confirmed').length;
    const pending = bookings.filter((b) => b.transporterAckStatus === 'pending' && b.shipmentStatus !== 'cancelled').length;
    return { totalOrders, totalValue, confirmed, pending };
  }, [bookings]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-[#08141f]">
        <p className="text-lg font-semibold text-red-600 dark:text-red-400">Please log in to view bookings.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Bottom space (also in linesMode): the Actions menu opens downwards, and the page the portal is embedded in sizes to this
          content, so without it the menu is cut off by the footer. */}
      <div className={linesMode ? 'w-full pb-48' : 'mx-auto w-full max-w-[1600px] px-4 pt-4 pb-48 sm:px-6 lg:px-8'}>
        {/* linesMode (the aggregator dashboard) has no heading here: its Refresh button sits at the end of the stage tabs. */}
        {!linesMode && <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome back{(user as any)?.companyName ? `, ${displayCompanyName((user as any).companyName)}` : ''}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}{bookings.length} booking{bookings.length === 1 ? '' : 's'} from shippers
            </p>
          </div>
          <button
            onClick={() => { fetchBookings(); window.dispatchEvent(new Event(PUBLIC_STATUS_REFRESH_EVENT)); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors dark:border-[#1d3f5c] dark:bg-[#0d2438] dark:text-white dark:hover:bg-white/5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>}

        {!linesMode && <div className="mb-5"><GoPublicCard wide /></div>}
        {!linesMode && isAggregator && <div className="mb-5"><AggregatorBanner /></div>}
        {!linesMode && needsSetup && !publicEligible && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
            <AlertTriangle size={20} className="flex-none text-blue-600 dark:text-blue-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-blue-800 dark:text-white">Add your rates to start receiving bookings</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">Shippers can't see or book you until your rates are set up.</p>
            </div>
            <Link to={setupPath} className="inline-flex flex-none items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
              Set up rates <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Stats: one card, four columns; icons in the accent colour (blue-* follows the website accent, index.css).
            Always shown (0s included) so the dashboard never looks empty. Amber only when something is pending. */}
        <div className={`mb-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4 dark:border-[#1d3f5c] dark:bg-[#0d2438] ${linesMode ? 'hidden' : ''}`}>
          {[
            { label: `Order${stats.totalOrders === 1 ? '' : 's'} via FreightCompare`, value: String(stats.totalOrders), icon: <TrendingUp size={14} /> },
            { label: 'Pending action', value: String(stats.pending), icon: <Bell size={14} />, alert: stats.pending > 0 },
            { label: 'Confirmed', value: String(stats.confirmed), icon: <CheckCircle2 size={14} /> },
            { label: 'Total business value', value: `₹${stats.totalValue.toLocaleString('en-IN')}`, icon: <IndianRupee size={14} /> },
          ].map((c, i) => (
            <div key={c.label} className={`flex items-center justify-between gap-2 px-4 py-1.5 ${i % 2 ? 'border-l' : ''} ${i > 1 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''} border-slate-200 dark:border-[#1d3f5c]`}>
              <div className={`flex min-w-0 items-center gap-1.5 text-xs ${c.alert ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-[#8fb0cf]'}`}>
                <span className={c.alert ? '' : 'text-slate-400 dark:text-[#6f93b8]'}>{c.icon}</span>
                <span className="truncate">{c.label}</span>
              </div>
              <p className={`shrink-0 text-sm font-bold tracking-tight ${c.alert ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white'}`}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="min-w-0">
        {loading && bookings.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-blue-500 mr-3" />
            <p className="text-slate-500 dark:text-[#8fb0cf] text-sm font-medium">Loading bookings…</p>
          </div>
        ) : error ? (
          <div className="p-5 text-center bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-2xl max-w-md mx-auto">
            <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
            <button
              onClick={() => fetchBookings()}
              className="mt-4 px-4 py-2 font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 px-4 border-2 border-dashed border-slate-200 dark:border-[#1d3f5c] rounded-2xl bg-white dark:bg-[#0d2438]">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
              <Bell size={20} />
            </div>
            <p className="text-slate-700 dark:text-[#8fb0cf] font-semibold">No bookings yet</p>
            <p className="text-sm text-slate-400 dark:text-[#6f93b8] mt-1 max-w-sm mx-auto">
              {linesMode ? 'When a shipper books one of your couriers, it shows up here and you can confirm it, decline it and send the AWB.' : 'When a shipper books you directly, it will show up here. Keep your rates up to date so shippers can find and book you.'}
            </p>
            {!linesMode && (
              <Link to={ratesLink} className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-xl hover:bg-blue-100 transition-colors">
                {needsSetup ? 'Set up my rates' : 'Review my lane rates'} <ArrowRight size={14} />
              </Link>
            )}
          </div>
        ) : (() => {
            const digitsOnly = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');
            // ERP-style register: one row per booking, one column per value, gridlines on every cell.
            // linesMode (the aggregator's all-couriers list) is tighter so it fits the page without a sideways scrollbar.
            const pad = linesMode ? 'px-2' : 'px-3';
            const th = `border border-slate-200 dark:border-[#1d3f5c] bg-slate-100 dark:bg-white/5 ${pad} py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#8fb0cf] whitespace-nowrap`;
            const td = `border border-slate-200 dark:border-[#1d3f5c] ${pad} py-2 align-top text-xs text-slate-700 dark:text-[#c9dbec]`;
            const btn = 'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-[#1d3f5c] dark:bg-transparent dark:text-white dark:hover:bg-white/5 whitespace-nowrap';
            // Same rule BookingActions uses: only an accepted, still-open booking on an owner / employee login can send documents.
            // Sending a document on a booking nobody has answered yet accepts it (the server does that first), like a reply by e-mail.
            const canSendDocs = (b: Booking) => ['pending', 'acknowledged', 'confirmed'].includes(b.transporterAckStatus) && !readOnlyLogin && !['cancelled', 'completed'].includes(b.shipmentStatus || '') && !b.podAt;
            const renderRow = (b: Booking, i: number) => {
              const shipperName = [b.customerID?.firstName, b.customerID?.lastName].filter(Boolean).join(' ') || b.customerID?.companyName || 'A shipper';
              const isCancelled = b.shipmentStatus === 'cancelled';
              const isPending = b.transporterAckStatus === 'pending' && !isCancelled;
              const isAckedOnly = b.transporterAckStatus === 'acknowledged' && !isCancelled;
              const isNew = isPending && (Date.now() - new Date(b.createdAt).getTime()) < NEW_BADGE_WINDOW_MS;
              const showContact = !(isCancelled || b.transporterAckStatus === 'declined');
              const status = STATUS_THEME[b.transporterAckStatus];
              return (
                <tr key={b._id} className={i % 2 ? 'bg-slate-50/60 dark:bg-white/[0.03]' : 'bg-white dark:bg-[#0d2438]'}>
                  <td className={td}>
                    <p className="font-bold text-slate-900 dark:text-white whitespace-nowrap">{b.bookingCode}</p>
                    <p className="text-[11px] text-slate-400 whitespace-nowrap">{new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </td>
                  {linesMode && <td className={`${td} font-semibold text-slate-900 dark:text-white`}>{b.line || '—'}</td>}
                  <td className={td}>
                    <p className="font-semibold text-slate-900 dark:text-white">{shipperName}</p>
                    {b.customerID?.companyName && shipperName !== b.customerID.companyName && <p className="text-[11px] text-slate-500">{b.customerID.companyName}</p>}
                  </td>
                  <td className={`${td} ${linesMode ? 'min-w-[150px] max-w-[190px]' : 'min-w-[230px]'}`}>
                    {showContact && (b.customerID?.phone || b.customerID?.email) ? (
                      <div className="space-y-0.5">
                        {b.customerID?.phone && (
                          <p className="flex items-center gap-1.5 whitespace-nowrap">
                            <a href={`tel:${digitsOnly(b.customerID.phone)}`} className="inline-flex items-center gap-1 hover:text-blue-700"><Phone size={11} /> {b.customerID.phone}</a>
                            <a href={`https://wa.me/91${digitsOnly(b.customerID.phone)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="text-emerald-600 hover:text-emerald-700"><WhatsAppIcon size={12} /></a>
                          </p>
                        )}
                        {b.customerID?.email && <a href={`mailto:${b.customerID.email}`} className="flex items-center gap-1 break-all hover:text-blue-700"><Mail size={11} className="shrink-0" /> {b.customerID.email}</a>}
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums`}>
                    {b.pickupPincode} <ArrowRight size={11} className="inline text-slate-400" /> {b.dropPincode}
                    {linesMode && <p className="text-[11px] font-normal text-slate-500">{b.totalBoxes} box{b.totalBoxes === 1 ? '' : 'es'} · {b.totalChargeableWeight} kg</p>}
                  </td>
                  {!linesMode && <td className={`${td} whitespace-nowrap tabular-nums`}>{b.totalBoxes} box{b.totalBoxes === 1 ? '' : 'es'}<br /><span className="text-slate-500">{b.totalChargeableWeight} kg</span></td>}
                  <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums text-slate-900 dark:text-white`}>₹{(b.freightCharge || b.invoiceValue || 0).toLocaleString('en-IN')}</td>
                  <td className={`${td} tabular-nums ${linesMode ? '' : 'whitespace-nowrap'}`}>
                    {b.pickupDate || '—'} {b.pickupTime || ''}
                    {(isPending || isAckedOnly) && <div><PickupBadge pickupDate={b.pickupDate} pickupTime={b.pickupTime} /></div>}
                  </td>
                  <td className={td}>
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${status.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.accent}`} />{b.transporterAckStatus}
                      </span>
                      {isNew && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white">New</span>}
                      {b.shipmentStatus && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isCancelled ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'}`}>{SHIPMENT_LABEL[b.shipmentStatus]}</span>
                      )}
                      {b.transporterAckStatus === 'declined' && b.transporterDeclineReason && <span className="text-[11px] text-red-600">{b.transporterDeclineReason}</span>}
                    </div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{b.lrNumber || <span className="text-slate-300">—</span>}</td>
                  <td className={td}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewingBooking(b)} className={btn}><Eye size={12} /> View</button>
                      {!readOnlyLogin && <button onClick={() => removeForMe(b)} title="Remove from my list" aria-label={`Remove booking ${b.bookingCode} from my list`} className="inline-flex rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                      <ActionsMenu items={[
                        ...((isPending || isAckedOnly) ? [{ label: 'Confirm booking', icon: <CheckCircle2 size={13} />, tone: 'primary' as const, disabled: actingOn === b._id, onClick: () => setAckStatus(b._id, 'confirmed') }] : []),
                        ...(isPending ? [{ label: 'Acknowledge', icon: <ThumbsUp size={13} />, disabled: actingOn === b._id, onClick: () => setAckStatus(b._id, 'acknowledged') }] : []),
                        ...(canSendDocs(b) ? [
                          { label: 'Send LR / AWB', icon: <Paperclip size={13} />, onClick: () => openFiles(b._id, 'lr') },
                          { label: 'Send box slip', icon: <Paperclip size={13} />, onClick: () => openFiles(b._id, 'box_slip') },
                          { label: 'Send POD', icon: <Paperclip size={13} />, onClick: () => openFiles(b._id, 'pod') },
                        ] : []),
                        { label: `View files${(b.sharedFiles?.length ?? 0) > 0 ? ` (${b.sharedFiles!.length})` : ''}`, icon: <Paperclip size={13} />, onClick: () => openFiles(b._id) },
                        ...((isPending || isAckedOnly) ? [{ label: 'Decline', icon: <XCircle size={13} />, tone: 'danger' as const, disabled: actingOn === b._id, onClick: () => handleDeclineClick(b) }] : []),
                      ]} />
                    </div>
                  </td>
                </tr>
              );
            };
            const renderTable = (list: Booking[]) => (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
                <table className={`w-full border-collapse ${linesMode ? '' : 'min-w-[1150px]'}`}>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className={th}>Booking</th>
                      {linesMode && <th className={th}>Courier</th>}
                      <th className={th}>Shipper</th>
                      <th className={th}>Contact</th>
                      <th className={th}>{linesMode ? 'Route / load' : 'Route'}</th>
                      {!linesMode && <th className={th}>Load</th>}
                      <th className={`${th} text-right`}>Freight</th>
                      <th className={th}>Pickup</th>
                      <th className={th}>Status</th>
                      <th className={th}>LR / AWB</th>
                      <th className={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>{list.map(renderRow)}</tbody>
                </table>
              </div>
            );

            {
              const tab = stageTab ?? 'pendingAccept';
              const shown = tab === 'all' ? [...bookings].sort(byCreatedDesc) : byStage[tab] || [];
              const hint = tab === 'all' ? 'Every booking, newest first.' : STAGE_TABS.find((t) => t.key === tab)?.hint;
              const tabCls = (on: boolean, hot: boolean) => `relative flex items-center gap-1.5 px-1 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${on ? 'border-blue-600 text-blue-700 dark:text-blue-300' : `border-transparent ${hot ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-[#6f93b8]'} hover:text-slate-900 dark:hover:text-white`}`;
              return (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-200 dark:border-[#1d3f5c]">
                    {STAGE_TABS.map((t) => {
                      const n = byStage[t.key]?.length || 0;
                      return (
                        <button key={t.key} onClick={() => setStageTab(t.key)} className={tabCls(tab === t.key, n > 0)}>
                          {t.label}
                          <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black ${n > 0 && t.action ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500 dark:bg-white/10'}`}>{n}</span>
                          {t.key === 'pendingAccept' && newCount > 0 && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="New booking" />}
                        </button>
                      );
                    })}
                    <button onClick={() => setStageTab('all')} className={tabCls(tab === 'all', true)}>All <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-slate-100 px-1 text-[10px] font-black text-slate-500 dark:bg-white/10">{bookings.length}</span></button>
                    {/* A single organisation list has no heading, so its Refresh sits here; the transporter page keeps its header Refresh. */}
                    {linesMode && <button
                      type="button"
                      onClick={() => { fetchBookings(); }}
                      disabled={loading}
                      title="Refresh bookings"
                      className="ml-auto mb-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-[#1d3f5c] dark:bg-[#0d2438] dark:text-white"
                    >
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>}
                  </div>
                  {hint && <p className="mb-3 text-xs text-slate-500 dark:text-[#8fb0cf]">{hint}</p>}
                  {shown.length > 0 ? renderTable(shown) : <p className="text-sm italic text-slate-400 dark:text-[#6f93b8]">Nothing here right now.</p>}
                </div>
              );
            }
          })()}
        </div>
      </div>

      {filesBooking && <BookingFilesModal booking={filesBooking} initialKind={filesKind} onClose={() => setFilesId(null)} onChanged={() => fetchBookings(true)} readOnly={readOnlyLogin} />}
      {viewingBooking && (
        <BookingDetailModal booking={viewingBooking} onClose={() => setViewingBooking(null)} onChanged={() => fetchBookings(true)} readOnly={readOnlyLogin} pin={modalPin} />
      )}

      {decliningBooking && (
        <DeclineReasonModal
          onPick={(reason) => confirmDecline(reason)}
          onSkip={() => confirmDecline(undefined)}
          onClose={() => setDecliningBooking(null)}
          pin={modalPin}
        />
      )}
    </div>
  );
};

export default BookingsPage;
