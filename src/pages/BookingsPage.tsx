// src/pages/BookingsPage.tsx
//
// Real-time(ish) view of bookings shippers have made against this
// transporter's account via the "Book Now" flow — closes the loop that
// previously ended at an email into the transporter's inbox. Polls rather
// than pushes (see brainstorming discussion): simple, no new infra, and a
// human checking a dashboard tab doesn't need sub-second delivery.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  RefreshCw, MapPin, Package, IndianRupee, Clock, Mail, Phone,
  User as UserIcon, CheckCircle2, XCircle, ThumbsUp, Bell, Eye, X,
  TrendingUp, ClipboardList, Route, ArrowRight, UserCog,
} from 'lucide-react';
import GoPublicCard, { PUBLIC_STATUS_REFRESH_EVENT } from '../components/GoPublicCard';
import CopyableAddress from '../components/CopyableAddress';
import { useAuth } from '../hooks/useAuth';
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
  count?: number;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  description?: string;
}

interface Booking {
  _id: string;
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
  createdAt: string;
}

// `accent` drives the colored left stripe on each card (dashboard-style
// visual grouping at a glance); `badge` is the pill text/border colors.
const STATUS_THEME: Record<Booking['transporterAckStatus'], { badge: string; accent: string }> = {
  pending: { badge: 'bg-amber-50 text-amber-700 border-amber-200', accent: 'bg-amber-500' },
  acknowledged: { badge: 'bg-blue-50 text-blue-700 border-blue-200', accent: 'bg-blue-500' },
  confirmed: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', accent: 'bg-emerald-500' },
  declined: { badge: 'bg-red-50 text-red-700 border-red-200', accent: 'bg-red-400' },
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
    <span className="absolute top-4 right-5 inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 shadow-sm">
      <span aria-hidden="true">🕐</span> Pickup {countdown.label}
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
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        disabled
        value={hasValue ? String(value) : ''}
        placeholder={hasValue ? undefined : 'Not provided'}
        className={`w-full px-3 py-2 rounded-lg text-sm font-medium border cursor-not-allowed ${
          hasValue ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-100 border-slate-200 text-slate-400 italic'
        }`}
      />
    </div>
  );
};

