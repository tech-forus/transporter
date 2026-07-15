import React, { useState, useEffect, useRef, useCallback, useMemo, ChangeEvent, DragEvent, FormEvent } from 'react';
import guidlines from '../assets/guidlines.jpg';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Cookies from 'js-cookie';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config/apiConfig';
import {
  Truck, Hash, Grid3X3, UploadCloud, FileSpreadsheet, Download, Loader2, ArrowLeft, ArrowRight,
  CheckCircle, CheckCircle2, Building, Phone, Mail, KeyRound, MapPin, Map, Calendar, Clock, Ship, Link,
  Eye, EyeOff, Lock, Sparkles, AlertTriangle, Trash2, Plus, Info, FileText, XCircle
} from 'lucide-react';
import { useGSTLookup } from '../hooks/useGSTLookup';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';
import { GSTConflictPanel } from '../components/GSTConflictPanel';
import { useAuth } from '../hooks/useAuth';
import { TermsModal } from '../components/TermsModal';

// --- Type Definitions for State ---
interface IFormData {
  companyName: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsapp: string;
  email: string;
  password: string;
  gstNo: string;
  address: string;
  stateName: string;
  pincode: string;
  experience: string;
  officeStart: string;
  officeEnd: string;
  deliveryMode: string;
  zoneCount: number;
  trackingLink: string;
  websiteLink: string;
  maxLoading: string;
  numTrucks: string;
  turnover: string;
  customerNetwork: string;
  pincodesServedRange: string;
}

type FormErrors = Partial<Record<keyof IFormData | 'zones', string>>;

// --- Reusable UI Components (with enhancements) ---

/**
 * A styled card container for sectioning content.
 */
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8 ${className}`}>
    {children}
  </div>
);

/**
 * A highly reusable input field with integrated icon, label, and error display.
 */
interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: keyof IFormData | string;
  label: string;
  icon: React.ReactNode;
  error?: string;
}
const InputField: React.FC<InputFieldProps> = ({ id, label, icon, error, required = false, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = props.type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : props.type;

  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none flex items-center justify-center">
          {icon}
        </span>
        <input
          id={id}
          {...props}
          type={inputType}
          placeholder={props.placeholder ?? ""}
          required={required}
          className={`w-full pl-11 ${isPassword ? 'pr-11' : 'pr-3'} py-2.5 border rounded-md shadow-sm transition-all duration-300
            bg-slate-50 text-slate-900 placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:border-amber-500
            ${error ? 'border-red-500 ring-red-500/50' : 'border-slate-300'}
            disabled:bg-slate-200/70`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none flex items-center justify-center transition-colors duration-200"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-error`}
            className="mt-1.5 text-xs text-red-600"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * NEW: A reusable select field component for UI consistency.
 */
interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: keyof IFormData | string;
  label: string;
  icon: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}
const SelectField: React.FC<SelectFieldProps> = ({ id, label, icon, error, required = false, children, ...props }) => (
  <div className="w-full">
    <label htmlFor={id} className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none">
        {icon}
      </span>
      <select
        id={id}
        {...props}
        required={required}
        className={`w-full pl-11 pr-10 py-2.5 border rounded-md shadow-sm transition-all duration-300
          bg-slate-50 text-slate-900 appearance-none
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:border-amber-500
          ${error ? 'border-red-500 ring-red-500/50' : 'border-slate-300'}
          disabled:bg-slate-200/70`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {children}
      </select>
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg className="w-5 h-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4 4 4-4" /></svg>
      </div>
    </div>
    <AnimatePresence>
      {error && <motion.p id={`${id}-error`} className="mt-1.5 text-xs text-red-600" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>{error}</motion.p>}
    </AnimatePresence>
  </div>
);


/**
 * A multi-step progress indicator.
 */
const StepIndicator: React.FC<{ currentStep: number; steps: string[] }> = ({ currentStep, steps }) => (
  <nav aria-label="Progress">
    <ol role="list" className="flex items-center">
      {steps.map((step, idx) => (
        <React.Fragment key={step}>
          <li className="relative flex-1 flex items-center justify-center">
            <div className={`flex items-center justify-center h-10 w-10 rounded-full font-medium transition-colors duration-300 z-10
              ${idx < currentStep ? 'bg-blue-600 text-white' : ''}
              ${idx === currentStep ? 'bg-white border-2 border-blue-600 text-blue-600' : 'bg-slate-200 text-slate-500'}`
            }>
              {idx < currentStep ? <CheckCircle className="h-6 w-6" /> : idx + 1}
            </div>
            <p className={`absolute top-12 whitespace-nowrap text-sm font-medium transition-colors
              ${idx === currentStep ? 'text-blue-600' : 'text-slate-500'}`
            }>{step}</p>
          </li>
          {idx < steps.length - 1 && (
            <div className="flex-1 h-0.5 transition-colors bg-slate-200 relative -ml-2 -mr-2">
              <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: currentStep > idx ? '100%' : '0%' }} />
            </div>
          )}
        </React.Fragment>
      ))}
    </ol>
  </nav>
);

// --- GST Validation Helper (MOD-36 Checksum from main frontend) ---
const validateGST = (gst: string): string => {
  if (!gst) return 'GST number is required';
  const gstUpper = gst.toUpperCase().replace(/\s+/g, '');
  if (gstUpper.length !== 15) return 'GST must be exactly 15 characters';
  if (!/^[A-Z0-9]+$/.test(gstUpper)) return 'GST can only contain letters (A-Z) and digits (0-9)';

  const stateCode = gstUpper.substring(0, 2);
  const validStateCodes = new Set([
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
    '31', '32', '33', '34', '35', '38', '97', '99'
  ]);
  if (!validStateCodes.has(stateCode)) {
    return 'Invalid state code in GST (must be between 01 and 35, 38, 97, or 99)';
  }

  const panPart = gstUpper.substring(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panPart)) {
    return 'Invalid PAN format in GST (positions 3–12 must be AAAAA9999A)';
  }

  const entityCode = gstUpper.charAt(12);
  if (!/^[1-9A-Z]$/.test(entityCode)) {
    return 'Entity code (position 13) must be a number (1-9) or letter (A-Z)';
  }

  const defaultChar = gstUpper.charAt(13);
  if (defaultChar !== 'Z') {
    return 'Character at position 14 must be Z';
  }

  const checksumChar = gstUpper.charAt(14);
  if (!/^[0-9A-Z]$/.test(checksumChar)) {
    return 'Invalid checksum digit (must be 0–9 or A–Z)';
  }

  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const ch = gstUpper.charAt(i);
    const charValue = charset.indexOf(ch);
    if (charValue === -1) return 'GST contains invalid character';
    const weight = (i % 2 === 0) ? 1 : 2;
    const product = charValue * weight;
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;
    sum += quotient + remainder;
  }

  const checksumValue = (36 - (sum % 36)) % 36;
  const expectedChecksum = charset.charAt(checksumValue);
  if (checksumChar !== expectedChecksum) {
    return `GST checksum digit is invalid (expected ${expectedChecksum}, got ${checksumChar})`;
  }

  return '';
};

// --- Pincode Prefix to State Database Lookup (Offline Fallback) ---
const getIndianStateByPincode = (pincode: string): { state: string; city: string } | null => {
  if (!/^\d{6}$/.test(pincode)) return null;
  const prefix2 = parseInt(pincode.substring(0, 2), 10);
  const prefix3 = parseInt(pincode.substring(0, 3), 10);

  if (prefix2 === 11) return { state: "DELHI", city: "New Delhi" };
  if (prefix2 === 12 || prefix2 === 13) return { state: "HARYANA", city: "Gurugram" };
  if (prefix2 === 14 || prefix2 === 15) return { state: "PUNJAB", city: "Ludhiana" };
  if (prefix2 === 16) return { state: "CHANDIGARH", city: "Chandigarh" };
  if (prefix2 === 17) return { state: "HIMACHAL PRADESH", city: "Shimla" };
  if (prefix2 === 18 || prefix2 === 19) return { state: "JAMMU & KASHMIR", city: "Srinagar" };
  if (prefix3 >= 248 && prefix3 <= 263) return { state: "UTTARAKHAND", city: "Dehradun" };
  if (prefix2 >= 20 && prefix2 <= 28) return { state: "UTTAR PRADESH", city: "Noida" };
  if (prefix2 >= 30 && prefix2 <= 34) return { state: "RAJASTHAN", city: "Jaipur" };
  if (prefix2 >= 36 && prefix2 <= 39) return { state: "GUJARAT", city: "Ahmedabad" };
  if (prefix2 >= 40 && prefix2 <= 44) return { state: "MAHARASHTRA", city: "Mumbai" };
  if (prefix2 >= 45 && prefix2 <= 48) return { state: "MADHYA PRADESH", city: "Bhopal" };
  if (prefix2 === 49) return { state: "CHHATTISGARH", city: "Raipur" };
  if (prefix2 >= 50 && prefix2 <= 53) {
    if (prefix2 === 50) return { state: "TELANGANA", city: "Hyderabad" };
    return { state: "ANDHRA PRADESH", city: "Visakhapatnam" };
  }
  if (prefix2 >= 56 && prefix2 <= 59) return { state: "KARNATAKA", city: "Bengaluru" };
  if (prefix2 >= 60 && prefix2 <= 64) return { state: "TAMIL NADU", city: "Chennai" };
  if (prefix2 >= 67 && prefix2 <= 69) return { state: "KERALA", city: "Kochi" };
  if (prefix3 === 737) return { state: "SIKKIM", city: "Gangtok" };
  if (prefix2 >= 70 && prefix2 <= 74) return { state: "WEST BENGAL", city: "Kolkata" };
  if (prefix2 >= 75 && prefix2 <= 77) return { state: "ODISHA", city: "Bhubaneswar" };
  if (prefix3 >= 790 && prefix3 <= 792) return { state: "ARUNACHAL PRADESH", city: "Itanagar" };
  if (prefix3 === 793 || prefix3 === 794) return { state: "MEGHALAYA", city: "Shillong" };
  if (prefix3 === 795) return { state: "MANIPUR", city: "Imphal" };
  if (prefix3 === 796) return { state: "MIZORAM", city: "Aizawl" };
  if (prefix3 === 797 || prefix3 === 798) return { state: "NAGALAND", city: "Kohima" };
  if (prefix3 === 799) return { state: "TRIPURA", city: "Agartala" };
  if (prefix2 === 78) return { state: "ASSAM", city: "Guwahati" };
  if (prefix2 >= 80 && prefix2 <= 85) {
    if (prefix2 >= 81 && prefix2 <= 83) return { state: "JHARKHAND", city: "Ranchi" };
    return { state: "BIHAR", city: "Patna" };
  }
  return null;
};

