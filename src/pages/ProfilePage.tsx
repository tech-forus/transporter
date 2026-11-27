import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import GoPublicCard from '../components/GoPublicCard';
import MyDocumentsSection from '../components/MyDocumentsSection';
import LinkedShippersCard from '../components/LinkedShippersCard';
import TeamCard, { TeamMember } from '../components/TeamCard';
import SectionCard from '../components/SectionCard';
import { useMyDocuments } from '../hooks/useMyDocuments';

import {
  Loader, AlertTriangle, ShieldCheck, BadgeCheck, Star, ArrowLeft, Pencil, Check, Loader2,
  Lock, KeyRound, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import EmployeePasswordForm from '../components/EmployeePasswordForm';
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
  team?: TeamMember[];
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

// One table row: fixed label column + value. Shared by every field row so all columns line up.
const ROW = 'grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-slate-100 py-1 dark:border-white/5';
// Field table: 1 → 2 → 3 label/value pairs per line as the screen widens.
const TABLE = 'grid grid-cols-1 gap-x-8 md:grid-cols-2 xl:grid-cols-3';
const FULL_ROW = 'md:col-span-2 xl:col-span-3';

// Shown next to "KYC under review". Change it if the review team's turnaround changes.
const KYC_REVIEW_ETA = 'usually 1–2 working days';

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
  displayAs,
  zeroIsEmpty,
  nudge,
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
  displayAs?: string; // shown instead of the value when not editing (e.g. "Same as phone")
  zeroIsEmpty?: boolean; // counts like trucks/turnover: 0 means "never filled in", not a real zero
  nudge?: boolean; // one of the missing fields the profile-progress prompt names: its "+ Add" is highlighted
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

  const raw = options?.find((o) => o.value === String(value))?.label ?? value;
  const hasValue = raw !== null && raw !== undefined && raw !== '' && !(zeroIsEmpty && Number(raw) === 0);
  const displayValue = hasValue ? (displayAs ?? raw) : null;
  // Only derived values ("Same as phone") are greyed; a re-cased name is still the real value.
  const derived = hasValue && !!displayAs && displayAs.startsWith('Same as');

  // One table row: fixed label column, value (or its editor) beside it.
  return (
    <div id={`field-${fieldKey}`} className={ROW}>
      <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-[#6f93b8]">
        {label}
        {status === 'saving' && <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-400" />}
        {status === 'saved' && <Check className="w-2.5 h-2.5 text-blue-500" />}
      </span>
      {editing ? renderEditor() : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group -mx-1.5 flex min-w-0 items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-left hover:bg-blue-50/70 dark:hover:bg-white/5"
        >
          <span className={`min-w-0 break-words text-sm font-medium ${derived ? 'text-slate-500 dark:text-[#8fb0cf]' : 'text-slate-800 dark:text-white'}`}>
            {/* Empty fields stay quiet; only the ones the progress nudge names get the accent. */}
            {hasValue ? displayValue : nudge
              ? <span className="font-semibold text-blue-600 dark:text-blue-400">+ Add</span>
              : <span className="font-normal text-slate-400 group-hover:text-blue-600 dark:text-[#6f93b8]">+ Add</span>}
          </span>
          {/* Always faintly visible: the pencil is the edit hint (replaces the old "click any value to edit" line). */}
          {hasValue && status === 'idle' && <Pencil className="w-2.5 h-2.5 flex-none opacity-30 group-hover:opacity-100 transition-opacity text-blue-500" />}
        </button>
      )}
    </div>
  );

  function renderEditor() {
    if (options) {
      return (
        <select
          autoFocus
          value={draft}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          onBlur={() => setEditing(false)}
          className="w-full text-sm font-semibold text-slate-800 dark:text-white bg-blue-50/60 border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
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
        className="w-full text-sm font-semibold text-slate-800 dark:text-white bg-blue-50/60 border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-400"
      />
    );
  }
};

// Names/addresses fetched from GST arrive in ALL CAPS; show them in normal case (the stored value is unchanged).
const titleCase = (t: string) => t.toLowerCase().replace(/(^|[^\p{L}\d])(\p{L})/gu, (_m, pre, c) => pre + c.toUpperCase());
const tidyCaps = (v?: string | number | null) => {
  const t = String(v ?? '');
  return /[A-Z]/.test(t) && t === t.toUpperCase() ? titleCase(t) : undefined;
};
// Addresses are often part caps ("2A/3, HAMDARD BUILDING, Central Delhi"): re-case each all-caps comma part.
const tidyAddress = (v?: string | null) => {
  const t = String(v ?? '');
  const out = t.split(',').map((p) => (/[A-Z]{2}/.test(p) && p === p.toUpperCase() && /[A-Z]{4}/.test(p) ? titleCase(p) : p)).join(',');
  return out === t ? undefined : out;
};

const PwdInput = ({ id, label, value, onChange, disabled }: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled: boolean;
}) => (
  <div>
    <label htmlFor={id} className="block text-[10px] font-bold text-slate-400 dark:text-[#6f93b8] uppercase tracking-widest mb-1.5">{label}</label>
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-[#6f93b8] pointer-events-none" />
      <input
        id={id} name={id} type="password" required value={value} onChange={onChange} disabled={disabled}
        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition disabled:bg-slate-50 bg-white dark:bg-[#0d2438]"
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
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-blue-200 active:scale-95"
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
// CreatePasswordCard, restyled to this app's accent colour.
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
        <p className="text-xs text-slate-500 dark:text-[#8fb0cf] mb-3">
          Your account was created with Google, so there's no password yet — you can create one to also sign in with your email and password.
        </p>
        <button
          type="button" onClick={sendOtp} disabled={sending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-blue-200 active:scale-95"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          {sending ? 'Sending OTP…' : `Send OTP to ${email}`}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate}>
      <p className="text-xs text-slate-500 dark:text-[#8fb0cf] mb-3">
        Enter the OTP sent to <span className="font-semibold text-slate-700 dark:text-[#8fb0cf]">{email}</span> (expires in 10 minutes) and choose a password.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="tpCreateOtp" className="block text-[10px] font-bold text-slate-400 dark:text-[#6f93b8] uppercase tracking-widest mb-1.5">OTP</label>
          <input
            id="tpCreateOtp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" maxLength={6} disabled={submitting}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition disabled:bg-slate-50 bg-white dark:bg-[#0d2438]"
          />
        </div>
        <PwdInput id="tpCreateNewPassword" label="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={submitting} />
        <PwdInput id="tpCreateConfirmPassword" label="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={submitting} />
      </div>
      <div className="flex items-center justify-between mt-3.5">
        <button type="button" onClick={sendOtp} disabled={sending || submitting} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 disabled:opacity-50">
          Resend OTP
        </button>
        <button
          type="submit" disabled={submitting}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors shadow-sm shadow-blue-200 active:scale-95"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {submitting ? 'Creating…' : 'Create Password'}
        </button>
      </div>
    </form>
  );
};

// Password is one row of the Business details table; its form opens under the table.
const PasswordRow = ({ action, open, onToggle }: { action: 'Change' | 'Create'; open: boolean; onToggle: () => void }) => (
  <div className={ROW}>
    <span className="text-xs text-slate-500 dark:text-[#6f93b8]">Password</span>
    <span className="flex items-baseline gap-3 text-sm">
      <span className="text-slate-400">{action === 'Create' ? 'None yet · Google sign-in' : '••••••••'}</span>
      <button type="button" onClick={onToggle} className="text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-[#8fb0cf]">{open ? 'Cancel' : action}</button>
    </span>
  </div>
);

// Opens a field's inline editor (which focuses and scrolls to it). Used by the profile-progress nudge.
const editField = (key: string) => document.querySelector<HTMLButtonElement>(`#field-${key} button`)?.click();

const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const isEmployee = (user as any)?.role === 'employee'; // a team member: the owner-only sections stay hidden
  const [profile, setProfile] = useState<TransporterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const docs = useMyDocuments(!isEmployee); // feeds KYC documents + the Fleet row
  const [contactOpen, setContactOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

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
  useReportIframeHeight([loading, profile, docs.data, contactOpen, pwdOpen]);

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
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500 dark:text-[#8fb0cf]">
        <Loader className="animate-spin mr-3" size={24} />
        <p className="text-lg">Loading Profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-600 dark:text-red-400 p-4">
        <AlertTriangle className="mb-3" size={40} />
        <p className="text-lg font-semibold text-center">Could not load profile</p>
        <p className="text-slate-600 dark:text-[#8fb0cf] text-center">{error || 'No profile data available.'}</p>
        <Link to="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700">
          <ArrowLeft size={15} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const isIndividual = profile.accountType === 'individual';
  const address = profile.address || profile.formattedAddress || [profile.flatNumber, profile.buildingName, profile.area, profile.landmark, profile.city].filter(Boolean).join(', ') || '';
  const same = (a?: string | number | null, b?: string | number | null) => !!a && String(a).trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  const ratings = profile.totalRatings || 0;
  const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold';
  // On-ground contact is blank or matches the business contact field for field.
  const blankOr = (v: unknown, base: unknown) => !v || same(v as string, base as string);
  const contactIsDefault = blankOr(profile.employeeName, profile.firstName) && blankOr(profile.employeePhone, profile.phone) && blankOr(profile.employeeAddress, address);
  const addrLower = address.toLowerCase();
  const addressHasStatePin = !!profile.state && !!profile.pincode && addrLower.includes(String(profile.state).toLowerCase()) && addrLower.includes(String(profile.pincode));
  const isAggregator = (user as any)?.orgType === 'aggregator';
  const accountLabel = (user as any)?.isLine ? 'Courier line' : isAggregator ? 'Courier aggregator' : `${isIndividual ? 'Owner-operator' : 'Business'} transporter`;
  // Couriers number shipments by AWB, road transporters by LR; the backend fills in either token.
  const trackTerm = isAggregator || (user as any)?.isLine ? 'AWB' : 'LR';
  const trackToken = trackTerm === 'AWB' ? '{awb}' : '{lr}';
  // Fields shippers use to choose a carrier; the first two missing ones are named in the prompt.
  // [label, value, fieldKey] — the key lets the nudge open that field's editor.
  const checks: [string, unknown, string][] = [
    ['delivery TAT', profile.deliveryTat, 'deliveryTat'],
    ['tracking link', profile.trackingLink, 'trackingLink'],
    ['delivery mode', profile.deliveryMode, 'deliveryMode'],
    ['years of experience', profile.experience, 'experience'],
    ['website', profile.websiteLink, 'websiteLink'],
    ['address', address, 'address'],
    ...(isAggregator ? [] : [['number of trucks', profile.noOfTrucks, 'noOfTrucks'], ['max load', profile.maxLoading, 'maxLoading']] as [string, unknown, string][]),
  ];
  const missing = checks.filter(([, v]) => v === undefined || v === null || String(v).trim() === '' || v === 0);
  const nudged = new Set(missing.slice(0, 2).map(([, , key]) => key)); // same two the prompt names
  const completeness = { missing, pct: Math.round(((checks.length - missing.length) / checks.length) * 100) };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#08141f]">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 py-4 sm:px-6">

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-lg font-bold flex-none">
              {profile.companyName?.charAt(0) || 'T'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">{tidyCaps(profile.companyName) ?? profile.companyName}</h1>
                {profile.isVerified
                  ? <span className={`${pill} bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300`}><BadgeCheck size={12} /> Verified</span>
                  : <span className={`${pill} bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300`}>KYC under review · {KYC_REVIEW_ETA}</span>}
                {profile.approvalStatus && profile.approvalStatus !== 'approved' && (
                  <span className={`${pill} ${profile.approvalStatus === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {profile.approvalStatus === 'rejected' ? 'Not approved' : 'Approval pending'}
                  </span>
                )}
                {/* Only once there is a rating: "No ratings yet" is noise the transporter can't act on. */}
                {ratings > 0 && (
                  <span className={`${pill} bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-[#8fb0cf]`}>
                    <Star size={12} /> {(profile.rating ?? 0).toFixed(1)} ({ratings})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8fb0cf] mt-0.5">{accountLabel}</p>
            </div>
          </div>

          {!isEmployee && (
            <div className="flex min-w-[280px] flex-1 flex-col gap-1 lg:ml-auto lg:max-w-md">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800 dark:text-white whitespace-nowrap">Profile {completeness.pct}%</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${completeness.pct}%` }} />
                </div>
              </div>
              <span className="text-xs text-slate-500 dark:text-[#8fb0cf]">
                {completeness.missing.length
                  ? <>Add {completeness.missing.slice(0, 2).map(([label, , key], i) => (
                      <React.Fragment key={key}>
                        {i > 0 && ' and '}
                        <button type="button" onClick={() => editField(key)} className="font-bold text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-800 dark:text-blue-400">{label}</button>
                      </React.Fragment>
                    ))} to rank higher with shippers.</>
                  : 'Complete. Shippers see everything they need.'}
              </span>
            </div>
          )}
        </div>

        {/* Same slim bar as Bookings: Go public, or Review rates / Set up rates before going public. */}
        <GoPublicCard wide />

        {/* Left: what shippers read about you. Right: documents, links, team, account. Stacks on narrow screens. */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <SectionCard title="Business details">
              <div className={TABLE}>
                <EditableField label="Company name" fieldKey="companyName" value={profile.companyName} displayAs={tidyCaps(profile.companyName)} onSave={saveField} maxLength={200} />
                {!isIndividual && <EditableField label="GST number" fieldKey="gstNo" value={profile.gstNo} onSave={saveField} maxLength={15} />}
                <EditableField label="Contact person" fieldKey="firstName" value={profile.firstName} displayAs={tidyCaps(profile.firstName)} onSave={saveField} maxLength={50} />
                <EditableField label="Website" fieldKey="websiteLink" nudge={nudged.has('websiteLink')} value={profile.websiteLink} onSave={saveField} maxLength={500} />
                <EditableField label="Email" fieldKey="email" value={profile.email} onSave={saveContactFieldWithOtp} type="email" maxLength={100} pattern={EMAIL_PATTERN} patternMessage="Please enter a valid email address." />
                <EditableField label="Phone" fieldKey="phone" value={profile.phone} onSave={saveContactFieldWithOtp} type="tel" liveFilter={enforcePhoneDigits} maxLength={10} pattern={PHONE_PATTERN} patternMessage="Enter a valid 10-digit mobile number." />
                <EditableField label="WhatsApp" fieldKey="whatsapp" value={profile.whatsapp} displayAs={same(profile.whatsapp, profile.phone) ? 'Same as phone' : undefined} onSave={saveContactFieldWithOtp} type="tel" liveFilter={enforcePhoneDigits} maxLength={10} pattern={PHONE_PATTERN} patternMessage="Enter a valid 10-digit mobile number." />
                {/* Turnover is only for our review (admin go-public screen); shippers never see it. */}
                <EditableField label="Turnover ₹ (private)" fieldKey="annualTurnover" value={profile.annualTurnover} zeroIsEmpty onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={12} />
                {/* Address falls back to the map-picker address (Individual accounts never collect the plain field). */}
                <div className="md:col-span-2">
                  <EditableField label="Address" fieldKey="address" nudge={nudged.has('address')} value={address} displayAs={tidyAddress(address)} onSave={saveField} maxLength={300} />
                </div>
                {/* State/pincode are usually already at the end of the address; show them only when they add something. */}
                {!isIndividual && !addressHasStatePin && (
                  <>
                    <EditableField label="State" fieldKey="state" value={profile.state} onSave={saveField} maxLength={50} />
                    <EditableField label="Pincode" fieldKey="pincode" value={profile.pincode} onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={6} />
                  </>
                )}
              </div>
            </SectionCard>

            {!isEmployee && (
              <SectionCard title="Operations">
                <div className={TABLE}>
                  {/* Office hours are Business-only (transporterModel requires them only for accountType !== 'individual'). */}
                  {!isIndividual && <EditableField label="Office start" fieldKey="officeStart" value={profile.officeStart} onSave={saveField} maxLength={20} />}
                  {!isIndividual && <EditableField label="Office end" fieldKey="officeEnd" value={profile.officeEnd} onSave={saveField} maxLength={20} />}
                  <EditableField label="Delivery mode" fieldKey="deliveryMode" nudge={nudged.has('deliveryMode')} value={profile.deliveryMode} onSave={saveField} maxLength={50} />
                  <EditableField label="Delivery TAT" fieldKey="deliveryTat" nudge={nudged.has('deliveryTat')} value={profile.deliveryTat} onSave={saveField} maxLength={50} />
                  <EditableField label="Trucks" fieldKey="noOfTrucks" nudge={nudged.has('noOfTrucks')} value={profile.noOfTrucks} zeroIsEmpty onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={4} />
                  <EditableField label="Max load (kg)" fieldKey="maxLoading" nudge={nudged.has('maxLoading')} value={profile.maxLoading} zeroIsEmpty onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={6} />
                  <EditableField label="Experience (years)" fieldKey="experience" nudge={nudged.has('experience')} value={profile.experience} zeroIsEmpty onSave={saveField} type="tel" liveFilter={enforceNumberDigits} maxLength={2} />
                  {/* Registered vehicles/drivers (RC, DL) live on the Fleet page; this is the summary + way in. */}
                  <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-slate-100 py-1 dark:border-white/5">
                    <span className="text-xs text-slate-500 dark:text-[#6f93b8]">Vehicles &amp; drivers</span>
                    <Link to="/profile/fleet" className="inline-flex items-baseline gap-1.5 px-0 py-0.5 text-sm font-medium text-slate-800 hover:text-blue-700 dark:text-white">
                      {!docs.data ? '—' : docs.data.vehicles.length + docs.data.drivers.length === 0 ? 'None yet' : `${docs.data.vehicles.length} vehicle${docs.data.vehicles.length === 1 ? '' : 's'} · ${docs.data.drivers.length} driver${docs.data.drivers.length === 1 ? '' : 's'}`}
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-[#8fb0cf]">Manage <ArrowRight size={12} /></span>
                    </Link>
                  </div>
                  <div className="md:col-span-2">
                    <EditableField label="Tracking link" fieldKey="trackingLink" nudge={nudged.has('trackingLink')} value={profile.trackingLink} onSave={saveField} maxLength={500} />
                    <p className="pt-1 text-xs text-slate-400 sm:pl-[9.25rem] dark:text-[#6f93b8]">
                      e.g. <code className="font-mono">https://yoursite.in/track?{trackTerm.toLowerCase()}={trackToken}</code> ({trackToken} = {trackTerm} number)
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {!isEmployee && <MyDocumentsSection docs={docs} />}

            <LinkedShippersCard />

            {!isEmployee && (
              <SectionCard title="Team">
                <div className="mb-1 flex items-baseline gap-2 text-xs">
                  <span className="text-slate-500 dark:text-[#8fb0cf]">On-ground contact</span>
                  {/* Usually identical to the business contact: one line until it differs or the owner edits it. */}
                  {!contactOpen && contactIsDefault && (
                    <span className="ml-auto flex items-baseline gap-2">
                      <span className="text-slate-500 dark:text-[#8fb0cf]">Same as business contact</span>
                      <button type="button" onClick={() => setContactOpen(true)} className="font-semibold text-slate-500 hover:text-blue-600 dark:text-[#8fb0cf]">Change</button>
                    </span>
                  )}
                </div>
                <div className={contactOpen || !contactIsDefault ? 'mb-3' : 'hidden'}>
                  <EditableField label="Name" fieldKey="employeeName" value={profile.employeeName} displayAs={same(profile.employeeName, profile.firstName) ? 'Same as contact person' : tidyCaps(profile.employeeName)} onSave={saveField} maxLength={100} />
                  <EditableField label="Phone" fieldKey="employeePhone" value={profile.employeePhone} displayAs={same(profile.employeePhone, profile.phone) ? 'Same as phone' : undefined} onSave={saveField} type="tel" liveFilter={enforcePhoneDigits} maxLength={10} />
                  <EditableField label="Address" fieldKey="employeeAddress" value={profile.employeeAddress} displayAs={same(profile.employeeAddress, address) ? 'Same as business address' : tidyAddress(profile.employeeAddress)} onSave={saveField} maxLength={300} />
                </div>
                <TeamCard team={profile.team || []} onChange={(team) => setProfile((prev) => (prev ? { ...prev, team } : prev))} />
              </SectionCard>
            )}

            <SectionCard title="Password">
              <PasswordRow action={isEmployee || hasPassword ? 'Change' : 'Create'} open={pwdOpen} onToggle={() => setPwdOpen((o) => !o)} />
              {pwdOpen && (
                <div className="mt-3">
                  {isEmployee ? <EmployeePasswordForm /> : hasPassword ? <ChangePasswordForm /> : (
                    <CreatePasswordForm email={profile.email} onCreated={() => { setHasPassword(true); setPwdOpen(false); }} />
                  )}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>

      {contactOtp && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeContactOtp}
        >
          <div
            className="bg-white dark:bg-[#0d2438] rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 border-4 border-blue-100 dark:border-blue-800/40 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                Verify your new {contactFieldLabel(contactOtp.field)}
              </h3>
              <p className="text-sm text-slate-500 dark:text-[#8fb0cf] leading-relaxed mb-1">
                {contactOtp.sending ? 'Sending an OTP to...' : 'Enter the OTP sent to:'}
              </p>
              <p className="text-sm font-bold text-slate-800 dark:text-white bg-slate-50 dark:bg-[#08141f] border border-slate-200 dark:border-[#1d3f5c] rounded-lg px-3 py-2 mb-4 break-all">
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
                className="w-full px-3 py-2.5 mb-2 border border-slate-200 dark:border-[#1d3f5c] rounded-xl text-sm font-semibold text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              />
              {contactOtp.error && <p className="text-xs text-red-500 mb-2">{contactOtp.error}</p>}

              {resendTimer > 0 ? (
                <p className="text-xs text-slate-400 dark:text-[#6f93b8] mb-4">Resend OTP in {Math.floor(resendTimer / 60)}:{String(resendTimer % 60).padStart(2, '0')}</p>
              ) : (
                <button
                  onClick={handleResendContactOtp}
                  disabled={contactOtp.sending || contactOtp.verifying}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-semibold underline underline-offset-2 disabled:opacity-50 mb-4"
                >
                  Resend OTP
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={closeContactOtp}
                  disabled={contactOtp.verifying}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-[#8fb0cf] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
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