// Booking detail modal — same fields the shipper's Book Now form collects
// (see freight-compare-frontend's BookNowModal.tsx), rendered read-only so
// the transporter sees exactly what was submitted, including gaps.
const BookingDetailModal = ({ booking, onClose }: { booking: Booking; onClose: () => void }) => {
  const shipperName = [booking.customerID?.firstName, booking.customerID?.lastName].filter(Boolean).join(' ') || booking.customerID?.companyName || 'A shipper';
  const boxes = booking.boxes || [];
  const unit = booking.dimensionUnit || 'cm';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-[94vw] max-w-6xl rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 px-6 py-4 text-white relative rounded-t-2xl">
          <button onClick={onClose} className="absolute top-3.5 right-4 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
          <h3 className="text-lg font-bold">Booking {booking.bookingCode}</h3>
          <p className="text-slate-400 text-xs mt-0.5">Exactly what {shipperName} submitted.</p>
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
              <DetailField label="Freight Charge (₹)" value={booking.freightCharge > 0 ? booking.freightCharge.toLocaleString('en-IN') : null} />
            </div>
            {booking.transporterAckStatus === 'declined' && (
              <DetailField label="Decline Reason (from you)" value={booking.transporterDeclineReason} />
            )}

            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Shipper's Customer (optional, if notified)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <DetailField label="Name" value={booking.customerContactName} />
                <DetailField label="Phone" value={booking.customerContactPhone} />
                <DetailField label="Email" value={booking.customerContactEmail} />
              </div>
            </div>
          </div>

          {/* RIGHT: packing list — same slot BookNowModal.tsx uses for it */}
          <div className="lg:border-l lg:border-slate-200 lg:pl-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Packing List</p>
            {boxes.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-500 uppercase text-[10px] bg-slate-100">
                      <th className="text-left py-1.5 px-2 border border-slate-200">Qty</th>
                      <th className="text-left py-1.5 px-2 border border-slate-200">Desc</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200">L ({unit})</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200">W ({unit})</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200">H ({unit})</th>
                      <th className="text-center py-1.5 px-2 border border-slate-200">Wt (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((b, i) => (
                      <tr key={i} className="bg-white">
                        <td className="py-1.5 px-2 text-center font-semibold text-slate-700 border border-slate-200">{b.count ?? '-'}</td>
                        <td className="py-1.5 px-2 text-left text-slate-700 border border-slate-200">{b.description || '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 border border-slate-200">{b.length ?? '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 border border-slate-200">{b.width ?? '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 border border-slate-200">{b.height ?? '-'}</td>
                        <td className="py-1.5 px-2 text-center text-slate-700 border border-slate-200">{b.weight ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">Not provided</p>
            )}
            <p className="text-xs text-slate-500 mt-2">
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
}: {
  onPick: (reason: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) => createPortal(
  <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-base font-bold text-slate-900 mb-1">Why decline this booking?</h3>
      <p className="text-xs text-slate-500 mb-4">Optional, but it helps the shipper understand what happened.</p>
      <div className="space-y-2">
        {DECLINE_REASONS.map((reason) => (
          <button
            key={reason}
            onClick={() => onPick(reason)}
            className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-slate-300 transition-colors"
          >
            {reason}
          </button>
        ))}
      </div>
      <button
        onClick={onSkip}
        className="w-full mt-3 px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
      >
        Skip — decline without a reason
      </button>
    </div>
  </div>,
  document.body
);

const BookingsPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [decliningBooking, setDecliningBooking] = useState<Booking | null>(null);

  // Tracks booking ids already seen this page session — anything that shows
  // up in a LATER poll and wasn't here on the first load gets a toast. Ref,
  // not state: it's bookkeeping for the effect below, not something that
  // should trigger a re-render on its own.
  const knownIdsRef = useRef<Set<string> | null>(null);

  const fetchBookings = useCallback(async (silent = false) => {
    if (!user?._id) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await axios.get<{ success: boolean; data: Booking[] }>(
        `${API_BASE_URL}/api/bookings/transporter/${user._id}`
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
  }, [user?._id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchBookings();
    const id = setInterval(() => fetchBookings(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, fetchBookings]);

  // Without this the embedding parent iframe never learns this page grew
  // (e.g. a modal opening), so it stays sized for the plain list and the
  // modal renders partly off the visible page instead of centered in view
  // — same fix every other page here already has.
  useReportIframeHeight([bookings.length, viewingBooking, decliningBooking, loading, error]);

  // Without this, the two modals below — centered via `fixed inset-0` — center
  // themselves against this iframe's full auto-grown content height instead of
  // the physically visible screen, which is what made "View Details" open a
  // popup the user had to scroll far down to actually see.
  useModalIframePin(!!viewingBooking || !!decliningBooking);

  const setAckStatus = async (bookingId: string, status: 'acknowledged' | 'confirmed' | 'declined', reason?: string) => {
    if (!user?._id) return;
    setActingOn(bookingId);
    try {
      await axios.patch(`${API_BASE_URL}/api/bookings/${bookingId}/ack`, {
        transporterId: user._id,
        status,
        ...(reason ? { reason } : {}),
      });
      setBookings((prev) => prev.map((b) => (
        b._id === bookingId ? { ...b, transporterAckStatus: status, ...(reason ? { transporterDeclineReason: reason } : {}) } : b
      )));
    } catch (err) {
      console.error('Failed to update booking status:', err);
      toast.error('Could not update this booking — please try again.');
    } finally {
      setActingOn(null);
    }
  };

  const handleDeclineClick = (booking: Booking) => setDecliningBooking(booking);
  const confirmDecline = (reason?: string) => {
    if (!decliningBooking) return;
    setAckStatus(decliningBooking._id, 'declined', reason);
    setDecliningBooking(null);
  };

  // Upcoming (needs action) vs History (resolved, confirmed+declined
  // together, newest first) — a tab switcher, not sections you have to know
  // to scroll past/expand.
  const byCreatedDesc = (a: Booking, b: Booking) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const groupedBookings = useMemo(() => ({
    upcoming: bookings.filter((b) => b.transporterAckStatus === 'pending' || b.transporterAckStatus === 'acknowledged').sort(byCreatedDesc),
    history: bookings.filter((b) => b.transporterAckStatus === 'confirmed' || b.transporterAckStatus === 'declined').sort(byCreatedDesc),
  }), [bookings]);

  const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');

  // Count of pending bookings still inside the "New" window — drives the
  // notification dot next to the Upcoming tab so a new arrival is visible
  // without needing to catch the (also still-firing) toast in time.
  const newCount = useMemo(
    () => bookings.filter((b) => b.transporterAckStatus === 'pending' && (Date.now() - new Date(b.createdAt).getTime()) < NEW_BADGE_WINDOW_MS).length,
    [bookings]
  );

  // All-time, this transporter's own numbers only — a factual "here's what
  // FreightCompare has brought you" line, not a platform-wide vanity metric.
  const stats = useMemo(() => {
    const totalOrders = bookings.length;
    const totalValue = bookings.reduce((sum, b) => sum + (b.freightCharge || b.invoiceValue || 0), 0);
    const confirmed = bookings.filter((b) => b.transporterAckStatus === 'confirmed').length;
    const pending = bookings.filter((b) => b.transporterAckStatus === 'pending').length;
    return { totalOrders, totalValue, confirmed, pending };
  }, [bookings]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <p className="text-lg font-semibold text-red-600">Please log in to view bookings.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto py-2">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Welcome back{(user as any)?.companyName ? `, ${(user as any).companyName}` : ''}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {bookings.length} booking{bookings.length === 1 ? '' : 's'} from shippers
            </p>
          </div>
          <button
            onClick={() => { fetchBookings(); window.dispatchEvent(new Event(PUBLIC_STATUS_REFRESH_EVENT)); }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl shadow-sm hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>

        {/* Stats: always shown (0s included) so the dashboard never looks empty/broken */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: `Order${stats.totalOrders === 1 ? '' : 's'} via FreightCompare`, value: String(stats.totalOrders), icon: <TrendingUp size={18} className="text-white" />, bg: 'from-blue-600 to-blue-700 shadow-blue-200', sub: 'text-blue-100' },
            { label: 'Pending action', value: String(stats.pending), icon: <Bell size={18} className="text-white" />, bg: 'from-amber-500 to-orange-500 shadow-amber-200', sub: 'text-amber-100' },
            { label: 'Confirmed', value: String(stats.confirmed), icon: <CheckCircle2 size={18} className="text-white" />, bg: 'from-violet-500 to-violet-600 shadow-violet-200', sub: 'text-violet-100' },
            { label: 'Total business value', value: `₹${stats.totalValue.toLocaleString('en-IN')}`, icon: <IndianRupee size={18} className="text-white" />, bg: 'from-emerald-500 to-emerald-600 shadow-emerald-200', sub: 'text-emerald-100' },
          ].map((c) => (
            <div key={c.label} className={`flex items-center gap-3 bg-gradient-to-br ${c.bg} rounded-2xl px-4 py-4 shadow-sm`}>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">{c.icon}</div>
              <div className="min-w-0">
                <p className="text-2xl font-black text-white leading-none truncate">{c.value}</p>
                <p className={`text-[11px] font-semibold ${c.sub} mt-1.5`}>{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 min-w-0">
        {loading && bookings.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-blue-500 mr-3" />
            <p className="text-slate-500 text-sm font-medium">Loading bookings…</p>
          </div>
        ) : error ? (
          <div className="p-5 text-center bg-red-50 border border-red-100 rounded-2xl max-w-md mx-auto">
            <p className="text-red-700 font-medium">{error}</p>
            <button
              onClick={() => fetchBookings()}
              className="mt-4 px-4 py-2 font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <Bell size={20} />
            </div>
            <p className="text-slate-700 font-semibold">No bookings yet</p>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">When a shipper books you directly, it will show up here. Keep your rates up to date so shippers can find and book you.</p>
            <Link to="/profile/rates" className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors">
              Review my lane rates <ArrowRight size={14} />
            </Link>
          </div>
        ) : (() => {
            const renderCard = (b: Booking) => {
              const shipperName = [b.customerID?.firstName, b.customerID?.lastName].filter(Boolean).join(' ') || b.customerID?.companyName || 'A shipper';
              const isPending = b.transporterAckStatus === 'pending';
              const isAckedOnly = b.transporterAckStatus === 'acknowledged';
              const isNew = isPending && (Date.now() - new Date(b.createdAt).getTime()) < NEW_BADGE_WINDOW_MS;
              // ShipperInfo.phone is typed as string but the API can hand back
              // a raw number (customers.phone is stored as Number in Mongo) —
              // String(v) first so .replace never runs on a number and crashes
              // the whole page (confirmed live: this exact TypeError blanked
              // the page before this fix).
              const digitsOnly = (v?: string | number | null) => String(v ?? '').replace(/\D/g, '');
              const accent = STATUS_THEME[b.transporterAckStatus].accent;
              return (
                <div
                  key={b._id}
                  className="relative overflow-hidden flex flex-col gap-4 p-5 pl-6 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent}`} />
                  {(isPending || isAckedOnly) && (
                    <PickupBadge pickupDate={b.pickupDate} pickupTime={b.pickupTime} />
                  )}

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-2.5">
                        <span className="font-black text-lg text-slate-900 inline-flex items-center gap-1.5 tracking-tight">
                          <UserIcon size={16} className="text-blue-500" /> {shipperName}
                        </span>
                        {b.customerID?.companyName && shipperName !== b.customerID.companyName && (
                          <span className="text-xs text-slate-400 font-medium">{b.customerID.companyName}</span>
                        )}
                        {isNew && (
                          <span className="inline-flex items-center text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white uppercase tracking-wider shadow-sm shadow-emerald-200">
                            New
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wide ${STATUS_THEME[b.transporterAckStatus].badge}`}>
                          {b.transporterAckStatus}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 font-medium">
                        {b.customerID?.email && (
                          <a href={`mailto:${b.customerID.email}`} className="inline-flex items-center gap-1 hover:text-blue-600 hover:underline">
                            <Mail size={12} className="text-slate-400" /> {b.customerID.email}
                          </a>
                        )}
                        {b.customerID?.phone && (
                          <>
                            <a href={`tel:${digitsOnly(b.customerID.phone)}`} className="inline-flex items-center gap-1 hover:text-blue-600 hover:underline">
                              <Phone size={12} className="text-slate-400" /> {b.customerID.phone}
                            </a>
                            <a
                              href={`https://wa.me/91${digitsOnly(b.customerID.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline font-semibold"
                            >
                              <WhatsAppIcon size={12} /> WhatsApp
                            </a>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <span className="inline-flex items-center gap-1 text-sm font-black px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                          <IndianRupee size={13} />
                          {(b.freightCharge || b.invoiceValue || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                          <MapPin size={12} className="text-slate-400" /> {b.pickupPincode} <ArrowRight size={10} className="text-slate-300" /> {b.dropPincode}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                          <Package size={12} className="text-slate-400" /> {b.totalBoxes} box{b.totalBoxes === 1 ? '' : 'es'} · {b.totalChargeableWeight} kg
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                          <Clock size={12} className="text-slate-400" /> {b.pickupDate || '-'} {b.pickupTime || ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setViewingBooking(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Eye size={13} /> View Details
                    </button>
                    {isPending && (
                      <button
                        onClick={() => setAckStatus(b._id, 'acknowledged')}
                        disabled={actingOn === b._id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                      >
                        <ThumbsUp size={13} /> Acknowledge
                      </button>
                    )}
                    {(isPending || isAckedOnly) && (
                      <>
                        <button
                          onClick={() => setAckStatus(b._id, 'confirmed')}
                          disabled={actingOn === b._id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle2 size={13} /> Confirm
                        </button>
                        <button
                          onClick={() => handleDeclineClick(b)}
                          disabled={actingOn === b._id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          <XCircle size={13} /> Decline
                        </button>
                      </>
                    )}
                  </div>
                  {/* Decline reason — shown for a declined booking regardless of
                      which tab it's viewed from, full-width so it always reads
                      as its own line rather than trailing after the buttons. */}
                  {b.transporterAckStatus === 'declined' && b.transporterDeclineReason && (
                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      <ClipboardList size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <span><span className="font-bold">Decline reason:</span> {b.transporterDeclineReason}</span>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div>
                {/* Tabs — Upcoming vs History (confirmed+declined together),
                    with a notification dot for pending bookings still inside
                    the "New" window. */}
                <div className="flex items-center gap-2 mb-5 border-b border-slate-200">
                  <button
                    onClick={() => setActiveTab('upcoming')}
                    className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                      activeTab === 'upcoming' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Upcoming ({groupedBookings.upcoming.length})
                    {newCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black">
                        {newCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                      activeTab === 'history' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    History ({groupedBookings.history.length})
                  </button>
                </div>

                {activeTab === 'upcoming' ? (
                  groupedBookings.upcoming.length > 0 ? (
                    <div className="space-y-3">{groupedBookings.upcoming.map(renderCard)}</div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Nothing needs your response right now.</p>
                  )
                ) : (
                  groupedBookings.history.length > 0 ? (
                    <div className="space-y-3">{groupedBookings.history.map(renderCard)}</div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No confirmed or declined bookings yet.</p>
                  )
                )}
              </div>
            );
          })()}
          </div>

          {/* Sidebar: go-public status + quick actions */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <GoPublicCard sidebar />
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
              <p className="px-3 pt-2 pb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Quick actions</p>
              {[
                { to: '/profile/bids', title: 'Available Bids', sub: 'Bids matching your service zones', icon: <Bell className="w-4 h-4" />, tone: 'bg-amber-100 text-amber-600' },
                { to: '/profile/rates', title: 'Lane Rates', sub: 'Review your saved rates', icon: <Route className="w-4 h-4" />, tone: 'bg-indigo-100 text-indigo-600' },
                { to: '/profile', title: 'My Profile', sub: 'Company details and KYC', icon: <UserCog className="w-4 h-4" />, tone: 'bg-emerald-100 text-emerald-600' },
              ].map((l) => (
                <Link key={l.to} to={l.to} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 flex items-center justify-center rounded-xl flex-none ${l.tone}`}>{l.icon}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{l.title}</p>
                      <p className="text-xs text-slate-400 truncate">{l.sub}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 flex-none" />
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {viewingBooking && (
        <BookingDetailModal booking={viewingBooking} onClose={() => setViewingBooking(null)} />
      )}

      {decliningBooking && (
        <DeclineReasonModal
          onPick={(reason) => confirmDecline(reason)}
          onSkip={() => confirmDecline(undefined)}
          onClose={() => setDecliningBooking(null)}
        />
      )}
    </div>
  );
};

export default BookingsPage;
