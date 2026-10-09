import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import GoPublicCard from '../components/GoPublicCard';
import MyDocumentsSection from '../components/MyDocumentsSection';
import LinkedShippersCard from '../components/LinkedShippersCard';

import {
  Building, Mail, Phone, Clock, Globe, Truck, MapPin, Calendar,
  DollarSign, Package, Loader, AlertTriangle, ShieldCheck,
  BadgeCheck, Star, Users, Route, ArrowLeft, Pencil, Check, Loader2, Bell,
  Lock, KeyRound,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/apiConfig';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';

axios.defaults.withCredentials = true;

// --- Full transporter document shape, as returned by
// GET /api/transporter/profile/:id (self-service view — includes
// service/servicableZones, unlike the public gettransporterdetails lookup). ---
interface LaneRate {
  originPincode?: string;
  destinationPincode?: string;
  price?: number;
  vehicleType?: string;
  maxCapacityKg?: number;
  bedLengthFt?: number;
  bedWidthFt?: number;
  bedHeightFt?: number;
}

interface TransporterProfile {
  companyName: string;
  phone: number;
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  employeeName?: string;
  employeePhone?: string;
  employeeAddress?: string;
  email: string;
  accountType?: 'business' | 'individual';
  gstNo?: string;
  address?: string;
  state?: string;
  pincode?: number;
  // Structured office/pickup location from the "Confirm Your Location" map
  // picker (AddressLocationPicker) — independent of the plain address
  // above. formattedAddress is the only one shown directly (as a fallback
  // when `address` is blank, e.g. every Individual account, which never
  // collects the plain `address` field at all).
  flatNumber?: string;
  buildingName?: string;
  area?: string;
  landmark?: string;
  city?: string;
  formattedAddress?: string;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  officeStart?: string;
  officeEnd?: string;
  individualLaneRates?: LaneRate[];
  deliveryMode?: string;
  deliveryTat?: string;
  trackingLink?: string;
  websiteLink?: string;
  experience: number;
  maxLoading?: number;
  noOfTrucks?: number;
  annualTurnover?: number;
  customerNetwork?: string;
  networks?: string[];
  networkOther?: string;
  pincodesServedRange?: string;
  rating?: number;
  totalRatings?: number;
  servicableZones?: string[];
  service?: { pincode: number; zone: string; isOda: boolean }[];
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  isVerified?: boolean;
}

// Same constraints as the shipper profile page (freight-compare-frontend's
// Profile.tsx) so editing here isn't looser than what signup enforced.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_PATTERN = /^(?!0{10}$)\d{10}$/;
const enforcePhoneDigits = (raw: string) => raw.replace(/\D/g, '').slice(0, 10);
const enforceNumberDigits = (raw: string) => raw.replace(/\D/g, '');

type FieldStatus = 'idle' | 'saving' | 'saved';

// ---------------------------------------------------------------------------
// EditableField — click the value to edit it in place; saves on blur/Enter,
// reverts + toasts on failure, flashes a checkmark on success. Same pattern
// as freight-compare-frontend's shipper Profile.tsx, so both portals behave
// identically when editing a profile.
// ---------------------------------------------------------------------------
const EditableField = ({
  label,
  fieldKey,
  value,
  onSave,
  type = 'text',
  options,
  maxLength,
  pattern,
  patternMessage,
  liveFilter,
  icon,
}: {
  label: string;
  fieldKey: string;
  value?: string | number | null;
  onSave: (field: string, value: string) => Promise<void>;
  type?: 'text' | 'email' | 'tel';
  options?: { value: string; label: string }[];
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  liveFilter?: (raw: string) => string;
  icon?: React.ReactNode;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [status, setStatus] = useState<FieldStatus>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value ?? ''));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async (nextValue: string) => {
    setEditing(false);
    const trimmed = nextValue.trim();
    const current = String(value ?? '').trim();
    if (trimmed === current) return;

    if (pattern && trimmed && !pattern.test(trimmed)) {
      setDraft(current);
      toast.error(patternMessage || `Enter a valid ${label.toLowerCase()}.`);
      return;
    }
    setStatus('saving');
    try {
      await onSave(fieldKey, trimmed);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err: any) {
      setDraft(current);
      setStatus('idle');
      if (!err?.cancelled) {
        toast.error(err?.response?.data?.message || `Couldn't update ${label.toLowerCase()}.`);
      }
    }
  };

  if (editing) {
    if (options) {
      return (
        <select
          autoFocus
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => setEditing(false)}
          className="w-full text-sm font-semibold text-slate-800 bg-blue-50/60 border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="" disabled>Select…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(liveFilter ? liveFilter(e.target.value) : e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false); }
        }}
        className="w-full text-sm font-semibold text-slate-800 bg-blue-50/60 border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
      />
    );
  }

  const displayValue = options?.find((o) => o.value === String(value))?.label ?? value;
  const hasValue = displayValue !== null && displayValue !== undefined && displayValue !== '';

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group w-full text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-blue-50/70 transition-colors flex items-start gap-2.5"
    >
      {icon && <span className="text-slate-400 mt-0.5 flex-none">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
          {label}
          {status === 'saving' && <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />}
          {status === 'saved' && <Check className="w-2.5 h-2.5 text-emerald-500" />}
          {status === 'idle' && <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />}
        </p>
        <p className="text-sm font-semibold text-slate-800 break-words">
          {hasValue ? displayValue : <span className="font-normal text-slate-300">Click to add</span>}
        </p>
      </div>
    </button>
  );
};

