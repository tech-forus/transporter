import { useState, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config/apiConfig';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const DEBOUNCE_MS = 600;

const GST_STATE_MAP: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

function resolveStateName(stateValue: string | null | undefined, gstin: string): string | null {
  if (!stateValue) return GST_STATE_MAP[gstin.substring(0, 2)] ?? null;
  if (stateValue.length > 2) return stateValue;
  return GST_STATE_MAP[stateValue] ?? GST_STATE_MAP[gstin.substring(0, 2)] ?? stateValue;
}

export interface GSTData {
  gstin: string;
  legalName: string | null;
  stateName: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
}

export interface ConflictField {
  key: 'companyName' | 'address' | 'state' | 'city' | 'pincode';
  label: string;
  currentValue: string;
  gstValue: string;
}

export type GSTLookupStatus = 'idle' | 'loading' | 'invalid' | 'success' | 'partial' | 'failed';

export interface CurrentFormFields {
  companyName: string;
  address: string;
  state: string;
  city: string;
  pincode: string;
}

export interface UseGSTLookupReturn {
  status: GSTLookupStatus;
  gstData: GSTData | null;
  conflicts: ConflictField[];
  showConflictPanel: boolean;
  successMessage: string | null;
  errorMessage: string | null;
  lookup: (gstin: string, current: CurrentFormFields) => void;
  dismissConflictPanel: () => void;
  reset: () => void;
}

const FIELD_LABELS: Record<ConflictField['key'], string> = {
  companyName: 'Company Name',
  address: 'Address',
  state: 'State',
  city: 'City',
  pincode: 'Pincode',
};

function mapGSTToForm(data: GSTData): Partial<Record<ConflictField['key'], string>> {
  return {
    ...(data.legalName ? { companyName: data.legalName } : {}),
    ...(data.address ? { address: data.address } : {}),
    ...(data.stateName ? { state: data.stateName } : {}),
    ...(data.city ? { city: data.city } : {}),
    ...(data.pincode ? { pincode: data.pincode } : {}),
  };
}

function detectConflicts(
  mapped: Partial<Record<ConflictField['key'], string>>,
  current: CurrentFormFields,
): ConflictField[] {
  return (Object.keys(mapped) as ConflictField['key'][]).reduce<ConflictField[]>((acc, key) => {
    const gstValue = mapped[key] ?? '';
    const currentValue = current[key] ?? '';
    if (gstValue && currentValue && gstValue.trim().toLowerCase() !== currentValue.trim().toLowerCase()) {
      acc.push({ key, label: FIELD_LABELS[key], currentValue, gstValue });
    }
    return acc;
  }, []);
}

function isPartialOnly(data: GSTData): boolean {
  return !data.legalName && !data.address && !data.city && !data.pincode && Boolean(data.stateName);
}

export function useGSTLookup(): UseGSTLookupReturn {
  const [status, setStatus] = useState<GSTLookupStatus>('idle');
  const [gstData, setGstData] = useState<GSTData | null>(null);
  const [conflicts, setConflicts] = useState<ConflictField[]>([]);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setStatus('idle');
    setGstData(null);
    setConflicts([]);
    setShowConflictPanel(false);
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

  const dismissConflictPanel = useCallback(() => setShowConflictPanel(false), []);

  const lookup = useCallback((gstin: string, current: CurrentFormFields) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    setSuccessMessage(null);
    setErrorMessage(null);
    setShowConflictPanel(false);

    if (!gstin || gstin.length !== 15) {
      setStatus('idle');
      setGstData(null);
      return;
    }

    if (!GSTIN_REGEX.test(gstin)) {
      setStatus('invalid');
      setGstData(null);
      return;
    }

    setStatus('loading');

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${API_BASE_URL}/api/gst/verify/${gstin}`, {
          signal: controller.signal,
        });

        const body = await res.json();

        if (!res.ok || !body.success || !body.data) {
          setStatus('failed');
          setErrorMessage('Could not look up GST details. You can continue filling manually.');
          return;
        }

        const d = body.data;
        const data: GSTData = {
          gstin: d.gstin || gstin,
          legalName: d.legalName || d.companyName || null,
          stateName: resolveStateName(d.state, gstin),
          address: d.address || null,
          city: d.city || null,
          pincode: d.pincode || null,
        };

        setGstData(data);

        if (isPartialOnly(data)) {
          setStatus('partial');
          setSuccessMessage('Only state identified from GSTIN. Enter remaining details manually.');
          return;
        }

        const mapped = mapGSTToForm(data);
        const detected = detectConflicts(mapped, current);
        setConflicts(detected);

        if (detected.length > 0) {
          setShowConflictPanel(true);
        } else {
          setSuccessMessage('✓ Company details filled from GST');
        }
        setStatus('success');
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus('failed');
        setErrorMessage('Could not look up GST details. You can continue filling manually.');
      }
    }, DEBOUNCE_MS);
  }, []);

  return { status, gstData, conflicts, showConflictPanel, successMessage, errorMessage, lookup, dismissConflictPanel, reset };
}