// --- Main Page Component ---
export default function SignUpPage() {
  const { user } = useAuth();
  const isUttamGoyal = useMemo(() => {
    if (!user) return false;
    const customer = (user as any)?.customer || (user as any);
    const first = (customer?.firstName || '').trim().toLowerCase();
    const last = (customer?.lastName || '').trim().toLowerCase();
    return (first === 'uttam' && last === 'goyal') || (first === 'abhudaya' && last === 'singh');
  }, [user]);

  // State Management
  const [formData, setFormData] = useState<IFormData>(() => {
    // Only restore saved form data when resuming manual mode.
    // Never pre-populate with AI data when the user selects Manual explicitly.
    const mode = localStorage.getItem('transporter_onboarding_mode');
    const isNewSession = new URLSearchParams(window.location.search).get('new_session') === '1';

    if (mode === 'manual' && !isNewSession) {
      const saved = localStorage.getItem('transporter_onboarding_form_data');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) { }
      }
    }
    return {
      companyName: '', firstName: '', lastName: '', phone: '', whatsapp: '', email: '', password: '', gstNo: '', address: '',
      stateName: '', pincode: '', experience: '', officeStart: '09:00',
      officeEnd: '18:00', deliveryMode: 'Road', zoneCount: 0,
      trackingLink: '', websiteLink: '', maxLoading: '', numTrucks: '', turnover: '', customerNetwork: '', pincodesServedRange: '',
    };
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [file, setFile] = useState<File | null>(null);
  const [uploadedService, setUploadedService] = useState<{ pincode: number; isOda: boolean; zone: string }[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(() => {
    if (new URLSearchParams(window.location.search).get('new_session') === '1') return 0;
    const saved = localStorage.getItem('transporter_onboarding_current_step');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [onboardingMode, setOnboardingMode] = useState<'selection' | 'ai_upload' | 'ai_processing' | 'ai_summary' | 'manual'>(() => {
    if (new URLSearchParams(window.location.search).get('new_session') === '1') {
      localStorage.removeItem('transporter_onboarding_mode');
      localStorage.removeItem('transporter_onboarding_current_step');
      localStorage.removeItem('transporter_onboarding_form_data');
      localStorage.removeItem('transporter_extracted_service');
      // None of these are scoped to a particular transporter/GST — they're
      // just whatever the last session (possibly a different company) left
      // behind. AddPrice.tsx falls back to transporter_extracted_price_rate
      // once transporter_price_rate is gone, and reuses transporter_zone_rates
      // whenever the new session's zone-label count happens to match the old
      // matrix's length (likely, since the zone taxonomy is standardized
      // across all transporters) — so leaving either behind just moves the
      // same stale-data leak one layer down instead of fixing it. A fresh
      // upload regenerates both from scratch anyway, so there's no real
      // "cache" benefit lost by clearing them here.
      localStorage.removeItem('transporter_price_rate');
      localStorage.removeItem('transporter_extracted_price_rate');
      localStorage.removeItem('transporter_zone_rates');
      return 'selection';
    }
    return (localStorage.getItem('transporter_onboarding_mode') as any) || 'selection';
  });
  const [aiFiles, setAiFiles] = useState<Array<{ file: File; id: string; category: 'company_details' | 'charges' | 'zone_data' }>>([]);
  const [extractionLogs, setExtractionLogs] = useState<string[]>([]);
  const [isAiDragging, setIsAiDragging] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [extractedPreview, setExtractedPreview] = useState<Record<string, string> | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');

  interface AiSummaryData {
    company: Record<string, string>;
    companySource: Record<string, 'file' | 'carried'>;
    pricing: Record<string, string>;
    hasZoneData: boolean;
    zoneCount: number;
    totalPincodes: number;
    hasPricingData: boolean;
  }
  const [aiSummaryData, setAiSummaryData] = useState<AiSummaryData | null>(null);

  // Pre-checked by default — unticking blocks "Next". Clicking "Terms & Conditions"
  // opens TermsModal; never a forced full-page gate.
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  // Critical-fields safety net: companyName/address/stateName are backend-required
  // but never shown on Page 1 (GST + pincode autofill cover them in the common
  // case, and AI extraction on Page 2 gets a second chance). Checked fresh right
  // before every addtransporter POST, so there's no stale pass-through if the
  // user navigates back and forth without actually fixing anything.
  interface MissingField {
    id: 'companyName' | 'address' | 'stateName';
    label: string;
    placeholder: string;
    maxLength: number;
  }
  const [missingFieldsModal, setMissingFieldsModal] = useState<{
    open: boolean;
    fields: MissingField[];
    values: Record<string, string>;
  }>({ open: false, fields: [], values: {} });

  // WhatsApp mirrors Mobile until the user edits WhatsApp directly (see its
  // onChange below) — same pattern as the shipper signup form. If both fields
  // are cleared back to empty, mirroring re-engages so a freshly-typed Mobile
  // number starts copying into WhatsApp again.
  const [sameAsPhone, setSameAsPhone] = useState(true);

  useEffect(() => {
    if (sameAsPhone) {
      setFormData(prev => (prev.whatsapp === prev.phone ? prev : { ...prev, whatsapp: prev.phone }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameAsPhone, formData.phone]);

  useEffect(() => {
    if (!sameAsPhone && !formData.phone && !formData.whatsapp) {
      setSameAsPhone(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.phone, formData.whatsapp, sameAsPhone]);

  const navigate = useNavigate();

  // ─── GST Autofill ──────────────────────────────────────────────────────────
  const gstLookup = useGSTLookup();
  const [gstFocused, setGstFocused] = useState(false);
  const appliedGstinRef = useRef<string | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    gstLookup.lookup(formData.gstNo || '', {
      companyName: formData.companyName || '',
      address: formData.address || '',
      state: formData.stateName || '',
      city: '',
      pincode: formData.pincode || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.gstNo]);

  useEffect(() => {
    const data = gstLookup.gstData;
    if (!data) return;
    if (gstLookup.status !== 'success' && gstLookup.status !== 'partial') return;
    if (appliedGstinRef.current === data.gstin) return;
    appliedGstinRef.current = data.gstin;

    if (gstLookup.status === 'partial') {
      if (data.stateName) setFormData(prev => ({ ...prev, stateName: data.stateName! }));
      return;
    }

    const conflictKeys = new Set(gstLookup.conflicts.map(c => c.key));
    setFormData(prev => {
      const updated = { ...prev };
      if (!conflictKeys.has('companyName') && data.legalName) updated.companyName = data.legalName;
      if (!conflictKeys.has('address') && data.address) updated.address = data.address;
      if (!conflictKeys.has('state') && data.stateName) updated.stateName = data.stateName;
      if (!conflictKeys.has('state') && !conflictKeys.has('city') && !conflictKeys.has('pincode') && data.pincode)
        updated.pincode = data.pincode;
      return updated;
    });
  }, [gstLookup.gstData, gstLookup.status, gstLookup.conflicts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConflictApply = useCallback((selectedKeys: string[]) => {
    const data = gstLookup.gstData;
    if (!data) return;
    setFormData(prev => {
      const updated = { ...prev };
      selectedKeys.forEach(key => {
        switch (key) {
          case 'companyName': if (data.legalName) updated.companyName = data.legalName; break;
          case 'address': if (data.address) updated.address = data.address; break;
          case 'state': if (data.stateName) updated.stateName = data.stateName; break;
          case 'pincode': if (data.pincode) updated.pincode = data.pincode; break;
        }
      });
      return updated;
    });
    gstLookup.dismissConflictPanel();
  }, [gstLookup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch to Manual mode from the Page 2 route-selection screen. Page 1's
  // details (formData) are already filled in and confirmed by this point —
  // unlike the old flow, this must NOT reset them or drop back to currentStep 0
  // (that's Page 1 itself now). Only clears validation cruft from any AI route
  // detour and ensures we're parked on the Page 2 step.
  const resetToManual = () => {
    setErrors({});
    setTouched({});
    setCurrentStep(1);
    setOnboardingMode('manual');
  };

  // Save to localStorage when state changes
  useEffect(() => {
    localStorage.setItem('transporter_onboarding_form_data', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    localStorage.setItem('transporter_onboarding_current_step', String(currentStep));
  }, [currentStep]);

  useEffect(() => {
    // Don't persist transient pipeline screens — refresh should restart from upload
    const persistMode = (onboardingMode === 'ai_processing' || onboardingMode === 'ai_summary')
      ? 'ai_upload'
      : onboardingMode;
    localStorage.setItem('transporter_onboarding_mode', persistMode);
  }, [onboardingMode]);

  useEffect(() => {
    // When loaded inside the FreightCompare parent iframe, always clear the
    // stale onboarding route so the user isn't permanently redirected to /addprice.
    if (window.parent !== window) {
      localStorage.removeItem('transporter_onboarding_active_route');
      return;
    }
    // Standalone mode (opened directly): honour the saved resume route.
    const activeRoute = localStorage.getItem('transporter_onboarding_active_route');
    if (activeRoute === '/addprice') {
      navigate('/addprice');
    }
  }, [navigate]);

  useReportIframeHeight([currentStep, onboardingMode]);

  // Zone names actually present in the uploaded/extracted service data — never
  // hardcode this empty, or AddPrice's Zone-to-Zone Rates step has nothing to show.
  const zones = useMemo(
    () => Array.from(new Set(uploadedService.map(s => s.zone).filter(Boolean))),
    [uploadedService]
  );

  // Parse the uploaded .xlsx ourselves so we can show a zone summary
  // (pincode counts, coverage) immediately, instead of waiting on the backend.
  useEffect(() => {
    if (!file) {
      setUploadedService([]);
      return;
    }
    let cancelled = false;
    setIsParsingFile(true);
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        const getVal = (row: Record<string, any>, ...keys: string[]) => {
          for (const k of keys) {
            if (row[k] !== undefined) return row[k];
            const found = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
            if (found && row[found] !== undefined) return row[found];
          }
          return undefined;
        };

        const parsed = rows
          .map(row => {
            const pincode = Number(getVal(row, 'pincode', 'Pincode', 'PINCODE')) || 0;
            const odaRaw = String(getVal(row, 'isOda', 'ODA', 'oda', 'IsOda') || 'false').toLowerCase();
            const isOda = odaRaw === 'true' || odaRaw === 'yes';
            const zone = String(getVal(row, 'zone', 'Zone', 'ZONE') || '').trim();
            return { pincode, isOda, zone };
          })
          .filter(e => e.pincode > 0 && e.zone);

        if (cancelled) return;
        setUploadedService(parsed);
        if (parsed.length > 0) {
          sessionStorage.setItem('transporter_zone_pincode_data', JSON.stringify(parsed));
        } else {
          toast.error('No valid pincode/zone rows found in that file.');
        }
      } catch (err) {
        console.error('Failed to parse uploaded service sheet', err);
        if (!cancelled) toast.error('Could not read zones from the uploaded file.');
      } finally {
        if (!cancelled) setIsParsingFile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // --- AI Document Extraction Functions ---
  const appendLog = (line: string) => {
    setExtractionLogs(prev => [...prev, line]);
    setTimeout(() => {
      const el = document.getElementById('ai-console');
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const guessCategory = (filename: string): 'company_details' | 'charges' | 'zone_data' => {
    const n = filename.toLowerCase().replace(/[_\-. ]/g, ' ');
    const companyKw = ['company', 'vendor', 'transporter', 'profile', 'info', 'details', 'contact', 'gst', 'pan', 'kyc', 'overview', 'about'];
    const chargeKw = ['rate', 'rates', 'charge', 'charges', 'price', 'pricing', 'tariff', 'fuel', 'docket', 'oda', 'rov', 'insurance', 'surcharge', 'fee', 'cost', 'billing'];
    const zoneKw = ['zone', 'zones', 'pincode', 'pincodes', 'serviceability', 'service', 'coverage', 'matrix', 'area', 'delivery', 'served', 'network'];
    const score = (kws: string[]) => kws.filter(k => n.includes(k)).length;
    const s = { company_details: score(companyKw), charges: score(chargeKw), zone_data: score(zoneKw) };
    const best = (Object.keys(s) as Array<'company_details' | 'charges' | 'zone_data'>).sort((a, b) => s[b] - s[a]);
    return s[best[0]] > 0 ? best[0] : 'charges';
  };

  const MAX_AI_FILES = 3;

  const handleAiFilesAdd = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const ACCEPTED = new Set(['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.docx', '.doc', '.pptx', '.ppt', '.json', '.tiff', '.bmp', '.webp']);
    const next: Array<{ file: File; id: string; category: 'company_details' | 'charges' | 'zone_data' }> = [];
    let remainingSlots = MAX_AI_FILES - aiFiles.length;
    for (const f of arr) {
      if (remainingSlots <= 0) {
        toast.error(`You can only upload up to ${MAX_AI_FILES} files. "${f.name}" was skipped.`);
        continue;
      }
      const ext = '.' + f.name.split('.').pop()!.toLowerCase();
      if (!ACCEPTED.has(ext)) {
        toast.error(`"${f.name}" isn't a supported file type.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" is too big — files must be under 10 MB.`);
        continue;
      }
      next.push({
        file: f,
        id: Math.random().toString(36).slice(2),
        category: guessCategory(f.name)
      });
      remainingSlots--;
    }
    setAiFiles(prev => [...prev, ...next]);
  };

  const startAiExtraction = async () => {
    if (aiFiles.length === 0) {
      toast.error('Please upload at least one file first.');
      return;
    }

    setOnboardingMode('ai_processing');
    setExtractionStatus('processing');
    setExtractionLogs([]);
    setAiProgress(10);
    appendLog(`[START] Initiating automated onboarding parser...`);

    const controller = new AbortController();
    aiAbortControllerRef.current = controller;

    const rawName = formData.companyName || 'new_transporter_' + Math.random().toString(36).slice(2, 6);
    const safeName = rawName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'new_transporter';

    const authToken = Cookies.get('authToken');
    const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

    try {
      appendLog(`[INFO] Setting up temporary workspace for "${rawName}"...`);
      const createRes = await axios.post(`${API_BASE_URL}/api/utsf-generator/transporter`, {
        name: safeName
      }, { headers: authHeaders, signal: controller.signal });
      if (!createRes.data.success) {
        throw new Error('Failed to allocate remote processing slot.');
      }
      setAiProgress(25);
      appendLog(`[OK] Workspace allocated successfully.`);

      appendLog(`[INFO] Uploading ${aiFiles.length} files to document intelligence pipeline...`);
      for (const item of aiFiles) {
        const fd = new FormData();
        fd.append('files', item.file);
        fd.append('subfolder', item.category);

        await axios.post(`${API_BASE_URL}/api/utsf-generator/transporter/${safeName}/upload`, fd, { headers: authHeaders, signal: controller.signal });
        appendLog(`[OK] Uploaded "${item.file.name}" as [${item.category.replace('_', ' ')}]`);
      }
      setAiProgress(50);
      appendLog(`[AI] Processing files & running OCR layout extraction...`);

      const headers: Record<string, string> = { ...authHeaders };

      const streamUrl = `${API_BASE_URL}/api/utsf-generator/transporter/${safeName}/stream`;
      const response = await fetch(streamUrl, { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error('Could not establish live log streaming connection.');
      }
      setAiProgress(70);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let downloadToken: string | null = null;

      // Timeout: if generation takes > 8 minutes, cancel and surface a helpful error
      const STREAM_TIMEOUT_MS = 8 * 60 * 1000;
      let streamTimedOut = false;
      const timeoutId = setTimeout(() => {
        streamTimedOut = true;
        reader.cancel();
      }, STREAM_TIMEOUT_MS);

      // Rolling progress ticks (70 → 88) so the bar moves while Flask is working
      let progressTick = 70;
      const progressInterval = setInterval(() => {
        if (progressTick < 88) {
          progressTick += 2;
          setAiProgress(progressTick);
        }
      }, 15000); // +2% every 15 s

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (typeof data === 'string') {
                appendLog(`> ${data}`);
              } else if (data.__done__) {
                if (data.exitCode === 0) {
                  downloadToken = data.downloadToken || null;
                  appendLog('[DONE] AI extraction pipeline completed successfully.');
                } else {
                  throw new Error('Extraction engine reported an execution error.');
                }
              } else if (data.companyName) {
                appendLog(`[INFO] Detected Vendor details: ${data.companyName}`);
              }
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
          }
        }
      } finally {
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
      }

      if (streamTimedOut) {
        throw new Error(
          'Generation timed out after 8 minutes. Large pincode files can take a while — ' +
          'try splitting the file or reducing rows, then retry.'
        );
      }

      setAiProgress(90);
      if (!downloadToken) {
        throw new Error('Failed to retrieve generation token.');
      }

      appendLog(`[INFO] Fetching extracted profile data...`);
      const utsfRes = await axios.get(`${API_BASE_URL}/api/utsf-generator/output/file/${downloadToken}`, { signal: controller.signal });
      const utsf = utsfRes.data;

      appendLog(`[OK] Data retrieved. Syncing profile to form fields...`);

      // UTSF v2 stores profile fields under meta, not basics
      const meta = utsf.meta || {};
      const basics = utsf.basics || {};  // legacy fallback

      // Every field below falls back to whatever Page 1 already collected/resolved
      // (GST lookup, pincode lookup, or direct user input) before falling back to
      // empty — AI extraction should only ever *add* data, never erase fields the
      // user already correctly filled in just because the uploaded document
      // (usually just a pricing sheet) doesn't happen to restate them. `pick`
      // also records WHERE each value came from, so the summary screen can be
      // honest about what this specific upload actually contained vs. what's
      // just carried over from an earlier step/session.
      const pick = (docVal: unknown, formVal: string): { value: string; source: 'file' | 'carried' } | null => {
        if (docVal !== undefined && docVal !== null && String(docVal).trim() !== '') {
          return { value: String(docVal), source: 'file' };
        }
        if (formVal) return { value: formVal, source: 'carried' };
        return null;
      };

      const companyNameF = pick(meta.companyName || utsf.companyName || basics.companyName, formData.companyName);
      const emailF = pick(meta.contactEmail || meta.email || basics.email || basics.primaryContactEmail || utsf.primaryContactEmail, formData.email);
      const phoneF = pick(meta.contactPhone || meta.phone || basics.phone || basics.primaryContactPhone || utsf.primaryContactPhone, formData.phone);
      const gstNoF = pick(meta.gstNo || basics.gstNo || utsf.gstNo, formData.gstNo);
      const addressF = pick(meta.address || basics.address, formData.address);
      const stateNameF = pick(meta.state || meta.stateName || basics.state || basics.stateName, formData.stateName);
      const pincodeF = pick(meta.pincode || basics.pincode, formData.pincode);
      const websiteLinkF = pick(meta.website || meta.websiteLink || basics.websiteLink, formData.websiteLink);
      // meta.transportMode (LTL/FTL/B2C/surface/air) is NOT the same field as
      // formData.deliveryMode (Road/Air/Rail — the actual selector on Page 1),
      // and the UTSF schema hardcodes "LTL" as its default for every profile
      // regardless of what was uploaded (see fc4_schema.py UTSF_EMPTY_TEMPLATE) —
      // there is no way to tell a genuinely-extracted mode from that baked-in
      // default. So it's deliberately never surfaced here or merged into
      // formData.deliveryMode; Page 1's own value (typed by the user) stands.

      const companyName = companyNameF?.value || '';
      const email = emailF?.value || '';
      const phone = phoneF?.value || '';
      const gstNo = gstNoF?.value || '';
      const address = addressF?.value || '';
      const stateName = stateNameF?.value || '';
      const pincode = pincodeF?.value || '';
      const experience = meta.experience || basics.experience || '';
      const officeStart = meta.officeStart || basics.officeStart || '09:00';
      const officeEnd = meta.officeEnd || basics.officeEnd || '18:00';
      const websiteLink = websiteLinkF?.value || '';

      const numTrucks = meta.numTrucks || meta.fleetSize || basics.numTrucks || basics.fleetSize || '';
      const maxLoading = meta.maxLoading || meta.maxCap || basics.maxLoading || basics.maxCap || '';
      const turnover = meta.turnover || basics.turnover || '';
      const customerNetwork = meta.customerNetwork || basics.customerNetwork || 'B2B';

      setFormData(prev => ({
        ...prev,
        companyName,
        email,
        phone,
        gstNo,
        address,
        stateName,
        pincode,
        experience: String(experience),
        officeStart,
        officeEnd,
        websiteLink,
        numTrucks: String(numTrucks),
        maxLoading: String(maxLoading),
        turnover: String(turnover),
        customerNetwork
      }));

      setAiProgress(100);

      // Build company preview for the AI summary screen — plus a parallel map
      // recording whether each value actually came from this upload ("file")
      // or is just carried over from an earlier step ("carried"), so the UI
      // never implies the AI read something it didn't.
      const preview: Record<string, string> = {};
      const previewSource: Record<string, 'file' | 'carried'> = {};
      const addPreview = (label: string, field: { value: string; source: 'file' | 'carried' } | null) => {
        if (!field) return;
        preview[label] = field.value;
        previewSource[label] = field.source;
      };
      addPreview('Company', companyNameF);
      addPreview('Email', emailF);
      addPreview('Phone', phoneF);
      addPreview('GST', gstNoF);
      addPreview('State', stateNameF);
      addPreview('Pincode', pincodeF);
      addPreview('Address', addressF);
      addPreview('Website', websiteLinkF);
      setExtractedPreview(Object.keys(preview).length > 0 ? preview : null);

      // ── Extract pricing schedule from UTSF output ──
      appendLog('[INFO] Extracting pricing schedule from documents...');
      // UTSF v2.1 stores rates in utsf.pricing.priceRate (not utsf.prices.priceRate)
      // Complex charges use {v, f} format (not {variable, fixed})
      const rawPR = utsf.pricing?.priceRate || utsf.prices?.priceRate || utsf.priceRate || {};
      const cv = (c: any, k: 'v' | 'variable') => Number(c?.[k] ?? c?.[k === 'v' ? 'variable' : 'v'] ?? 0);
      const cf = (c: any, k: 'f' | 'fixed') => Number(c?.[k] ?? c?.[k === 'f' ? 'fixed' : 'f'] ?? 0);

      // The generator emits schema-required {v,f}/0 placeholders for every
      // charge the source document never mentioned (e.g. minWeight defaults to
      // 0.5, divisor/kFactor to 5000) — those are NOT vendor-quoted data, just
      // shape filler. `_chargeFieldsFromSource` (fc4_encoder.py) is the
      // generator's own record of which fields it actually found in your
      // upload; anything not in it gets zeroed here so it reads as "not
      // provided" (blank in the price form) instead of a fabricated number.
      // Note: divisor/kFactor has no source-tracking key at all — it's always
      // schema filler, so it's always zeroed regardless.
      const sourcedFields: string[] = Array.isArray(utsf._chargeFieldsFromSource) ? utsf._chargeFieldsFromSource : [];
      const fromSource = (key: string) => sourcedFields.includes(key);

      const extractedPR = {
        minWeight: fromSource('minWeight') ? Number(rawPR.minWeight || rawPR.minChargableWeight || 0) : 0,
        docketCharges: fromSource('docketCharges') ? Number(rawPR.docketCharges || 0) : 0,
        fuel: fromSource('fuel') ? Number(rawPR.fuel || rawPR.fuelSurcharge || rawPR.fuelCharge || 0) : 0,
        rovCharges: fromSource('rovCharges') ? { variable: cv(rawPR.rovCharges, 'v'), fixed: cf(rawPR.rovCharges, 'f') } : { variable: 0, fixed: 0 },
        insuranceCharges: fromSource('insuranceCharges') ? { variable: cv(rawPR.insuranceCharges, 'v'), fixed: cf(rawPR.insuranceCharges, 'f') } : { variable: 0, fixed: 0 },
        odaCharges: fromSource('odaCharges') ? { variable: cv(rawPR.odaCharges, 'v'), fixed: cf(rawPR.odaCharges, 'f') } : { variable: 0, fixed: 0 },
        codCharges: fromSource('codCharges') ? { variable: cv(rawPR.codCharges, 'v'), fixed: cf(rawPR.codCharges, 'f') } : { variable: 0, fixed: 0 },
        prepaidCharges: fromSource('prepaidCharges') ? { variable: cv(rawPR.prepaidCharges, 'v'), fixed: cf(rawPR.prepaidCharges, 'f') } : { variable: 0, fixed: 0 },
        topayCharges: fromSource('topayCharges') ? { variable: cv(rawPR.topayCharges, 'v'), fixed: cf(rawPR.topayCharges, 'f') } : { variable: 0, fixed: 0 },
        handlingCharges: fromSource('handlingCharges')
          ? { variable: cv(rawPR.handlingCharges, 'v'), fixed: cf(rawPR.handlingCharges, 'f'), thresholdWeight: Number(rawPR.handlingCharges?.thresholdWeight || 0) }
          : { variable: 0, fixed: 0, thresholdWeight: 0 },
        fmCharges: fromSource('fmCharges') ? { variable: cv(rawPR.fmCharges, 'v'), fixed: cf(rawPR.fmCharges, 'f') } : { variable: 0, fixed: 0 },
        appointmentCharges: fromSource('appointmentCharges') ? { variable: cv(rawPR.appointmentCharges, 'v'), fixed: cf(rawPR.appointmentCharges, 'f') } : { variable: 0, fixed: 0 },
        kFactor: 0, // divisor/kFactor is never source-tracked — always schema filler, never real
        minCharges: fromSource('minCharges') ? Number(rawPR.minCharges || 0) : 0,
        greenTax: fromSource('greenTax') ? Number(rawPR.greenTax || 0) : 0,
        daccCharges: fromSource('daccCharges') ? Number(rawPR.daccCharges || 0) : 0,
        miscellanousCharges: fromSource('miscCharges') ? Number(rawPR.miscellanousCharges || rawPR.miscCharges || 0) : 0,
      };

      // Based on what the generator actually found in the source, not on
      // whether a (possibly-zeroed) value happens to be > 0 — a vendor
      // genuinely quoting "₹0 docket fee" is still real sourced data.
      const PRICING_RELEVANT_FIELDS = [
        'minWeight', 'docketCharges', 'fuel', 'rovCharges', 'insuranceCharges',
        'odaCharges', 'codCharges', 'prepaidCharges', 'topayCharges',
        'handlingCharges', 'fmCharges', 'appointmentCharges', 'minCharges',
        'greenTax', 'daccCharges', 'miscCharges',
      ];
      const hasPricingData = sourcedFields.some(f => PRICING_RELEVANT_FIELDS.includes(f));

      if (hasPricingData) {
        localStorage.setItem('transporter_extracted_price_rate', JSON.stringify(extractedPR));
        appendLog(`[OK] Pricing schedule extracted — Docket ₹${extractedPR.docketCharges}, Fuel ${extractedPR.fuel}%, Min.Wt ${extractedPR.minWeight}kg`);
      } else {
        appendLog('[INFO] No structured pricing data detected in documents. Manual entry required for charges.');
      }

      // Zone / serviceability summary
      const serviceability = utsf.serviceability || {};
      const zoneLabelsFromUtsf = Object.keys(serviceability);
      const zoneCount = zoneLabelsFromUtsf.length;
      // Use stats.totalPincodes if available, otherwise count all singles across zones
      const totalPincodes = utsf.stats?.totalPincodes
        || utsf.stats?.totalServedPincodes
        || zoneLabelsFromUtsf.reduce((sum, z) => {
          const entry = serviceability[z];
          return sum + (entry.servedCount || 0) + (entry.odaCount || 0);
        }, 0);

      // Range expansion — servedRanges/odaRanges/crossZoneRanges are the UTSF
      // encoder's compressed form for 3+ CONSECUTIVE pincodes ({s,e}
      // start/end pairs), which is how most real coverage is stored (postal
      // codes cluster). Reading only *Singles here silently dropped every
      // range-compressed pincode — e.g. DB Shenker's 20,226-pincode file only
      // produced 6,991 singles; the other ~12,400 were sitting in
      // servedRanges/odaRanges and never made it into the saved transporter.
      const expandRanges = (ranges: Array<{ s: number; e: number }> | undefined): number[] => {
        const out: number[] = [];
        for (const r of ranges || []) {
          if (r == null || r.s == null || r.e == null) continue;
          for (let p = r.s; p <= r.e; p++) out.push(p);
        }
        return out;
      };

      // Verified against the raw UTSF output: per zone, servedCount ===
      // (servedSingles+servedRanges) + (crossZoneSingles+crossZoneRanges) —
      // crossZone* holds pincodes the vendor serves under this zone label
      // even though the pincode's canonical/master zone differs, and is a
      // genuinely separate, ADDITIVE set from served (not overlapping).
      // odaSingles/odaRanges, however, are a full SUBSET of served+crossZone
      // (every ODA pincode is also a served pincode, just surcharged) — so
      // pushing them as their own separate entries, as before, created a
      // duplicate row for every ODA pincode (once isOda:false, once
      // isOda:true) instead of one row with isOda correctly set to true.
      // Building a per-zone pincode->isOda lookup first, instead of pushing
      // straight into an array, dedupes that overlap by construction. Using a
      // plain object (not the built-in Map) — this file imports `Map` as the
      // lucide-react location icon (see the top-of-file import + its uses on
      // the State/Address fields below), which shadows the global Map
      // constructor for the whole module; `new Map()` here would try to
      // construct that icon component instead and throw "Map is not a
      // constructor". Object keys coerce to strings anyway, so pincodes are
      // tracked as string keys and converted back to Number on push.
      const serviceArray: { pincode: number, isOda: boolean, zone: string }[] = [];
      for (const zone of zoneLabelsFromUtsf) {
        const entry = serviceability[zone];
        const servedSingles = entry.servedSingles || entry.incl_singles || entry.includedSingles || [];
        const servedRangePins = expandRanges(entry.servedRanges);
        const crossZoneSingles = entry.crossZoneSingles || [];
        const crossZoneRangePins = expandRanges(entry.crossZoneRanges);
        const odaSingles = entry.odaSingles || [];
        const odaRangePins = expandRanges(entry.odaRanges);

        const zonePins: Record<string, boolean> = {}; // pincode (string key) -> isOda
        for (const pin of [...servedSingles, ...servedRangePins, ...crossZoneSingles, ...crossZoneRangePins]) {
          zonePins[String(pin)] = false;
        }
        for (const pin of [...odaSingles, ...odaRangePins]) {
          zonePins[String(pin)] = true; // overwrites the false already set above
        }
        for (const pincodeStr of Object.keys(zonePins)) {
          serviceArray.push({ pincode: Number(pincodeStr), isOda: zonePins[pincodeStr], zone });
        }
      }
      // Store zone labels + the (small) rate matrix FIRST, before the large
      // pincode-level serviceArray write below — a big pincode file (tens of
      // thousands of entries, ~1MB+ JSON) can silently throw
      // QuotaExceededError against localStorage/sessionStorage's few-MB
      // per-origin cap, especially after a long testing session's worth of
      // accumulated leftover keys. None of these writes were try/caught, so
      // that throw aborted the function before ever reaching whichever write
      // came after it — zones-added-but-rates-empty is exactly what that
      // looks like from the UI. Rates are the more critical, much smaller
      // payload (13×13 numbers vs. 20,000+ pincode objects), so they now go
      // first and are wrapped so a later quota failure can't take them down
      // with it.
      if (zoneLabelsFromUtsf.length > 0) {
        try {
          sessionStorage.setItem('zones', JSON.stringify(zoneLabelsFromUtsf));
          // Build the zone rate matrix skeleton from UTSF zoneRates (if available)
          const utsfZoneRates = utsf.pricing?.zoneRates || {};
          if (Object.keys(utsfZoneRates).length > 0) {
            const matrix = zoneLabelsFromUtsf.map(from =>
              zoneLabelsFromUtsf.map(to => utsfZoneRates[from]?.[to] || 0)
            );
            localStorage.setItem('transporter_zone_rates', JSON.stringify(matrix));
          }
        } catch (storageErr) {
          console.error('[AI extraction] Failed to store zone labels/rates:', storageErr);
        }
      }

      if (serviceArray.length > 0) {
        try {
          localStorage.setItem('transporter_extracted_service', JSON.stringify(serviceArray));
          // Same shared key the manual-upload path writes — AddPrice's zone
          // summary reads from here regardless of which onboarding route was used.
          sessionStorage.setItem('transporter_zone_pincode_data', JSON.stringify(serviceArray));
        } catch (storageErr) {
          // Large files (tens of thousands of pincodes) can exceed the
          // localStorage/sessionStorage quota — non-fatal: zone labels and
          // rates above are unaffected, and setUploadedService below still
          // keeps the data usable in-memory for this page's own zone summary.
          console.error('[AI extraction] Failed to store pincode-level service data (likely storage quota):', storageErr);
        }
        // Keep the `zones` derivation (used at final submit) in sync too —
        // otherwise the AI path hits the exact same "zones wiped at submit" bug.
        setUploadedService(serviceArray);
      }
      // Store company name for AddPrice's transporter display
      if (companyName) sessionStorage.setItem('companyName', companyName);

      // Build pricing summary chips for the summary screen
      const pricingSummary: Record<string, string> = {};
      if (extractedPR.minWeight > 0) pricingSummary['Min. Chargeable Wt.'] = `${extractedPR.minWeight} kg`;
      if (extractedPR.docketCharges > 0) pricingSummary['Docket Charges'] = `₹${extractedPR.docketCharges}`;
      if (extractedPR.fuel > 0) pricingSummary['Fuel Surcharge'] = `${extractedPR.fuel}%`;
      if (extractedPR.rovCharges.variable > 0) pricingSummary['ROV (Variable)'] = `${extractedPR.rovCharges.variable}%`;
      if (extractedPR.rovCharges.fixed > 0) pricingSummary['ROV (Fixed)'] = `₹${extractedPR.rovCharges.fixed}`;
      if (extractedPR.odaCharges.variable > 0 || extractedPR.odaCharges.fixed > 0)
        pricingSummary['ODA Charges'] = `${extractedPR.odaCharges.variable}% + ₹${extractedPR.odaCharges.fixed}`;
      if (extractedPR.insuranceCharges.variable > 0)
        pricingSummary['Insurance (Variable)'] = `${extractedPR.insuranceCharges.variable}%`;
      // Divisor/kFactor is never shown — the generator has no way to mark it as
      // genuinely sourced (see extractedPR.kFactor above), so it's always 0/schema
      // filler here and would be misleading to display as "extracted".

      setAiSummaryData({
        company: preview,
        companySource: previewSource,
        pricing: pricingSummary,
        hasZoneData: zoneCount > 0,
        zoneCount,
        totalPincodes,
        hasPricingData,
      });

      setExtractionStatus('success');

      // The user is no longer on this page by the time we get here — navigation
      // to /addprice already happened the instant they clicked "Yes, Read My
      // Files Now" (see startAiExtractionAndContinue). All that's left to do is
      // record that extraction finished so AddPrice's polling picks it up; it
      // reads the same localStorage keys already written above (company/price/
      // zone data) plus this status flag to know when to stop waiting.
      localStorage.setItem('transporter_ai_extraction_status', zoneCount > 0 ? 'success' : 'failed');
      if (zoneCount > 0) {
        toast.success('Documents read successfully — your details are ready to review.');
      } else {
        appendLog('[WARN] No service zones found in the uploaded documents.');
        toast.error('Could not find any service zones in your documents — you can fill them in manually.');
      }
    } catch (err: any) {
      // User clicked Cancel mid-process — cancelAiExtraction() already reset the
      // screen back to the upload state, so don't surface this as a failure.
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || axios.isCancel(err)) {
        localStorage.setItem('transporter_ai_extraction_status', 'failed');
        return;
      }
      const serverMsg = err?.response?.data?.message || err?.response?.data?.error;
      const detail = serverMsg || err?.message || String(err);
      appendLog(`[ERROR] ${detail}`);
      toast.error(`Ingestion failed: ${detail}`, { duration: 6000 });
      localStorage.setItem('transporter_ai_extraction_status', 'failed');
      setAiProgress(0);
      setExtractionStatus('failed');
    }
  };

  // Fires when "Yes, Read My Files Now" is clicked — leaves this page
  // immediately instead of waiting here for extraction to finish. Vendor
  // creation itself is deferred all the way to AddPrice's final "Save &
  // Continue" (see AddPrice.tsx handleSubmit), by which point extraction has
  // long since completed in the background — so nothing incomplete ever gets
  // written to the database. startAiExtraction() is intentionally NOT
  // awaited: it keeps running after this component unmounts (localStorage
  // writes don't depend on the component being mounted), and AddPrice picks
  // up its results by polling the same localStorage keys.
  const startAiExtractionAndContinue = () => {
    if (aiFiles.length === 0) {
      toast.error('Please upload at least one file first.');
      return;
    }
    // A NEW extraction is genuinely starting right now — clear any pricing/
    // zone-rate leftovers from whatever the last extraction (possibly a
    // different company) wrote, regardless of how the user got to this
    // screen. Relying only on ?new_session=1 at initial page load (see the
    // onboardingMode initializer above) isn't reliable for every path back
    // into this screen — e.g. resuming a session, going Back from /addprice,
    // or re-uploading without a full fresh navigation — all of which skip
    // that reset entirely and let stale charges/rates bleed into this run.
    localStorage.removeItem('transporter_price_rate');
    localStorage.removeItem('transporter_extracted_price_rate');
    localStorage.removeItem('transporter_zone_rates');
    localStorage.setItem('transporter_pending_creation', 'true');
    localStorage.setItem('transporter_ai_extraction_status', 'processing');
    startAiExtraction();
    navigate('/addprice');
  };

  // Stop an in-flight extraction without leaving the upload page — aborts every
  // pending request/stream read and puts the screen back to the upload state
  // (files kept, so the user can just hit "Yes, Read My Files Now" again).
  const cancelAiExtraction = () => {
    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = null;
    setOnboardingMode('ai_upload');
    setExtractionStatus('idle');
    setAiProgress(0);
    setExtractionLogs([]);
  };

  // --- Handlers ---
  const handleFormChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let { id, value } = e.target;

    // Dynamic constraints, space stripping, character length clamping
    if (id === 'companyName') {
      if (value.length > 40) {
        setErrors(prev => ({ ...prev, companyName: "Company name cannot exceed 40 characters" }));
        value = value.slice(0, 40);
      } else {
        setErrors(prev => ({ ...prev, companyName: undefined }));
      }
    }

    if (id === 'email') {
      value = value.replace(/\s+/g, '');
      if (value.length > 30) {
        setErrors(prev => ({ ...prev, email: "Email cannot exceed 30 characters" }));
        value = value.slice(0, 30);
      } else {
        setErrors(prev => ({ ...prev, email: undefined }));
      }
    }

    if (id === 'phone' || id === 'whatsapp') {
      value = value.replace(/\D/g, '');
      if (value.length > 10) {
        value = value.slice(0, 10);
      }
    }

    if (id === 'password') {
      if (value.length > 30) {
        setErrors(prev => ({ ...prev, password: "Password cannot exceed 30 characters" }));
        value = value.slice(0, 30);
      } else {
        setErrors(prev => ({ ...prev, password: undefined }));
      }
    }

    if (id === 'gstNo') {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
      // The customer is starting to type a GST number into a previously-empty
      // field — the clearest possible signal that this is a fresh company,
      // whether or not the page ever reloaded with ?new_session=1. Clear any
      // pricing/zone-rate leftovers from a prior session right here instead
      // of waiting until AI extraction starts, so even the Charges page's
      // very first paint (before any upload) can't show stale numbers.
      // Guarded to formData.gstNo === '' so it only fires once per fresh
      // entry — not on every keystroke while typing/editing a GST already
      // in progress, and not when a resumed draft restores an existing value.
      if (formData.gstNo === '' && value !== '') {
        localStorage.removeItem('transporter_price_rate');
        localStorage.removeItem('transporter_extracted_price_rate');
        localStorage.removeItem('transporter_zone_rates');
      }
    }

    if (id === 'pincode') {
      value = value.replace(/\D/g, '').slice(0, 6);
      setFormData(prev => {
        const updated = { ...prev, pincode: value };
        validateData(updated);
        return updated;
      });
      if (value.length === 6) {
        // 1. Instant local matching
        const localMatch = getIndianStateByPincode(value);
        if (localMatch) {
          setFormData(prev => {
            const updated = {
              ...prev,
              pincode: value,
              stateName: localMatch.state,
              address: prev.address ? prev.address : localMatch.city
            };
            validateData(updated);
            return updated;
          });
          setErrors(prev => ({ ...prev, pincode: undefined, stateName: undefined }));
        }

        // 2. Background API call (progressive enhancement)
        axios.get(`https://api.postalpincode.in/pincode/${value}`)
          .then(res => {
            if (res.data && res.data[0] && res.data[0].Status === 'Success') {
              const postOffice = res.data[0].PostOffice[0];
              const state = postOffice.State;
              const district = postOffice.District;
              setFormData(prev => {
                const updated = {
                  ...prev,
                  stateName: state,
                  address: prev.address && prev.address !== localMatch?.city ? prev.address : district
                };
                validateData(updated);
                return updated;
              });
              setErrors(prev => ({ ...prev, pincode: undefined, stateName: undefined }));
            } else {
              if (!localMatch) {
                setErrors(prev => ({ ...prev, pincode: 'Pincode not found' }));
              }
            }
          })
          .catch(() => { });
      }
      return;
    }

    if (id === 'address') {
      const words = value.trim().split(/\s+/).filter(Boolean).length;
      if (words > 120) {
        setErrors(prev => ({ ...prev, address: `Address cannot exceed 120 words (current: ${words} words)` }));
      } else {
        setErrors(prev => ({ ...prev, address: undefined }));
      }
    }

    if (id === 'numTrucks') {
      value = value.replace(/\D/g, '');
      if (Number(value) > 10000) {
        setErrors(prev => ({ ...prev, numTrucks: "Total Fleet Size cannot exceed 10000" }));
        value = '10000';
      } else {
        setErrors(prev => ({ ...prev, numTrucks: undefined }));
      }
    }

    setFormData(prev => {
      const updated = { ...prev, [id]: value };
      validateData(updated);
      return updated;
    });

    if (
      id !== 'address' &&
      id !== 'companyName' &&
      id !== 'email' &&
      id !== 'numTrucks' &&
      errors[id as keyof FormErrors]
    ) {
      setErrors(prev => ({ ...prev, [id]: undefined }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id } = e.target;
    setTouched(prev => ({ ...prev, [id]: true }));
    validateData(formData);
  };

  // Page 1 Enter-to-advance, matching the shipper signup form: Enter moves to
  // the next field instead of doing nothing (or, with multiple fields in one
  // <form>, occasionally triggering an early submit).
  const focusField = (id: string) => {
    document.getElementById(id)?.focus();
  };

  const handleEnterToNext = (nextId?: string) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (nextId) {
      focusField(nextId);
    } else {
      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
    }
  };

  // Backspace on an empty field steps back to the previous field, mirroring
  // the Enter-to-advance chain instead of leaving the user stuck.
  const handleBackspaceToPrev = (prevId?: string) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Backspace' && prevId && (e.currentTarget as HTMLInputElement).value === '') {
      // Without this, the same keystroke's default delete fires on whatever
      // gets focused next, eating a character there too.
      e.preventDefault();
      focusField(prevId);
    }
  };

  // --- Step 1 Validation ---
  const validateData = (data: IFormData) => {
    const newErrors: FormErrors = {};

    if (!data.companyName) {
      newErrors.companyName = "Company name is required";
    } else if (data.companyName.length > 40) {
      newErrors.companyName = "Company name cannot exceed 40 characters";
    }

    // Email validation
    const emailLower = data.email.toLowerCase();
    const hasSpace = /\s/.test(data.email);
    const validDomain = /\.(com|co|in|net|org|edu|gov|mil|us|info|biz)(\.[a-z]{2})?$/i.test(emailLower);

    if (!data.email) {
      newErrors.email = "Email is required";
    } else if (hasSpace) {
      newErrors.email = "Email cannot contain spaces";
    } else if (data.email.length > 30) {
      newErrors.email = "Email cannot exceed 30 characters";
    } else if (!emailLower.includes('@') || !validDomain) {
      newErrors.email = "Enter a valid email address with a valid domain suffix (.com, .co, .in, etc.)";
    }

    if (!data.password) {
      newErrors.password = "Password is required";
    } else if (data.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    } else if (data.password.length > 30) {
      newErrors.password = "Password cannot exceed 30 characters";
    }

    // Phone validation
    const phoneClean = data.phone.replace(/\D/g, '');
    const isAllZeros = /^0+$/.test(phoneClean);
    const startsWithValid = /^[6-9]/.test(phoneClean);

    if (!data.phone) {
      newErrors.phone = "Phone number is required";
    } else if (phoneClean.length !== 10) {
      newErrors.phone = "Contact phone must be exactly 10 digits";
    } else if (isAllZeros) {
      newErrors.phone = "Phone number cannot be all zeros";
    } else if (!startsWithValid) {
      newErrors.phone = "Phone must be a valid Indian mobile number starting with 6, 7, 8 or 9";
    }

    // GST validation
    const gstError = validateGST(data.gstNo);
    if (gstError) {
      newErrors.gstNo = gstError;
    }

    // Address validation (word count check)
    const addressWords = data.address.trim().split(/\s+/).filter(Boolean).length;
    if (!data.address) {
      newErrors.address = "Address is required";
    } else if (addressWords > 120) {
      newErrors.address = `Address cannot exceed 120 words (current: ${addressWords} words)`;
    }

    if (!data.stateName) newErrors.stateName = "State is required";
    if (!/^\d{6}$/.test(data.pincode)) newErrors.pincode = "Enter a valid 6-digit pincode";

    if (!data.firstName) newErrors.firstName = "First name is required";

    // WhatsApp validation
    const whatsappClean = data.whatsapp.replace(/\D/g, '');
    if (!data.whatsapp) {
      newErrors.whatsapp = "WhatsApp number is required";
    } else if (whatsappClean.length !== 10) {
      newErrors.whatsapp = "WhatsApp number must be exactly 10 digits";
    }

    // Trucks validation
    const trucksNum = Number(data.numTrucks);
    if (!data.numTrucks) {
      newErrors.numTrucks = "Number of trucks is required";
    } else if (trucksNum <= 0) {
      newErrors.numTrucks = "Enter valid number of trucks";
    } else if (trucksNum > 10000) {
      newErrors.numTrucks = "Total Fleet Size cannot exceed 10000";
    }

    if (!data.pincodesServedRange) newErrors.pincodesServedRange = "Select number of pincodes served";

    setErrors(newErrors);
    return newErrors;
  };

  const handleNextStep = (e: FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      toast.error('Please accept the Terms & Conditions to continue.');
      return;
    }
    const newErrors = validateData(formData);

    // companyName/address/stateName aren't collected on this page — they're
    // auto-filled by the GST/pincode lookups, with a missing-fields safety net
    // right before final submit. Don't block Page 1 on them.
    const { companyName, address, stateName, ...page1Errors } = newErrors;

    // Mark ALL fields as touched to display errors visually
    const allTouched: Record<string, boolean> = {};
    Object.keys(formData).forEach(k => {
      allTouched[k] = true;
    });
    setTouched(allTouched);

    if (Object.keys(page1Errors).length === 0) {
      setCurrentStep(1);
    } else {
      toast.error(Object.values(page1Errors)[0] || 'Please fill all required fields correctly to continue.');
    }
  };

  // --- File Handling ---
  const handleDrag = (e: DragEvent<HTMLDivElement>, enter: boolean) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(enter);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    handleDrag(e, false);
    const uploadedFile = e.dataTransfer?.files[0];
    if (uploadedFile?.name.endsWith('.xlsx')) setFile(uploadedFile);
    else toast.error('Invalid file type. Please upload a .xlsx file.');
  };

  const handleFileSelect = (f: File | null) => {
    if (f?.name.endsWith('.xlsx')) setFile(f);
    else if (f) toast.error('Invalid file type. Please upload a .xlsx file.');
  };

  // --- Final Submission ---
  // Gate: companyName/address/stateName are backend-required but never shown
  // on Page 1. GST + pincode autofill cover them in the common case, and AI
  // extraction on Page 2 gets a second chance — checked fresh every time
  // Submit is clicked, so there's nothing to bypass by navigating back and forth.
  const handleSubmit = async () => {
    const extractedService = localStorage.getItem('transporter_extracted_service');
    if (!file && !extractedService) return toast.error('Please select the service zone sheet.');

    const missing: MissingField[] = [];
    if (!formData.companyName.trim()) {
      missing.push({ id: 'companyName', label: 'Company Name', placeholder: 'Your registered company name', maxLength: 60 });
    }
    if (!formData.address.trim()) {
      missing.push({ id: 'address', label: 'Office Address', placeholder: 'Company office address', maxLength: 150 });
    }
    if (!formData.stateName.trim()) {
      missing.push({ id: 'stateName', label: 'State', placeholder: 'e.g. Maharashtra', maxLength: 40 });
    }

    if (missing.length > 0) {
      setMissingFieldsModal({
        open: true,
        fields: missing,
        values: {
          companyName: formData.companyName,
          address: formData.address,
          stateName: formData.stateName,
        },
      });
      return;
    }

    await submitTransporterData();
  };

  const handleMissingFieldsConfirm = async () => {
    const emptyField = missingFieldsModal.fields.find(f => !missingFieldsModal.values[f.id]?.trim());
    if (emptyField) {
      toast.error(`${emptyField.label} is required.`);
      return;
    }
    const overrides: { companyName?: string; address?: string; stateName?: string } = {};
    missingFieldsModal.fields.forEach(f => {
      overrides[f.id] = missingFieldsModal.values[f.id].trim();
    });
    setFormData(prev => ({ ...prev, ...overrides }));
    setMissingFieldsModal(prev => ({ ...prev, open: false }));
    await submitTransporterData(overrides);
  };

  const submitTransporterData = async (overrides?: { companyName?: string; address?: string; stateName?: string }) => {
    const extractedService = localStorage.getItem('transporter_extracted_service');
    setIsLoading(true);
    const toastId = toast.loading('Uploading data...');

    const dataToSubmit = new FormData();
    // FIX: Cleanly handle key renaming and avoid duplicate data
    const { stateName, ...restOfData } = formData;
    const { stateName: stateNameOverride, ...otherOverrides } = overrides || {};
    const finalData = { ...restOfData, ...otherOverrides, state: stateNameOverride || stateName };

    Object.entries(finalData).forEach(([key, value]) => {
      dataToSubmit.append(key, String(value));
    });

    dataToSubmit.append('zones', JSON.stringify(zones.filter(z => z.trim()))); // Send non-empty zones

    if (file) {
      dataToSubmit.append('sheet', file);
    } else if (extractedService) {
      dataToSubmit.append('service', extractedService);
    }

    try {
      const token = Cookies.get('authToken');
      await axios.post(`${API_BASE_URL}/api/transporter/auth/addtransporter`, dataToSubmit, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast.success('Transporter added successfully!', { id: toastId });
      sessionStorage.setItem("companyName", finalData.companyName);
      sessionStorage.setItem("zones", JSON.stringify(zones));
      sessionStorage.setItem("transporter_signup_email", formData.email);

      // Clear draft localStorage items upon success
      localStorage.removeItem('transporter_onboarding_form_data');
      localStorage.removeItem('transporter_onboarding_current_step');

      navigate('/addprice');
    } catch (e: any) {
      const message = e.response?.data?.message || e.message || "An unknown error occurred.";
      toast.error(message, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTemplate = () => {
    toast.success("Template download started!");
    const link = document.createElement('a');
    // FIX: This now points to a file in the `public` directory.
    // Ensure `transporter_zone_template.xlsx` exists in your project's `/public` folder.
    link.href = '/transporter_zone_template.xlsx';
    link.setAttribute('download', 'transporter_zone_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderTerminal = (status: 'processing' | 'success' | 'failed') => {
    if (!isUttamGoyal) {
      if (status === 'processing') {
        // Deliberately compact and unobtrusive — this used to be a big
        // full-width animated card. Extraction now finishes by auto-
        // continuing straight to Price Configuration (no extra click), so
        // this only needs to reassure the user something is happening, not
        // hold their attention for the full ~2 minutes.
        return (
          <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-800">
                Reading your documents in the background… <span className="tabular-nums">{Math.round(aiProgress)}%</span>
              </p>
              <p className="text-xs text-blue-600">
                You'll be taken to Price Configuration automatically once it's done.
              </p>
            </div>
          </div>
        );
      }
      if (status === 'failed') {
        return (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-600 mt-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800">Extraction Failed</p>
                <p className="text-red-700 mt-1">
                  Something went wrong while reading your files. Please try again — if the problem continues, try uploading a clearer copy.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOnboardingMode('ai_upload');
                  setExtractionStatus('idle');
                  setAiProgress(0);
                  setExtractionLogs([]);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Back to Upload
              </button>
            </div>
          </div>
        );
      }
      if (status === 'success') {
        return null;
      }
    }

    let headerBg = 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)';
    let headerBorder = '#1e293b';
    let statusLabel = 'Processing';
    let statusBadgeClass = 'bg-blue-500/10 border-blue-500/30 text-blue-300';
    let statusDotClass = 'bg-blue-400 animate-pulse';
    let icon = <Loader2 className="animate-spin text-blue-400" size={20} />;
    let subtext = 'Analysing sheets & profiles using document intelligence…';
    let progressBg = 'linear-gradient(90deg, #3b82f6, #60a5fa)';
    let progressShadow = 'rgba(96,165,250,0.6)';

    if (status === 'success') {
      headerBg = 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)';
      headerBorder = '#065f46';
      statusLabel = 'Completed';
      statusBadgeClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
      statusDotClass = 'bg-emerald-400';
      icon = <CheckCircle className="text-emerald-400" size={20} />;
      subtext = 'Extraction completed successfully. All data parsed.';
      progressBg = 'linear-gradient(90deg, #10b981, #34d399)';
      progressShadow = 'rgba(52,211,153,0.6)';
    } else if (status === 'failed') {
      headerBg = 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)';
      headerBorder = '#991b1b';
      statusLabel = 'Failed';
      statusBadgeClass = 'bg-red-500/10 border-red-500/30 text-red-300';
      statusDotClass = 'bg-red-400';
      icon = <AlertTriangle className="text-red-400" size={20} />;
      subtext = 'Extraction failed. Check error logs below.';
      progressBg = 'linear-gradient(90deg, #ef4444, #f87171)';
      progressShadow = 'rgba(248,113,113,0.6)';
    }

    return (
      <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-700 mt-6" style={{ background: '#0f1117' }}>
        {/* ── Header ── */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: headerBg, borderBottom: `1px solid ${headerBorder}` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-500/10 flex items-center justify-center ring-1 ring-slate-500/20">
              {icon}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">AI Document Ingestion Pipeline</h2>
              <p className="text-2xs sm:text-xs text-slate-300/70 mt-0.5">{subtext}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 border rounded-full px-3 py-1 ${statusBadgeClass}`}>
            <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
            <span className="text-xs font-semibold font-mono">{statusLabel}</span>
          </div>
        </div>

        {/* ── Progress ── */}
        <div className="px-6 py-3.5" style={{ borderBottom: '1px solid #1e293b' }}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-2xs font-mono font-semibold text-slate-400 uppercase tracking-widest">Extraction Engine</span>
            <span className="text-xs font-mono font-bold text-blue-400">{status === 'success' ? 100 : aiProgress}%</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${status === 'success' ? 100 : aiProgress}%`,
                background: progressBg,
                boxShadow: `0 0 12px ${progressShadow}`,
              }}
            />
          </div>
        </div>

        {/* ── Terminal ── */}
        <div className="px-6 pt-3.5 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
              </div>
              <span className="text-2xs font-mono text-slate-500 ml-1">live extraction terminal</span>
            </div>
            {status !== 'processing' && (
              <button
                type="button"
                onClick={() => {
                  setOnboardingMode('ai_upload');
                  setExtractionStatus('idle');
                  setAiProgress(0);
                  setExtractionLogs([]);
                }}
                className="text-2xs font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                <ArrowLeft size={10} /> Back to Upload
              </button>
            )}
          </div>
          <div
            id="ai-console"
            className="h-48 overflow-y-auto rounded-xl p-4 font-mono text-2xs scroll-smooth"
            style={{ background: '#060910', border: '1px solid #1e293b' }}
          >
            {extractionLogs.length === 0 ? (
              <div className="text-slate-600 italic">Waiting for parser connection…</div>
            ) : (
              extractionLogs.map((line, idx) => (
                <div
                  key={idx}
                  className="leading-relaxed py-0.5"
                  style={{
                    color: line.startsWith('[ERROR]') ? '#f87171'
                      : line.startsWith('[DONE]') ? '#34d399'
                        : line.startsWith('[OK]') ? '#4ade80'
                          : line.startsWith('[START]') ? '#60a5fa'
                            : line.startsWith('[AI]') ? '#a78bfa'
                              : '#86efac',
                    borderLeft: `2px solid ${line.startsWith('[ERROR]') ? '#f87171' : line.startsWith('[DONE]') || line.startsWith('[OK]') ? '#4ade80' : '#1e3a5f'}`,
                    paddingLeft: '10px',
                  }}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Warning / Footer ── */}
        {status === 'processing' ? (
          <div className="mx-6 mb-4 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-2xs font-medium" style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', color: '#fbbf24' }}>
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>Do not close this window or refresh while the OCR pipeline is running.</span>
          </div>
        ) : status === 'success' ? (
          <div className="mx-6 mb-4 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-2xs font-medium" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}>
            <CheckCircle size={13} className="flex-shrink-0" />
            <span>Successfully extracted details. Review summary above to continue.</span>
          </div>
        ) : (
          <div className="mx-6 mb-4 mt-2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-2xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
            <div className="flex items-center gap-3">
              <AlertTriangle size={13} className="flex-shrink-0" />
              <span>OCR pipeline failed. You can adjust files and retry extraction.</span>
            </div>
            <button type="button" onClick={() => setOnboardingMode('ai_upload')} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 font-bold transition-colors">
              Back to Upload
            </button>
          </div>
        )}
      </div>
    );
  };

  const steps = ['Transporter Details', 'Upload Sheet'];

  // Shared 3-stage progress indicator (Create Account -> Choose Route -> Upload/Submit),
  // sized up for visibility and reused across every screen in the linear part of the
  // flow (Page 1, route selection, and the manual upload step) so progress stays visible
  // instead of only appearing on the very first screen.
  const renderStepper = (activeIdx: number) => (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <div className="h-0.5 w-5 sm:w-6 bg-slate-200 rounded-full" />}
          <span
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-sm sm:text-base font-bold flex items-center justify-center flex-shrink-0 transition-colors
              ${idx === activeIdx ? 'bg-amber-500 text-white' : idx < activeIdx ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}
          >
            {idx + 1}
          </span>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/70 py-2 sm:py-3">
      <div className="mx-auto px-2 sm:px-4 md:px-6 w-full max-w-[96%] space-y-2">
        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl sm:text-2xl font-extrabold text-center text-slate-900 tracking-tight"></h1>
          <p className="mt-0.5 text-center text-xs sm:text-sm text-slate-600"></p>
        </motion.div>

        <AnimatePresence mode="wait">
          {currentStep === 0 ? (
            <motion.div
              key="page1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-6xl mx-auto"
            >
              <div className="grid grid-cols-1 lg:grid-cols-5 bg-white shadow-2xl rounded-2xl overflow-hidden">
                {/* Branding panel */}
                <div className="hidden lg:flex lg:col-span-2 flex-col justify-center p-8 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                  <h1 className="text-4xl font-extrabold tracking-tight">Partner With FreightCompare</h1>
                  <p className="mt-4 text-amber-100">
                    Join our verified transporter network, get matched with shippers, and bid on freight that fits your fleet.
                  </p>
                  <div className="mt-8 flex space-x-2">
                    <span className="w-3 h-3 rounded-full bg-amber-300"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-200"></span>
                    <span className="w-3 h-3 rounded-full bg-amber-100"></span>
                  </div>
                </div>

                <div className="col-span-1 lg:col-span-3 p-5 sm:p-6 flex flex-col">
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xl font-bold text-slate-800 flex-shrink-0">Create Your Transporter Account</h2>

                      {/* Stepper sits inline between the heading and Log In on screens with room for it */}
                      <div className="hidden sm:flex items-center">
                        {renderStepper(0)}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (window !== window.parent) {
                            window.parent.postMessage({ type: 'navigate_to_signin' }, '*');
                          } else {
                            navigate('/transporter-signin');
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex-shrink-0"
                      >
                        <ArrowLeft size={13} /> Log In
                      </button>
                    </div>

                    {/* Same stepper, dropped to its own centered row when there isn't room above */}
                    <div className="flex sm:hidden items-center justify-center mt-2">
                      {renderStepper(0)}
                    </div>
                  </div>

                  <form className="space-y-3" onSubmit={handleNextStep} noValidate>
                    {/* Row 1: GST + Office Pincode */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      <div className="w-full">
                        <label htmlFor="gstNo" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          GST Number<span className="text-red-500 ml-1">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none flex items-center justify-center">
                            <Hash size={16} />
                          </span>
                          <input
                            id="gstNo"
                            value={formData.gstNo}
                            onChange={handleFormChange}
                            onFocus={() => setGstFocused(true)}
                            onBlur={(e) => { setGstFocused(false); handleBlur(e); }}
                            onKeyDown={handleEnterToNext('pincode')}
                            required
                            placeholder="GST Number"
                            className={`w-full pl-11 pr-9 py-2.5 border rounded-md shadow-sm transition-all duration-300
                            bg-slate-50 text-slate-900 placeholder:text-slate-400
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:border-amber-500
                            ${(touched.gstNo && errors.gstNo) ? 'border-red-500 ring-red-500/50' : 'border-slate-300'}`}
                            aria-invalid={!!(touched.gstNo && errors.gstNo)}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            {gstLookup.status === 'loading' && <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />}
                            {gstLookup.status === 'success' && !gstLookup.showConflictPanel && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            {gstLookup.status === 'failed' && <AlertTriangle className="w-4 h-4 text-orange-400" />}
                            {gstLookup.status === 'invalid' && <XCircle className="w-4 h-4 text-red-400" />}
                          </span>
                        </div>
                        {touched.gstNo && errors.gstNo && (
                          <p className="mt-1.5 text-xs text-red-600">{errors.gstNo}</p>
                        )}
                        {gstLookup.status === 'invalid' && (
                          <p className="mt-1 text-[10px] text-red-500">Invalid GSTIN format</p>
                        )}
                        {gstLookup.status === 'loading' && (
                          <p className="mt-1 text-[10px] text-amber-600">Looking up…</p>
                        )}
                        {gstLookup.successMessage && (
                          <p className="mt-1 text-[10px] text-green-600">{gstLookup.successMessage}</p>
                        )}
                        {gstLookup.errorMessage && (
                          <p className="mt-1 text-[10px] text-orange-500">{gstLookup.errorMessage}</p>
                        )}
                        {gstLookup.showConflictPanel && gstLookup.conflicts.length > 0 && (
                          <GSTConflictPanel
                            conflicts={gstLookup.conflicts}
                            onApply={handleConflictApply}
                            onKeep={gstLookup.dismissConflictPanel}
                          />
                        )}
                      </div>

                      <InputField id="pincode" label="Office Pincode" icon={<MapPin size={16} />} type="text" maxLength={6} placeholder="Enter 6-digit pincode" value={formData.pincode} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={handleEnterToNext('firstName')} error={touched.pincode ? errors.pincode : undefined} required />
                    </div>

                    {/* Row 2: First Name + Last Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      <InputField id="firstName" label="First Name" icon={<Building size={16} />} value={formData.firstName} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={handleEnterToNext('lastName')} error={touched.firstName ? errors.firstName : undefined} required />
                      <InputField id="lastName" label="Last Name (optional)" icon={<Building size={16} />} value={formData.lastName} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={handleEnterToNext('phone')} error={touched.lastName ? errors.lastName : undefined} />
                    </div>

                    {/* Row 3: Mobile + WhatsApp */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      <InputField id="phone" label="Mobile Number" icon={<Phone size={16} />} type="tel" maxLength={10} placeholder="10-digit mobile number" value={formData.phone} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={(e) => { handleEnterToNext('whatsapp')(e); handleBackspaceToPrev('lastName')(e); }} error={touched.phone ? errors.phone : undefined} required />
                      <InputField
                        id="whatsapp"
                        label="WhatsApp Number"
                        icon={<Phone size={16} />}
                        type="tel"
                        maxLength={10}
                        placeholder="Same as mobile number"
                        value={formData.whatsapp}
                        onChange={(e) => {
                          // Typing here directly stops auto-mirroring Mobile from this point on.
                          if (sameAsPhone) setSameAsPhone(false);
                          handleFormChange(e);
                        }}
                        onBlur={handleBlur}
                        onKeyDown={(e) => { handleEnterToNext('email')(e); handleBackspaceToPrev('phone')(e); }}
                        error={touched.whatsapp ? errors.whatsapp : undefined}
                        required
                      />
                    </div>

                    {/* Row 4: Email Address */}
                    <InputField id="email" label="Email Address" icon={<Mail size={16} />} type="email" value={formData.email} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={(e) => { handleEnterToNext('pincodesServedRange')(e); handleBackspaceToPrev('whatsapp')(e); }} error={touched.email ? errors.email : undefined} required />

                    {/* Row 5: Pincodes Served + Fleet Size */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      <SelectField id="pincodesServedRange" label="Number of Pincodes Served" icon={<MapPin size={16} />} value={formData.pincodesServedRange} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={handleEnterToNext('numTrucks')} error={touched.pincodesServedRange ? errors.pincodesServedRange : undefined} required>
                        <option value="">Select Range</option>
                        <option value="500-1000">500 - 1,000</option>
                        <option value="1000-5000">1,000 - 5,000</option>
                        <option value="5000-10000">5,000 - 10,000</option>
                        <option value="10000-20000">10,000 - 20,000</option>
                        <option value="20000+">20,000+</option>
                      </SelectField>
                      {/* type="text" + inputMode="numeric" instead of type="number" — number
                        inputs let the up/down arrow keys (and scroll-wheel-while-focused)
                        silently increment/decrement the value, which a fleet-size field
                        has no business supporting. Digits-only filtering already happens
                        in handleFormChange. */}
                      <InputField id="numTrucks" label="Total Fleet Size" icon={<Truck size={16} />} type="text" inputMode="numeric" value={formData.numTrucks} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={(e) => { handleEnterToNext('password')(e); }} error={touched.numTrucks ? errors.numTrucks : undefined} required />
                    </div>

                    {/* Row 6: Password */}
                    <InputField id="password" label="Set Password" icon={<KeyRound size={16} />} type="password" maxLength={30} value={formData.password} onChange={handleFormChange} onBlur={handleBlur} onKeyDown={handleEnterToNext()} error={touched.password ? errors.password : undefined} required />

                    {/* T&C */}
                    <div className="flex items-start gap-2 py-1">
                      <input
                        type="checkbox"
                        id="termsAccepted"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                      />
                      <label htmlFor="termsAccepted" className="text-xs text-slate-500 cursor-pointer leading-snug py-1">
                        I agree to the{' '}
                        <button type="button" onClick={() => setTermsModalOpen(true)} className="text-amber-600 hover:underline font-medium">
                          Terms &amp; Conditions
                        </button>
                      </label>
                    </div>
                    {!termsAccepted && (
                      <p className="-mt-2 text-xs text-red-500">You must accept the Terms &amp; Conditions to continue.</p>
                    )}

                    <div className="pt-2">
                      <button type="submit" disabled={!termsAccepted} className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-amber-500 text-white font-semibold rounded-lg shadow-md hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500">
                        Continue <ArrowRight size={18} />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : onboardingMode === 'selection' ? (
            <motion.div
              key="selection"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto"
            >
              <Card className="p-5 sm:p-6 text-center space-y-4 bg-gradient-to-br from-white to-slate-50/50">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-1 gap-2">
                  {/* Returns to the Page 1 form (setCurrentStep(0)), not a real navigation —
                      formData lives in this same component's state, so nothing entered on
                      Page 1 is lost by going back to it from here. */}
                  <button
                    type="button"
                    onClick={() => setCurrentStep(0)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex-shrink-0"
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                  <div className="hidden sm:flex items-center">
                    {renderStepper(1)}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold text-slate-400">Onboarding Portal</span>
                    <Truck className="text-blue-600" size={18} />
                  </div>
                </div>
                <div className="flex sm:hidden items-center justify-center mb-2">
                  {renderStepper(1)}
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
                    <Sparkles className="text-blue-500 animate-pulse" size={20} />
                    Select Your Onboarding Route
                  </h2>
                  <p className="text-slate-500 text-xs sm:text-sm max-w-lg mx-auto font-medium">
                    Choose how you want to provide your transporter profile, contact, and pricing matrices.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Route A: AI Ingestion */}
                  <button
                    type="button"
                    onClick={() => setOnboardingMode('ai_upload')}
                    className="group relative flex flex-col text-left p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all duration-300 active:scale-98"
                  >
                    <div className="absolute top-4 right-4 p-1 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                      <Sparkles size={14} />
                    </div>
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl w-fit mb-3 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <UploadCloud size={20} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">
                      ✨ AI Document Extraction
                    </h3>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Drop your servicability (ODA if any), zone prices, company info, and charges here. Let our AI build your account automatically!
                    </p>
                    <span className="mt-4 text-xs font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Start AI Upload <ArrowRight size={12} />
                    </span>
                  </button>

                  {/* Route B: Manual Onboarding */}
                  <button
                    type="button"
                    onClick={resetToManual}
                    className="group relative flex flex-col text-left p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-500 transition-all duration-300 active:scale-98"
                  >
                    <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl w-fit mb-3 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <Building size={20} />
                    </div>
                    <h3 className="text-base font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">
                      ✍️ Step-by-Step Manual Form
                    </h3>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Key in your details in our clean forms.
                    </p>
                    <span className="mt-4 text-xs font-bold text-slate-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Fill Manually <ArrowRight size={12} />
                    </span>
                  </button>
                </div>
              </Card>
            </motion.div>
          ) : (onboardingMode === 'ai_upload' || onboardingMode === 'ai_processing') ? (
            <motion.div
              key="ai_upload"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-6xl mx-auto"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* LEFT COLUMN: Upload flow — stays put; progress slider appears below it */}
                <div className="lg:col-span-7 space-y-4">
                  <Card className="p-4 sm:p-5 space-y-3 bg-white shadow-sm border border-slate-200/80">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                          <Sparkles size={20} />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-slate-800">Upload Your Documents</h2>
                          <p className="text-xs text-slate-500 mt-0.5">We'll read your files and fill in your details for you — no typing needed.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOnboardingMode('selection')}
                        disabled={onboardingMode === 'ai_processing'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowLeft size={14} /> Go Back
                      </button>
                    </div>

                    {/* Drag and Drop Zone */}
                    <div
                      onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setIsAiDragging(true); }}
                      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setIsAiDragging(false); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setIsAiDragging(true); }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation(); setIsAiDragging(false);
                        if (e.dataTransfer?.files) handleAiFilesAdd(e.dataTransfer.files);
                      }}
                      className={`p-3 border-2 border-dashed rounded-xl text-center transition-all duration-300 ${(aiFiles.length >= MAX_AI_FILES || onboardingMode === 'ai_processing') ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} ${isAiDragging
                        ? 'border-blue-500 bg-blue-50/50 scale-102 shadow-inner'
                        : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'
                        }`}
                    >
                      <input
                        type="file"
                        multiple
                        onChange={e => { if (e.target.files) handleAiFilesAdd(e.target.files); }}
                        className="hidden"
                        id="ai-file-picker"
                        disabled={aiFiles.length >= MAX_AI_FILES || onboardingMode === 'ai_processing'}
                        accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.docx,.doc,.pptx,.ppt,.json,.tiff,.bmp,.webp"
                      />
                      <label htmlFor="ai-file-picker" className="flex items-center justify-center gap-3 cursor-pointer">
                        <UploadCloud className={`w-6 h-6 shrink-0 transition-colors ${isAiDragging ? 'text-blue-600' : 'text-slate-400'}`} strokeWidth={1.5} />
                        <span className="text-left">
                          <p className="font-semibold text-sm text-slate-700 leading-tight">Drop your files here, or click to pick them from your computer</p>
                          <p className="text-2xs text-slate-400 leading-tight">Up to {MAX_AI_FILES} files &middot; PDF, Excel, Word, Photo, or JSON &middot; 10 MB max per file</p>
                        </span>
                      </label>
                    </div>

                    {/* Uploaded Files List */}
                    {aiFiles.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Your Files ({aiFiles.length} of {MAX_AI_FILES})</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {aiFiles.map((gf) => (
                            <div key={gf.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-sm">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <FileSpreadsheet className="text-blue-600 flex-shrink-0" size={18} />
                                <span className="font-medium text-slate-700 truncate" title={gf.file.name}>{gf.file.name}</span>
                                <span className="text-2xs text-slate-400">({(gf.file.size / 1024 / 1024).toFixed(2)} MB)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={gf.category}
                                  disabled={onboardingMode === 'ai_processing'}
                                  onChange={e => {
                                    const cat = e.target.value as any;
                                    setAiFiles(prev => prev.map(f => f.id === gf.id ? { ...f, category: cat } : f));
                                  }}
                                  className="text-xs bg-white border border-slate-200/80 text-slate-700 font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="company_details">This is my Company Info</option>
                                  <option value="charges">This is my Pricing</option>
                                  <option value="zone_data">This is my Delivery Areas</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={onboardingMode === 'ai_processing'}
                                  onClick={() => setAiFiles(prev => prev.filter(f => f.id !== gf.id))}
                                  className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          if (onboardingMode === 'ai_processing') {
                            cancelAiExtraction();
                          } else {
                            setAiFiles([]);
                            setOnboardingMode('selection');
                          }
                        }}
                        className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={startAiExtractionAndContinue}
                        disabled={aiFiles.length === 0}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 transition-all text-sm"
                      >
                        <Sparkles size={16} />
                        Yes, Read My Files Now
                      </button>
                    </div>
                  </Card>

                  {/* Progress slider appears below the upload card, same page, no replacement */}
                  <AnimatePresence>
                    {onboardingMode === 'ai_processing' && (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        {renderTerminal(extractionStatus === 'idle' ? 'processing' : extractionStatus)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* RIGHT COLUMN: Need the Template? */}
                <div className="lg:col-span-5">
                  <Card className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Download className="text-green-600" size={20} />
                          Don't Have a File Ready?
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                          Download this ready-made Excel sheet, fill in your prices and delivery areas, then upload it above.
                        </p>
                      </div>
                      <button
                        onClick={downloadTemplate}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <Download size={18} /> Download Template
                      </button>
                    </div>
                    <div className="mt-4 border-t border-slate-200/80 pt-4">
                      <h4 className="font-semibold text-slate-700 text-sm mb-2">Template Guidelines</h4>
                      <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                        <img src={guidlines} alt="Excel template guidelines" className="w-full max-h-56 object-cover object-top" />
                      </div>
                    </div>
                  </Card>
                </div>

              </div>
            </motion.div>

          ) : onboardingMode === 'ai_summary' ? (
            // ── AI Extraction Summary / Preview Screen ──────────────────────
            <motion.div
              key="ai_summary"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-4xl mx-auto space-y-4"
            >
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-4 md:p-5 space-y-4">

                {/* Header */}
                <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center ring-2 ring-emerald-100 flex-shrink-0">
                    <CheckCircle className="text-emerald-500" size={26} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">AI Extraction Complete</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Here's what was found in your documents. Review before continuing.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  {/* Company Profile */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Building size={13} /> Company Profile
                    </h3>
                    {aiSummaryData && Object.keys(aiSummaryData.company).length > 0 ? (
                      <div className="space-y-1.5">
                        {Object.entries(aiSummaryData.company).map(([k, v]) => {
                          const fromFile = aiSummaryData.companySource[k] === 'file';
                          return (
                            <div key={k} className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="text-slate-400 font-medium flex-shrink-0">{k}</span>
                              <span className="text-right truncate">
                                <span className="text-slate-800 font-semibold">{v}</span>
                                <span
                                  className={`ml-1.5 text-2xs font-bold uppercase tracking-wide ${fromFile ? 'text-emerald-600' : 'text-amber-500'}`}
                                  title={fromFile ? 'Found in the file(s) you just uploaded' : 'Not found in this upload — carried over from earlier'}
                                >
                                  {fromFile ? '(from file)' : '(carried over)'}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 italic">No company details extracted from documents.</p>
                    )}
                  </div>

                  {/* Pricing Schedule */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <FileText size={13} /> Pricing Schedule
                    </h3>
                    {aiSummaryData?.hasPricingData ? (
                      <div className="space-y-1.5">
                        {Object.entries(aiSummaryData.pricing).map(([k, v]) => (
                          <div key={k} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="text-slate-400 font-medium flex-shrink-0">{k}</span>
                            <span className="text-slate-800 font-semibold font-mono">{v}</span>
                          </div>
                        ))}
                        <p className="text-xs text-emerald-600 font-semibold mt-2 pt-2 border-t border-emerald-100">
                          ✓ Charges will be pre-filled in the Price Configuration step
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm text-slate-400 italic">No pricing schedule detected.</p>
                        <p className="text-xs text-slate-400">You'll enter charges manually in the Price Configuration step.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Zone data notice */}
                {aiSummaryData?.hasZoneData && (
                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <Info size={17} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-800">
                      <span className="font-bold">{aiSummaryData.zoneCount} service zone{aiSummaryData.zoneCount !== 1 ? 's' : ''}</span>
                      {aiSummaryData.totalPincodes > 0 && (
                        <> covering <span className="font-bold">{aiSummaryData.totalPincodes.toLocaleString()} pincodes</span></>
                      )} extracted from your documents and staged for import.
                    </p>
                  </div>
                )}

                {/* No data at all warning */}
                {aiSummaryData && !aiSummaryData.hasPricingData && Object.keys(aiSummaryData.company).length === 0 && (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      Limited data was extracted from the uploaded files. You may want to re-upload clearer documents, or proceed to fill details manually.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-4">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => { setOnboardingMode('ai_upload'); setAiProgress(0); setExtractionLogs([]); }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowLeft size={14} /> Re-upload Files
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    // The AI already extracted profile + zones on Page 1 — the
                    // "Form Information Completed" / "Step 2 Upload" review page
                    // was just re-showing the same data with an extra click and a
                    // Back button that dropped users all the way back to route
                    // selection. Submit straight through to Price Configuration
                    // instead; handleSubmit() still opens the missing-fields modal
                    // if something required is genuinely absent.
                    onClick={handleSubmit}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all text-sm"
                  >
                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <>Continue to Price Configuration <ArrowRight size={14} /></>}
                  </button>
                </div>

              </div>
            </motion.div>

          ) : (
            <motion.div
              key="manual"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Two Column Layout Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* LEFT COLUMN: 60% Width */}
                <div className="lg:col-span-7 space-y-6">
                  <Card className="p-6">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: currentStep === 0 ? -30 : 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: currentStep === 0 ? 30 : -30 }}
                        transition={{ duration: 0.25 }}
                      >
                        {currentStep === 0 ? (
                          <form className="space-y-6" onSubmit={handleNextStep} noValidate>
                            <div className="space-y-6">

                              {/* Section 1: Company Profile */}
                              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 tracking-wide uppercase">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-2xs font-extrabold">1</span>
                                    Company Profile
                                  </h3>
                                  <button
                                    type="button"
                                    onClick={() => setOnboardingMode('selection')}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                                  >
                                    <ArrowLeft size={12} /> Route Selector
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                                  {/* GST No. — first, drives autofill */}
                                  <div className="w-full">
                                    <label htmlFor="gstNo" className="block text-sm font-medium text-slate-700 mb-1">
                                      GST No.<span className="text-red-500 ml-1">*</span>
                                    </label>
                                    <div className="relative">
                                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none flex items-center justify-center">
                                        <Hash size={16} />
                                      </span>
                                      <input
                                        id="gstNo"
                                        value={formData.gstNo}
                                        onChange={handleFormChange}
                                        onFocus={() => setGstFocused(true)}
                                        onBlur={(e) => { setGstFocused(false); handleBlur(e); }}
                                        required
                                        className={`w-full pl-11 pr-9 py-2.5 border rounded-lg shadow-sm transition-all duration-300
                                          bg-slate-50 text-slate-900 placeholder:text-slate-400
                                          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 focus:border-amber-500
                                          ${(touched.gstNo && errors.gstNo) ? 'border-red-500 ring-red-500/50' : 'border-slate-300/70'}`}
                                        aria-invalid={!!(touched.gstNo && errors.gstNo)}
                                      />
                                      {/* Status icon */}
                                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                        {gstLookup.status === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                        {gstLookup.status === 'success' && !gstLookup.showConflictPanel && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        {gstLookup.status === 'failed' && <AlertTriangle className="w-4 h-4 text-orange-400" />}
                                        {gstLookup.status === 'invalid' && <XCircle className="w-4 h-4 text-red-400" />}
                                      </span>
                                    </div>

                                    {/* Validation error */}
                                    {touched.gstNo && errors.gstNo && (
                                      <p className="mt-1.5 text-xs text-red-600">{errors.gstNo}</p>
                                    )}

                                    {/* Helper text on focus when empty */}
                                    {gstFocused && !formData.gstNo && (
                                      <p className="mt-1 text-[10px] text-slate-400">
                                        Enter your GSTIN to auto-fill company details
                                      </p>
                                    )}

                                    {/* GST lookup messages */}
                                    {gstLookup.status === 'invalid' && (
                                      <p className="mt-1 text-[10px] text-red-500">Invalid GSTIN format</p>
                                    )}
                                    {gstLookup.status === 'loading' && (
                                      <p className="mt-1 text-[10px] text-blue-500">Looking up…</p>
                                    )}
                                    {gstLookup.successMessage && (
                                      <p className="mt-1 text-[10px] text-green-600">{gstLookup.successMessage}</p>
                                    )}
                                    {gstLookup.errorMessage && (
                                      <p className="mt-1 text-[10px] text-orange-500">{gstLookup.errorMessage}</p>
                                    )}

                                    {/* Conflict panel */}
                                    {gstLookup.showConflictPanel && gstLookup.conflicts.length > 0 && (
                                      <GSTConflictPanel
                                        conflicts={gstLookup.conflicts}
                                        onApply={handleConflictApply}
                                        onKeep={gstLookup.dismissConflictPanel}
                                      />
                                    )}

                                    {/* Static hint — always visible below the field */}
                                    {gstLookup.status === 'idle' && !gstLookup.successMessage && !gstLookup.errorMessage && (
                                      <p className="mt-1 text-[10px] text-slate-400 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-blue-400 shrink-0" />
                                        Autofill details from GST
                                      </p>
                                    )}
                                  </div>
                                  <InputField id="companyName" label="Company Name" icon={<Building size={16} />} value={formData.companyName} onChange={handleFormChange} onBlur={handleBlur} error={touched.companyName ? errors.companyName : undefined} required />
                                  <InputField id="websiteLink" label="Website Link" icon={<Link size={16} />} value={formData.websiteLink} onChange={handleFormChange} onBlur={handleBlur} error={touched.websiteLink ? errors.websiteLink : undefined} />
                                </div>
                              </div>

                              {/* Section 2: Portal Access & Account Security */}
                              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-4">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 tracking-wide uppercase">
                                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-2xs font-extrabold">2</span>
                                  Portal Access & Account Security
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                                  <InputField id="email" label="Contact Email" icon={<Mail size={16} />} type="email" value={formData.email} onChange={handleFormChange} onBlur={handleBlur} error={touched.email ? errors.email : undefined} required />
                                  <InputField id="phone" label="Contact Phone" icon={<Phone size={16} />} type="tel" value={formData.phone} onChange={handleFormChange} onBlur={handleBlur} error={touched.phone ? errors.phone : undefined} required />
                                  <InputField id="password" label="Set Password" icon={<KeyRound size={16} />} type="password" maxLength={30} value={formData.password} onChange={handleFormChange} onBlur={handleBlur} error={touched.password ? errors.password : undefined} required />
                                </div>
                              </div>

                              {/* Section 3: Office Location & Timings */}
                              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-4">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 tracking-wide uppercase">
                                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-2xs font-extrabold">3</span>
                                  Office Location & Timings
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                                  {/* Row 1: Pincode, State, and Compact Office Hours Range */}
                                  <InputField id="pincode" label="Pincode" icon={<MapPin size={16} />} type="text" maxLength={6} value={formData.pincode} onChange={handleFormChange} onBlur={handleBlur} error={touched.pincode ? errors.pincode : undefined} required />
                                  <InputField id="stateName" label="State" icon={<Map size={16} />} value={formData.stateName} onChange={handleFormChange} onBlur={handleBlur} error={touched.stateName ? errors.stateName : undefined} required />

                                  <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-slate-600">Office Timings <span className="text-red-500">*</span></label>
                                    <div className="flex items-center gap-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                                      <input
                                        id="officeStart"
                                        type="time"
                                        value={formData.officeStart}
                                        onChange={handleFormChange}
                                        onBlur={handleBlur}
                                        className="w-full bg-transparent border-0 p-0 text-slate-800 focus:ring-0 text-sm focus:outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:hidden"
                                        required
                                      />
                                      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider px-1 shrink-0">to</span>
                                      <input
                                        id="officeEnd"
                                        type="time"
                                        value={formData.officeEnd}
                                        onChange={handleFormChange}
                                        onBlur={handleBlur}
                                        className="w-full bg-transparent border-0 p-0 text-slate-800 focus:ring-0 text-sm focus:outline-none cursor-pointer"
                                        required
                                      />
                                    </div>
                                    {((touched.officeStart && errors.officeStart) || (touched.officeEnd && errors.officeEnd)) && (
                                      <p className="text-2xs text-red-500 font-medium">Please enter valid timings</p>
                                    )}
                                  </div>

                                  {/* Row 2: Full address spanning the entire lower line */}
                                  <div className="sm:col-span-3">
                                    <InputField id="address" label="Full Office Address" icon={<Map size={16} />} value={formData.address} onChange={handleFormChange} onBlur={handleBlur} error={touched.address ? errors.address : undefined} required />
                                  </div>
                                </div>
                              </div>

                              {/* Section 4: Logistics & Fleet Capabilities */}
                              <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-4">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 tracking-wide uppercase">
                                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-2xs font-extrabold">4</span>
                                  Logistics & Fleet Capabilities
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                                  <SelectField id="deliveryMode" label="Primary Delivery Mode" icon={<Ship size={16} />} value={formData.deliveryMode} onChange={handleFormChange} onBlur={handleBlur} error={touched.deliveryMode ? errors.deliveryMode : undefined} required>
                                    <option value="Road">Road</option>
                                    <option value="Air" disabled>Air (Coming Soon)</option>
                                    <option value="Rail" disabled>Rail (Coming Soon)</option>
                                  </SelectField>
                                  <InputField id="numTrucks" label="Total Fleet Size" icon={<Truck size={16} />} type="number" min={0} value={formData.numTrucks} onChange={handleFormChange} onBlur={handleBlur} error={touched.numTrucks ? errors.numTrucks : undefined} required />
                                  <InputField id="maxLoading" label="Max Loading Cap (tons)" icon={<Truck size={16} />} type="number" value={formData.maxLoading} onChange={handleFormChange} onBlur={handleBlur} error={touched.maxLoading ? errors.maxLoading : undefined} required />

                                  <InputField id="experience" label="Experience (years)" icon={<Calendar size={16} />} type="number" value={formData.experience} onChange={handleFormChange} onBlur={handleBlur} error={touched.experience ? errors.experience : undefined} required />
                                  <InputField id="turnover" label="Annual Turnover (₹)" icon={<Hash size={16} />} type="number" value={formData.turnover} onChange={handleFormChange} onBlur={handleBlur} error={touched.turnover ? errors.turnover : undefined} required />
                                  <SelectField id="customerNetwork" label="Customer Network" icon={<Building size={16} />} value={formData.customerNetwork} onChange={handleFormChange} onBlur={handleBlur} error={touched.customerNetwork ? errors.customerNetwork : undefined} required>
                                    <option value="">Select Network</option>
                                    <option value="Domestic">Domestic</option>
                                    <option value="International">International</option>
                                  </SelectField>
                                </div>
                              </div>

                            </div>

                            <div className="pt-4 flex justify-end">
                              <button type="submit" className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                                Next <ArrowRight size={18} />
                              </button>
                            </div>
                          </form>
                        ) : (
                          // Step 2 Active: Left column shows a highly professional summary of step 1 inputs
                          <div className="space-y-6">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <CheckCircle className="text-green-500" size={20} />
                                Form Information Completed
                              </h3>
                              <button
                                onClick={() => setCurrentStep(0)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Edit Details
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Company Name</p>
                                <p className="text-slate-800 font-bold mt-1">{formData.companyName}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">GST No.</p>
                                <p className="text-slate-800 font-bold mt-1">{formData.gstNo}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Contact Email</p>
                                <p className="text-slate-800 font-medium mt-1 truncate">{formData.email}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Contact Phone</p>
                                <p className="text-slate-800 font-medium mt-1">{formData.phone}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 sm:col-span-2">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Office Location & Hours</p>
                                <p className="text-slate-800 font-medium mt-1">
                                  {formData.address || "N/A"}, {formData.pincode} ({formData.stateName})
                                </p>
                                <p className="text-slate-500 text-xs mt-1">Hours: {formData.officeStart} - {formData.officeEnd}</p>
                              </div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 sm:col-span-2">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Capabilities & Fleet</p>
                                <p className="text-slate-800 font-medium mt-1">
                                  Mode: {formData.deliveryMode} | Fleet: {formData.numTrucks} Trucks
                                </p>
                                <p className="text-slate-500 text-xs mt-1">
                                  Max Cap: {formData.maxLoading} tons | Experience: {formData.experience} yrs | Turnover: ₹{formData.turnover}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </Card>
                </div>

                {/* RIGHT COLUMN: 40% Width */}
                <div className="lg:col-span-5 space-y-6">

                  {/* Top Card: Upload Sheet */}
                  <Card className="p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                      <UploadCloud className="text-blue-600" size={20} />
                      Step 2: Upload Servicability Pincodes
                    </h3>

                    {currentStep === 0 ? (
                      // Locked State during Step 1
                      <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                        <Lock className="mx-auto w-8 h-8 text-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-600">File Upload Locked</p>
                        <p className="text-xs text-slate-400 mt-1 px-4">
                          Please complete and submit the registration details in Step 1 to unlock pricing uploads.
                        </p>
                      </div>
                    ) : (
                      // Active State during Step 2
                      <div className="space-y-6">
                        {localStorage.getItem('transporter_extracted_service') ? (
                          <div className="p-6 border border-emerald-200 bg-emerald-50 rounded-xl text-center">
                            <CheckCircle className="mx-auto w-10 h-10 text-emerald-500 mb-2" />
                            <p className="font-semibold text-sm text-emerald-800">Pricing & Service Zones Extracted</p>
                            <p className="text-xs text-emerald-600 mt-1">Data from AI upload is ready to submit.</p>
                          </div>
                        ) : (
                          <div
                            onDragEnter={e => handleDrag(e, true)}
                            onDragLeave={e => handleDrag(e, false)}
                            onDragOver={e => handleDrag(e, true)}
                            onDrop={handleDrop}
                            className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${isDragging
                              ? 'border-blue-500 bg-blue-50/50 scale-102 shadow-inner'
                              : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'
                              }`}
                          >
                            <input
                              type="file"
                              accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                              onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                              className="hidden"
                              id="file-upload"
                            />
                            <label htmlFor="file-upload" className="flex flex-col items-center justify-center space-y-2 cursor-pointer">
                              <UploadCloud className={`w-10 h-10 mx-auto transition-colors ${isDragging ? 'text-blue-600' : 'text-slate-400'}`} strokeWidth={1.5} />
                              <p className="font-semibold text-sm text-slate-700">Click to upload or drag file here</p>
                              <p className="text-xs text-slate-500">Excel spreadsheet (.xlsx format only)</p>
                            </label>
                          </div>
                        )}

                        {file && !localStorage.getItem('transporter_extracted_service') && (
                          <div className="flex items-center gap-2.5 p-2.5 bg-green-50 text-green-800 rounded-lg border border-green-200 text-sm">
                            <FileSpreadsheet className="flex-shrink-0" size={18} />
                            <span className="font-medium truncate">{file.name}</span>
                            {isParsingFile ? (
                              <Loader2 className="ml-auto flex-shrink-0 animate-spin" size={16} />
                            ) : zones.length > 0 ? (
                              <span className="ml-auto flex-shrink-0 text-xs font-semibold text-green-700 whitespace-nowrap">
                                {zones.length} zone{zones.length === 1 ? '' : 's'} · {uploadedService.length} pincodes detected
                              </span>
                            ) : null}
                          </div>
                        )}

                        <div className="flex justify-between items-center gap-4">
                          {/* Logical previous step from here is Route Selection (step 2), not
                              Page 1 (step 1) — leave currentStep alone so formData/step 1 stay
                              untouched, and only flip onboardingMode back to 'selection'. */}
                          <button
                            onClick={() => setOnboardingMode('selection')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 transition-colors focus:outline-none"
                          >
                            <ArrowLeft size={16} />Back
                          </button>
                          <button
                            onClick={handleSubmit}
                            disabled={
                              isLoading ||
                              isParsingFile ||
                              // A file is selected but parsing found no valid pincode/zone rows
                              // (see the "No valid pincode/zone rows found" toast above) — nothing
                              // usable would actually be submitted, so keep this disabled until
                              // either a file with real rows is uploaded or AI extraction ran.
                              (!localStorage.getItem('transporter_extracted_service') && (!file || uploadedService.length === 0))
                            }
                            className="inline-flex items-center justify-center gap-2 flex-1 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <><CheckCircle size={16} /> {localStorage.getItem('transporter_extracted_service') ? 'Submit Details' : 'Upload'}</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>

                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Global Terminal View (Never disappears if logs exist) ── */}
        {extractionLogs.length > 0 && onboardingMode !== 'ai_upload' && onboardingMode !== 'ai_processing' && onboardingMode !== 'selection' && (
          <div className="max-w-4xl mx-auto pb-8">
            {renderTerminal(extractionStatus === 'idle' ? 'processing' : extractionStatus)}
          </div>
        )}
      </div>

      <TermsModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)} />

      <AnimatePresence>
        {missingFieldsModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            >
              <h3 className="text-lg font-bold text-slate-800">
                {missingFieldsModal.fields.length} more detail{missingFieldsModal.fields.length === 1 ? '' : 's'} needed
              </h3>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                We couldn't pull these from your GST number or documents — mind filling them in?
              </p>

              <div className="space-y-4">
                {missingFieldsModal.fields.map((field, idx) => (
                  <div key={field.id}>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      {field.label} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      autoFocus={idx === 0}
                      value={missingFieldsModal.values[field.id] || ''}
                      onChange={(e) => setMissingFieldsModal(prev => ({
                        ...prev,
                        values: { ...prev.values, [field.id]: e.target.value },
                      }))}
                      maxLength={field.maxLength}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-md bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMissingFieldsModal(prev => ({ ...prev, open: false }))}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleMissingFieldsConfirm}
                  disabled={isLoading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {isLoading ? "Submitting..." : "Confirm & Continue"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}