// Read-only counterpart to EditableField, for values that aren't editable
// here (rating, verification, approval status) — kept visually identical so
// the grid stays even instead of mixing button and plain rows.
const StaticField = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
  <div className="flex items-start gap-2.5 px-2 py-1.5">
    {icon && <span className="text-slate-400 mt-0.5 flex-none">{icon}</span>}
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800 break-words">{value}</p>
    </div>
  </div>
);

const SCard = ({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className ?? ''}`}>
    <div className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-50/80 border-b border-slate-100">
      <div className="w-7 h-7 flex items-center justify-center bg-blue-100 rounded-lg text-blue-600 flex-none">{icon}</div>
      <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</h2>
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
);

const PwdInput = ({ id, label, value, onChange, disabled }: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled: boolean;
}) => (
  <div>
    <label htmlFor={id} className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      <input
        id={id} name={id} type="password" required value={value} onChange={onChange} disabled={disabled}
        placeholder="••••••••"
        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition disabled:bg-slate-50 bg-white"
      />
    </div>
  </div>
);

// For an account that already has a password — hits the new
// PUT /profile/change-password (protectTransporter, current-password
// gated), mirroring freight-compare-frontend's shipper Profile.tsx exactly.
const ChangePasswordForm = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { toast.error('Minimum 8 characters.'); return; }
    if (next !== confirm) { toast.error('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const res = await axios.put(`${API_BASE_URL}/api/transporter/profile/change-password`, { currentPassword: current, newPassword: next });
      toast.success(res.data?.message || 'Password changed!');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PwdInput id="tpCurrentPassword" label="Current Password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={saving} />
        <PwdInput id="tpNewPassword" label="New Password" value={next} onChange={(e) => setNext(e.target.value)} disabled={saving} />
        <PwdInput id="tpConfirmPassword" label="Confirm Password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={saving} />
      </div>
      <div className="flex justify-end mt-3.5">
        <button
          type="submit" disabled={saving}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-amber-200 active:scale-95"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : 'Save Password'}
        </button>
      </div>
    </form>
  );
};

// For a Google-signup account with no password at all — sends an OTP to
// this account's own (already-verified) email via the new
// POST /profile/create-password/request-otp + /confirm pair
// (protectTransporter-gated; the backend re-checks !password before
// writing, so this can never be used as a change-password bypass even if
// called directly). Mirrors freight-compare-frontend's Profile.tsx
// CreatePasswordCard, restyled to this app's amber accent.
const CreatePasswordForm = ({ email, onCreated }: { email: string; onCreated: () => void }) => {
  const [step, setStep] = useState<'idle' | 'otp'>('idle');
  const [sending, setSending] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sendOtp = async () => {
    setSending(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/transporter/profile/create-password/request-otp`, {});
      toast.success(res.data?.message || 'OTP sent — check your inbox.');
      setStep('otp');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) { toast.error('Enter the OTP sent to your email.'); return; }
    if (newPassword.length < 8) { toast.error('Minimum 8 characters.'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/transporter/profile/create-password/confirm`, { otp, newPassword });
      if (res.data?.success) {
        toast.success(res.data?.message || 'Password created!');
        onCreated();
      } else {
        toast.error(res.data?.message || 'Could not create password.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Invalid OTP or an error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'idle') {
    return (
      <div>
        <p className="text-xs text-slate-500 mb-3">
          Your account was created with Google, so there's no password yet — you can create one to also sign in with your email and password.
        </p>
        <button
          type="button" onClick={sendOtp} disabled={sending}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-amber-200 active:scale-95"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          {sending ? 'Sending OTP…' : `Send OTP to ${email}`}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate}>
      <p className="text-xs text-slate-500 mb-3">
        Enter the OTP sent to <span className="font-semibold text-slate-700">{email}</span> (expires in 10 minutes) and choose a password.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="tpCreateOtp" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">OTP</label>
          <input
            id="tpCreateOtp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" maxLength={6} disabled={submitting}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition disabled:bg-slate-50 bg-white"
          />
        </div>
        <PwdInput id="tpCreateNewPassword" label="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={submitting} />
        <PwdInput id="tpCreateConfirmPassword" label="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} />
      </div>
      <div className="flex items-center justify-between mt-3.5">
        <button type="button" onClick={sendOtp} disabled={sending || submitting} className="text-xs font-semibold text-amber-600 hover:text-amber-800 disabled:opacity-50">
          Resend OTP
        </button>
        <button
          type="submit" disabled={submitting}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-amber-200 active:scale-95"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {submitting ? 'Creating…' : 'Create Password'}
        </button>
      </div>
    </form>
  );
};

const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState<TransporterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = () => {
    if (!user?._id) {
      setError('Authentication token not found. Please log in again.');
      setLoading(false);
      return;
    }
    axios
      .get<{ success: boolean; data: TransporterProfile }>(`${API_BASE_URL}/api/transporter/profile/${user._id}`)
      .then((res) => setProfile(res.data.data))
      .catch((err) => {
        console.error('Failed to load transporter profile:', err);
        setError('Could not load your profile. Please try again.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadProfile, [user?._id]);

  // Whether this account has ever set a real password — a transporter
  // created via "Continue with Google" can have none (transporterModel.js:
  // `password` is `required: function(){ return !this.googleId }`).
  // Deliberately NOT read off `profile` (GET /api/transporter/profile/:id
  // is unauthenticated/public — see that route's own comment — so it must
  // never carry a password-existence flag) or off `user` (the decoded JWT
  // has no such claim and this page never reissues one) — a small
  // dedicated authenticated call is the only safe source. Defaults to
  // `true` (the safe side — show the existing-password Change flow) until
  // this resolves, so there's never a flash of the no-current-password-
  // required Create flow before we're certain.
  const [hasPassword, setHasPassword] = useState(true);
  useEffect(() => {
    if (!user?._id) return;
    axios
      .get<{ success: boolean; hasPassword: boolean }>(`${API_BASE_URL}/api/transporter/profile/password-status`)
      .then((res) => setHasPassword(!!res.data?.hasPassword))
      .catch((err) => console.error('Failed to load password status:', err));
  }, [user?._id]);

  // Without this, the persistent host iframe (freight-compare-frontend's
  // TransporterFrameContext) keeps whatever height the previously-shown page
  // reported (e.g. the short login screen), so this page's real content
  // overflows into its own internal scrollbar instead of the outer page
  // growing to fit it — that nested double-scroll is what reads as "scroll
  // not smooth". Re-reports once loading finishes and the real content
  // (with its actual field values) has rendered.
  useReportIframeHeight([loading, profile]);

  // Direct-to-DB save for every field that isn't a login/contact credential —
  // same split as freight-compare-frontend's shipper Profile.tsx.
  const saveField = async (field: string, value: string) => {
    const res = await axios.put(`${API_BASE_URL}/api/transporter/profile/field`, { field, value });
    if (!res.data?.success) throw new Error(res.data?.message || 'Update failed');
    const saved = res.data.transporter?.[field] ?? value;
    setProfile((prev) => (prev ? { ...prev, [field]: saved } : prev));
    // Header + dashboard read the login-time JWT snapshot, not this page's
    // state — mirror the fields they display so they don't go stale.
    if (['companyName', 'address', 'state', 'pincode', 'gstNo'].includes(field)) {
      updateUser({ [field]: saved } as any);
    }
    toast.success('Saved', { duration: 1200, icon: '✓' });
  };

  // Email/phone/WhatsApp double as ways to reach or impersonate this
  // transporter, so changing any of them requires proving ownership of the
  // NEW value via OTP first — identical flow to the shipper portal.
  const contactResolversRef = useRef<{ resolve: () => void; reject: (err: any) => void } | null>(null);
  const [contactOtp, setContactOtp] = useState<{
    field: 'email' | 'phone' | 'whatsapp';
    value: string;
    otp: string;
    sending: boolean;
    verifying: boolean;
    error: string;
  } | null>(null);

  const RESEND_COOLDOWN_SECONDS = 120;
  const [resendTimer, setResendTimer] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendCountdown = () => {
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    setResendTimer(RESEND_COOLDOWN_SECONDS);
    resendIntervalRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(resendIntervalRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };
  const stopResendCountdown = () => {
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = null;
    setResendTimer(0);
  };
  useEffect(() => () => stopResendCountdown(), []);

  const contactFieldLabel = (field: 'email' | 'phone' | 'whatsapp') =>
    field === 'email' ? 'email' : field === 'phone' ? 'phone number' : 'WhatsApp number';

  const saveContactFieldWithOtp = (field: string, value: string) =>
    new Promise<void>((resolve, reject) => {
      contactResolversRef.current = { resolve, reject };
      setContactOtp({ field: field as 'email' | 'phone' | 'whatsapp', value, otp: '', sending: true, verifying: false, error: '' });
      axios.post(`${API_BASE_URL}/api/transporter/profile/contact/request-otp`, { field, value })
        .then((res) => {
          if (!res.data?.success) throw new Error(res.data?.message || 'Failed to send OTP.');
          setContactOtp((prev) => (prev ? { ...prev, sending: false } : prev));
          startResendCountdown();
        })
        .catch((err: any) => {
          toast.error(err?.response?.data?.message || err.message || `Couldn't send OTP for ${field}.`);
          setContactOtp(null);
          const resolvers = contactResolversRef.current;
          contactResolversRef.current = null;
          resolvers?.reject({ cancelled: true });
        });
    });

  const closeContactOtp = () => {
    const resolvers = contactResolversRef.current;
    contactResolversRef.current = null;
    setContactOtp(null);
    stopResendCountdown();
    resolvers?.reject({ cancelled: true });
  };

  const handleResendContactOtp = async () => {
    if (!contactOtp || resendTimer > 0) return;
    setContactOtp((prev) => (prev ? { ...prev, sending: true, error: '' } : prev));
    try {
      const res = await axios.post(`${API_BASE_URL}/api/transporter/profile/contact/request-otp`, { field: contactOtp.field, value: contactOtp.value });
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to resend OTP.');
      setContactOtp((prev) => (prev ? { ...prev, sending: false } : prev));
      startResendCountdown();
      toast.success('OTP resent.');
    } catch (err: any) {
      setContactOtp((prev) => (prev ? { ...prev, sending: false, error: err?.response?.data?.message || err.message || 'Failed to resend OTP.' } : prev));
    }
  };

  const handleVerifyContactOtp = async () => {
    if (!contactOtp) return;
    if (!contactOtp.otp.trim()) {
      setContactOtp((prev) => (prev ? { ...prev, error: 'Enter the OTP.' } : prev));
      return;
    }
    setContactOtp((prev) => (prev ? { ...prev, verifying: true, error: '' } : prev));
    try {
      const res = await axios.post(`${API_BASE_URL}/api/transporter/profile/contact/confirm-otp`, {
        field: contactOtp.field, value: contactOtp.value, otp: contactOtp.otp.trim(),
      });
      if (!res.data?.success) throw new Error(res.data?.message || 'Verification failed.');
      const updated = res.data.transporter;
      setProfile((prev) => (prev ? { ...prev, [contactOtp.field]: updated?.[contactOtp.field] ?? contactOtp.value } : prev));
      toast.success('Saved', { duration: 1200, icon: '✓' });
      const resolvers = contactResolversRef.current;
      contactResolversRef.current = null;
      setContactOtp(null);
      stopResendCountdown();
      resolvers?.resolve();
    } catch (err: any) {
      setContactOtp((prev) => (prev ? { ...prev, verifying: false, error: err?.response?.data?.message || err.message || 'Invalid OTP.' } : prev));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
        <Loader className="animate-spin mr-3" size={24} />
        <p className="text-lg">Loading Profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-600 p-4">
        <AlertTriangle className="mb-3" size={40} />
        <p className="text-lg font-semibold text-center">Could not load profile</p>
        <p className="text-slate-600 text-center">{error || 'No profile data available.'}</p>
        <Link to="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
          <ArrowLeft size={15} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const isIndividual = profile.accountType === 'individual';
  const laneRateCount = profile.individualLaneRates?.length || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-blue-600 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back
        </Link>

        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold shadow-md flex-none">
            {profile.companyName?.charAt(0) || 'T'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 truncate">{profile.companyName}</h1>
              {profile.isVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 flex-none">
                  <BadgeCheck size={13} /> Verified
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {isIndividual ? 'Individual / Owner-Operator' : 'Business'} Transporter · Click any value below to edit
            </p>
          </div>
        </div>

        {/* Every section stacks below the one before it, full width, with the
            same 4-column field grid throughout — one consistent shape
            instead of mismatched boxes. */}
        <div className="flex flex-col gap-4">

          <SCard icon={<Building className="w-4 h-4" />} title="Company & Business">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
              <EditableField label="Company Name" fieldKey="companyName" value={profile.companyName} onSave={saveField} maxLength={200} icon={<Building size={14} />} />
              <EditableField label="Company Contact" fieldKey="firstName" value={profile.firstName} onSave={saveField} maxLength={50} icon={<Users size={14} />} />
              {!isIndividual && (
                <EditableField label="GST Number" fieldKey="gstNo" value={profile.gstNo} onSave={saveField} maxLength={15} icon={<BadgeCheck size={14} />} />
              )}
              <EditableField label="Years of Experience" fieldKey="experience" value={profile.experience} onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={2} icon={<Calendar size={14} />} />
              <EditableField label="Number of Trucks" fieldKey="noOfTrucks" value={profile.noOfTrucks} onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={4} icon={<Truck size={14} />} />
              <EditableField label="Max Loading Capacity (kg)" fieldKey="maxLoading" value={profile.maxLoading} onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={6} icon={<Package size={14} />} />
              <EditableField label="Annual Turnover (₹)" fieldKey="annualTurnover" value={profile.annualTurnover} onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={12} icon={<DollarSign size={14} />} />
            </div>
          </SCard>

          <SCard icon={<Phone className="w-4 h-4" />} title="Contact Information">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
              <EditableField label="Email Address" fieldKey="email" value={profile.email} onSave={saveContactFieldWithOtp} type="email" maxLength={100} pattern={EMAIL_PATTERN} patternMessage="Please enter a valid email address." icon={<Mail size={14} />} />
              <EditableField label="Phone Number" fieldKey="phone" value={profile.phone} onSave={saveContactFieldWithOtp} type="tel" liveFilter={enforcePhoneDigits} maxLength={10} pattern={PHONE_PATTERN} patternMessage="Enter a valid 10-digit mobile number." icon={<Phone size={14} />} />
              <EditableField label="WhatsApp Number" fieldKey="whatsapp" value={profile.whatsapp} onSave={saveContactFieldWithOtp} type="tel" liveFilter={enforcePhoneDigits} maxLength={10} pattern={PHONE_PATTERN} patternMessage="Enter a valid 10-digit mobile number." icon={<Phone size={14} />} />
              <EditableField label="Website" fieldKey="websiteLink" value={profile.websiteLink} onSave={saveField} maxLength={500} icon={<Globe size={14} />} />
              {/* Address shown for BOTH account types now — Individual never
                  collects the plain `address` string (Business-only per
                  transporterModel), but now always has a structured
                  formattedAddress from the "Confirm Your Location" map
                  picker (signup + Google sign-in gate). Falls back to that
                  whenever the plain field is blank, so GST-fetched
                  addresses (Business) keep showing exactly as before. */}
              <EditableField
                label="Address" fieldKey="address"
                value={profile.address || profile.formattedAddress || [profile.flatNumber, profile.buildingName, profile.area, profile.landmark, profile.city].filter(Boolean).join(', ') || ''}
                onSave={saveField} maxLength={300} icon={<MapPin size={14} />}
              />
              {!isIndividual && (
                <>
                  <EditableField label="State" fieldKey="state" value={profile.state} onSave={saveField} maxLength={50} icon={<MapPin size={14} />} />
                  <EditableField label="Pincode" fieldKey="pincode" value={profile.pincode} onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={6} icon={<MapPin size={14} />} />
                </>
              )}
            </div>
          </SCard>

          <SCard icon={<Users className="w-4 h-4" />} title="On-Ground Contact">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
              <EditableField label="Employee Name" fieldKey="employeeName" value={profile.employeeName} onSave={saveField} maxLength={100} icon={<Users size={14} />} />
              <EditableField label="Employee Phone" fieldKey="employeePhone" value={profile.employeePhone} onSave={saveField} type="tel" liveFilter={enforcePhoneDigits} maxLength={10} icon={<Phone size={14} />} />
              <EditableField label="Employee Address" fieldKey="employeeAddress" value={profile.employeeAddress} onSave={saveField} maxLength={300} icon={<MapPin size={14} />} />
            </div>
          </SCard>

          <SCard icon={<Clock className="w-4 h-4" />} title="Operational Details">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
              {/* Office Start/End are Business-only per transporterModel's
                  own conditional `required` (accountType !== 'individual')
                  — an owner-operator never fills these in at signup, so
                  showing them as empty "Click to add" on an Individual
                  profile is the same irrelevant-field noise as GST Number
                  above, which is already gated the same way. */}
              {!isIndividual && (
                <>
                  <EditableField label="Office Start" fieldKey="officeStart" value={profile.officeStart} onSave={saveField} maxLength={20} icon={<Clock size={14} />} />
                  <EditableField label="Office End" fieldKey="officeEnd" value={profile.officeEnd} onSave={saveField} maxLength={20} icon={<Clock size={14} />} />
                </>
              )}
              <EditableField label="Delivery Mode" fieldKey="deliveryMode" value={profile.deliveryMode} onSave={saveField} maxLength={50} icon={<Package size={14} />} />
              <EditableField label="Standard Delivery TAT" fieldKey="deliveryTat" value={profile.deliveryTat} onSave={saveField} maxLength={50} icon={<Calendar size={14} />} />
            </div>
          </SCard>

          <GoPublicCard />
          <LinkedShippersCard />

          <SCard icon={<ShieldCheck className="w-4 h-4" />} title="Verification & Rating">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
              <StaticField
                label="Approval Status"
                value={profile.approvalStatus ? profile.approvalStatus.charAt(0).toUpperCase() + profile.approvalStatus.slice(1) : '—'}
                icon={<BadgeCheck size={14} />}
              />
              <StaticField label="Verified" value={profile.isVerified ? 'Yes' : 'Not yet verified'} icon={<ShieldCheck size={14} />} />
              <StaticField
                label="Rating"
                value={`${(profile.rating ?? 3).toFixed(1)} / 5 (${profile.totalRatings || 0} ratings)`}
                icon={<Star size={14} />}
              />
            </div>
          </SCard>

          {/* Uploaded documents, fleet summary and rate files: view / replace / manage */}
          <MyDocumentsSection />

          <SCard icon={<Lock className="w-4 h-4" />} title={hasPassword ? "Change Password" : "Create Password"}>
            {hasPassword ? (
              <ChangePasswordForm />
            ) : (
              <CreatePasswordForm email={profile.email} onCreated={() => setHasPassword(true)} />
            )}
          </SCard>

          <Link
            to="/profile/rates"
            className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-blue-100 rounded-xl text-blue-600 flex-none">
                <Route className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {isIndividual ? `Lane Rates (${laneRateCount})` : 'Rate Card & Zone Rates'}
                </p>
                <p className="text-xs text-slate-400">
                  {isIndividual
                    ? 'View and manage your pricing per origin-destination lane'
                    : 'View your saved rate card and zone-to-zone pricing'}
                </p>
              </div>
            </div>
            <ArrowLeft className="w-4 h-4 text-slate-300 rotate-180" />
          </Link>


          {/* Moved out of the old Dashboard.tsx (2026-09-21) — /dashboard
              now shows the real booking feed instead. Own page (like Lane
              Rates above) rather than inline, since it's a whole list, not
              a profile field. */}
          <Link
            to="/profile/bids"
            className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-blue-100 rounded-xl text-blue-600 flex-none">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Available Bids</p>
                <p className="text-xs text-slate-400">View bids matching your service zones</p>
              </div>
            </div>
            <ArrowLeft className="w-4 h-4 text-slate-300 rotate-180" />
          </Link>
        </div>
      </div>

      {contactOtp && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeContactOtp}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-blue-50 border-4 border-blue-100 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">
                Verify your new {contactFieldLabel(contactOtp.field)}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-1">
                {contactOtp.sending ? 'Sending an OTP to...' : 'Enter the OTP sent to:'}
              </p>
              <p className="text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4 break-all">
                {contactOtp.value}
              </p>

              <input
                autoFocus
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={contactOtp.otp}
                disabled={contactOtp.sending || contactOtp.verifying}
                onChange={(e) => setContactOtp((prev) => (prev ? { ...prev, otp: e.target.value.replace(/\D/g, '').slice(0, 8), error: '' } : prev))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyContactOtp(); }}
                placeholder="Enter OTP"
                className="w-full px-3 py-2.5 mb-2 border border-slate-200 rounded-xl text-sm font-semibold text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
              {contactOtp.error && <p className="text-xs text-red-500 mb-2">{contactOtp.error}</p>}

              {resendTimer > 0 ? (
                <p className="text-xs text-slate-400 mb-4">Resend OTP in {Math.floor(resendTimer / 60)}:{String(resendTimer % 60).padStart(2, '0')}</p>
              ) : (
                <button
                  onClick={handleResendContactOtp}
                  disabled={contactOtp.sending || contactOtp.verifying}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2 disabled:opacity-50 mb-4"
                >
                  Resend OTP
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={closeContactOtp}
                  disabled={contactOtp.verifying}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyContactOtp}
                  disabled={contactOtp.sending || contactOtp.verifying}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm shadow-blue-200 transition-colors active:scale-95 disabled:opacity-60"
                >
                  {contactOtp.verifying ? 'Verifying…' : 'Verify & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProfilePage;
