import { useState, useEffect, useRef, ChangeEvent, FormEvent } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { API_BASE_URL } from "../config/apiConfig";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  ChevronDown,
  Percent,
  Truck,
  Weight,
  Package,
  Cog,
  BotMessageSquare,
  Loader2,
  Scale,
  ArrowLeft,
  ArrowRight,
  FileText,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Cookies from "js-cookie";
import ZoneRateMatrix from "../components/ZoneRateMatrix";
import ZoneSummaryPanel, { type ZonePincodeEntry } from "../components/ZoneSummaryPanel";
import { useReportIframeHeight } from "../hooks/useReportIframeHeight";
import {
  ACCEPTED_EXTENSIONS, MAX_UPLOAD_FILES, MAX_FILE_SIZE, guessCategory,
  runUtsfExtraction, parseUtsfOutput,
  type UploadItem, type DocCategory, type ParsedUtsfResult,
} from "../lib/standaloneUtsfExtraction";
import { tryParseExcelClientSide } from "../lib/clientExcelParser";
import { Upload, X, CheckCircle2 } from "lucide-react";

// --- Type Definitions ---
interface VariableFixed { variable: number; fixed: number; }
// Matches the backend's spelling exactly (model/priceModel.js: handlingCharges.threshholdweight) —
// a mismatched key here means the field silently never reaches the schema and fails required validation.
interface VariableFixedThreshold extends VariableFixed { threshholdweight?: number; }

// Field-level max caps mirror the Add Vendor charges page (freight-compare-frontend
// ChargesSection.tsx) so both tools enforce identical limits.
const FIELD_MAX = {
  minWeight: 1000, // pure KG threshold, no fixed/variable duality
} as const;

// Every charge row can be billed FLAT (fixed ₹) or % ON BASE (variable %) — the
// unit dropdown picks the mode, and only the active column accepts input.
const CHARGE_MAX: Record<string, { fixed: number; variable: number }> = {
  docketCharges:       { fixed: 1000, variable: 100 },
  fuel:                { fixed: 1000, variable: 50 },
  minCharges:          { fixed: 1000, variable: 100 },
  gstPct:              { fixed: 1000, variable: 100 },
  rovCharges:          { fixed: 1000, variable: 100 },
  odaCharges:          { fixed: 1000, variable: 100 },
  handlingCharges:     { fixed: 1000, variable: 100 },
  greenTax:            { fixed: 1000, variable: 100 },
  hamaliCharges:       { fixed: 1000, variable: 100 },
  miscellanousCharges: { fixed: 1000, variable: 100 },
  topayCharges:        { fixed: 1000, variable: 100 },
  codCharges:          { fixed: 1000, variable: 100 },
  daccCharges:         { fixed: 1000, variable: 100 },
  insuaranceCharges:   { fixed: 1000, variable: 100 },
  prepaidCharges:      { fixed: 1000, variable: 100 },
  fmCharges:           { fixed: 1000, variable: 100 },
  appointmentCharges:  { fixed: 1000, variable: 100 },
};

// Plain-number charges — no FLAT/%-ON-BASE duality, just a single value.
const NUMBER_FIELD_MAX = {
  divisor: 20000,
  kFactor: 20000,
  chequeHandlingCharges: 1000,
} as const;

// These 5 must be filled before a vendor can be saved — whichever column is
// active for that row (FLAT → fixed, % ON BASE → variable) needs a value
// greater than 0. Zero doesn't count as "filled": it's indistinguishable
// from an empty field, and a vendor that genuinely charges nothing for one
// of these should still make that an explicit, deliberate entry.
const MANDATORY_CHARGE_FIELDS: Array<{ key: keyof PriceRate; label: string }> = [
  { key: 'docketCharges', label: 'Docket Charges' },
  { key: 'fuel', label: 'Fuel Surcharge' },
  { key: 'gstPct', label: 'GST %' },
  { key: 'rovCharges', label: 'ROV / FOV Charges' },
  { key: 'handlingCharges', label: 'Handling Charges' },
];

type PriceRate = {
  minWeight: number;
  docketCharges: VariableFixed;
  fuel: VariableFixed;
  gstPct: VariableFixed;
  minCharges: VariableFixed;
  rovCharges: VariableFixed;
  odaCharges: VariableFixed;
  handlingCharges: VariableFixedThreshold;
  greenTax: VariableFixed;
  hamaliCharges: VariableFixed;
  miscellanousCharges: VariableFixed;
  topayCharges: VariableFixed;
  codCharges: VariableFixed;
  daccCharges: VariableFixed;
  // Backend-required (model/priceModel.js) but previously never collected here —
  // omitting them left the field undefined, failing Mongoose's `required: true`.
  insuaranceCharges: VariableFixed;
  prepaidCharges: VariableFixed;
  fmCharges: VariableFixed;
  appointmentCharges: VariableFixed;
  divisor: number;
  kFactor: number;
  chequeHandlingCharges: number;
};

const DEFAULT_PRICE_RATE: PriceRate = {
  minWeight: 0,
  docketCharges: { variable: 0, fixed: 0 },
  fuel: { variable: 0, fixed: 0 },
  gstPct: { variable: 0, fixed: 0 },
  minCharges: { variable: 0, fixed: 0 },
  rovCharges: { variable: 0, fixed: 0 },
  odaCharges: { variable: 0, fixed: 0 },
  handlingCharges: { variable: 0, fixed: 0, threshholdweight: 0 },
  greenTax: { variable: 0, fixed: 0 },
  hamaliCharges: { variable: 0, fixed: 0 },
  miscellanousCharges: { variable: 0, fixed: 0 },
  topayCharges: { variable: 0, fixed: 0 },
  codCharges: { variable: 0, fixed: 0 },
  daccCharges: { variable: 0, fixed: 0 },
  insuaranceCharges: { variable: 0, fixed: 0 },
  prepaidCharges: { variable: 0, fixed: 0 },
  fmCharges: { variable: 0, fixed: 0 },
  appointmentCharges: { variable: 0, fixed: 0 },
  // Matches the schema defaults (model/priceModel.js) — kFactor/divisor drive
  // volumetric-weight calculations elsewhere, so 0 would be actively wrong.
  divisor: 5000,
  kFactor: 5000,
  chequeHandlingCharges: 0,
};

// Default billing mode per charge row — Fuel/GST default to a % rate, the rest
// default to a flat ₹ amount. Selecting "% ON BASE" in the row's unit dropdown
// enables the Variable column and disables Fixed, and vice versa.
const DEFAULT_UNIT_MODE: Record<string, 'FLAT' | 'PER KG' | '% ON BASE'> = {
  docketCharges: 'FLAT',
  fuel: '% ON BASE',
  gstPct: '% ON BASE',
  minCharges: 'FLAT',
  rovCharges: 'FLAT',
  odaCharges: 'FLAT',
  handlingCharges: 'FLAT',
  greenTax: 'FLAT',
  hamaliCharges: 'FLAT',
  miscellanousCharges: 'FLAT',
  topayCharges: 'FLAT',
  codCharges: 'FLAT',
  daccCharges: 'FLAT',
  insuaranceCharges: 'FLAT',
  prepaidCharges: 'FLAT',
  fmCharges: 'FLAT',
  appointmentCharges: 'FLAT',
};

// A field counts as "already filled" if it's non-zero — extraction (client-
// side or backend) only ever adds to a blank field, never overwrites a
// value the transporter (or an earlier upload round) already set.
const isBlankCharge = (v: any): boolean =>
  v == null || (typeof v === 'number' ? v === 0 : !(v.fixed > 0) && !(v.variable > 0));

// Pure merge helpers shared by runExtractionAndApply — used once per parsed
// result (there can be several: some files read client-side, others via the
// backend, in one upload round), so extracting these avoids writing the
// same merge logic twice.
function mergePricingInto(prev: PriceRate, p: import('../lib/standaloneUtsfExtraction').ParsedPricing): PriceRate {
  const next = { ...prev };
  if (isBlankCharge(prev.minWeight) && p.minWeight > 0) next.minWeight = p.minWeight;
  if (isBlankCharge(prev.docketCharges.fixed) && p.docketCharges > 0) next.docketCharges = { variable: 0, fixed: p.docketCharges };
  if (isBlankCharge(prev.fuel.variable) && p.fuel > 0) next.fuel = { variable: p.fuel, fixed: 0 };
  if (isBlankCharge(prev.minCharges) && p.minCharges > 0) next.minCharges = { variable: 0, fixed: p.minCharges };
  if (isBlankCharge(prev.rovCharges) && (p.rovCharges.variable > 0 || p.rovCharges.fixed > 0)) next.rovCharges = p.rovCharges;
  if (isBlankCharge(prev.odaCharges) && (p.odaCharges.variable > 0 || p.odaCharges.fixed > 0)) next.odaCharges = p.odaCharges;
  if (isBlankCharge(prev.handlingCharges) && (p.handlingCharges.variable > 0 || p.handlingCharges.fixed > 0))
    next.handlingCharges = { variable: p.handlingCharges.variable, fixed: p.handlingCharges.fixed, threshholdweight: p.handlingCharges.thresholdWeight };
  if (isBlankCharge(prev.greenTax) && p.greenTax > 0) next.greenTax = { variable: 0, fixed: p.greenTax };
  if (isBlankCharge(prev.miscellanousCharges) && p.miscellanousCharges > 0) next.miscellanousCharges = { variable: 0, fixed: p.miscellanousCharges };
  if (isBlankCharge(prev.topayCharges) && (p.topayCharges.variable > 0 || p.topayCharges.fixed > 0)) next.topayCharges = p.topayCharges;
  if (isBlankCharge(prev.codCharges) && (p.codCharges.variable > 0 || p.codCharges.fixed > 0)) next.codCharges = p.codCharges;
  if (isBlankCharge(prev.daccCharges) && p.daccCharges > 0) next.daccCharges = { variable: 0, fixed: p.daccCharges };
  if (isBlankCharge(prev.insuaranceCharges) && (p.insuranceCharges.variable > 0 || p.insuranceCharges.fixed > 0)) next.insuaranceCharges = p.insuranceCharges;
  if (isBlankCharge(prev.prepaidCharges) && (p.prepaidCharges.variable > 0 || p.prepaidCharges.fixed > 0)) next.prepaidCharges = p.prepaidCharges;
  if (isBlankCharge(prev.fmCharges) && (p.fmCharges.variable > 0 || p.fmCharges.fixed > 0)) next.fmCharges = p.fmCharges;
  if (isBlankCharge(prev.appointmentCharges) && (p.appointmentCharges.variable > 0 || p.appointmentCharges.fixed > 0)) next.appointmentCharges = p.appointmentCharges;
  return next;
}

function mergeZonesInto(
  prevLabels: string[], prevRates: number[][], newLabels: string[], newMatrix: number[][],
): { labels: string[]; rates: number[][] } {
  if (newLabels.length === 0) return { labels: prevLabels, rates: prevRates };
  const mergedLabels = Array.from(new Set([...prevLabels, ...newLabels]));
  const idx = (label: string) => mergedLabels.indexOf(label);
  const merged = mergedLabels.map(() => mergedLabels.map(() => 0));
  prevLabels.forEach((from, i) => prevLabels.forEach((to, j) => {
    merged[idx(from)][idx(to)] = prevRates[i]?.[j] || 0;
  }));
  if (newMatrix.length > 0) {
    newLabels.forEach((from, i) => newLabels.forEach((to, j) => {
      const v = newMatrix[i]?.[j] || 0;
      if (v > 0) merged[idx(from)][idx(to)] = v;
    }));
  }
  return { labels: mergedLabels, rates: merged };
}

// Zones only ever get ADDED via mergeZonesInto above (every upload unions its
// zone labels into whatever's already there — a bad AI read or a re-upload
// with a differently-spelled zone name has no way to be undone). This is the
// one place a zone label leaves the list. Removes the zone from both the
// matrix dimension (row + column) and any per-pincode service entries tagged
// with it, so a removed zone doesn't linger as an orphaned pincode->zone
// mapping that would just get pulled back in via mergeServiceInto next merge.
function removeZoneAt(
  index: number, labels: string[], rates: number[][], pincodeData: ZonePincodeEntry[],
): { labels: string[]; rates: number[][]; pincodeData: ZonePincodeEntry[] } {
  const removedLabel = labels[index];
  return {
    labels: labels.filter((_, i) => i !== index),
    rates: rates.filter((_, i) => i !== index).map(row => row.filter((_, j) => j !== index)),
    pincodeData: pincodeData.filter(e => e.zone !== removedLabel),
  };
}

function mergeServiceInto<T extends { pincode: number }>(prev: T[], newService: T[]): T[] {
  if (newService.length === 0) return prev;
  const byPincode = new Map(prev.map(e => [e.pincode, e]));
  for (const entry of newService) byPincode.set(entry.pincode, entry);
  return Array.from(byPincode.values());
}

// --- Styled & Reusable Components ---
const Card = ({ children, className }: { children: React.ReactNode; className?: string; }) => (
  <div className={`bg-white rounded-2xl shadow-lg border border-slate-200/60 p-3 sm:p-4 ${className}`}>{children}</div>
);

const InputField = ({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode; }) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400">{icon}</span>
    <input
      {...props}
      className={`w-full ${icon ? "pl-10" : "px-3"} py-2.5 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white`}
    />
  </div>
);


export default function AddPrice() {
  const navigate = useNavigate();
  const token = Cookies.get("authToken");

  // Distinguishes "returning, already-signed-up transporter opened this from
  // the Dashboard" from "mid-signup, AI-deferred or manual" — those never
  // have a valid session yet (the account/login only exists after OTP
  // verification, which happens AFTER this page). A real session here is an
  // authoritative signal, unlike checking localStorage draft keys (which can
  // be stale from an abandoned earlier signup in the same browser). See
  // handleSubmit below — a returning transporter saves via the new
  // authenticated PUT /auth/pricing, never the signup-only POST /auth/addprice.
  const [isReturningTransporter, setIsReturningTransporter] = useState(false);
  const [returningCheckDone, setReturningCheckDone] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/transporter/auth/me`, { withCredentials: true });
        if (res.data?.success && res.data.transporter) {
          setIsReturningTransporter(true);
          setTransporterName(prev => prev || res.data.transporter.companyName || '');
        }
      } catch (_) {
        // No valid session — normal mid-signup case, nothing to do.
      } finally {
        setReturningCheckDone(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upload-first screen state — asked for live 2026-09-22: offer document
  // upload before the manual charges table, and if extraction comes back
  // incomplete, say specifically what's missing and let the transporter
  // either upload more documents or fill just the gap manually.
  const [showUploadStep, setShowUploadStep] = useState(false);
  const [uploadDismissed, setUploadDismissed] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadItem[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [gapReport, setGapReport] = useState<{ missingCharges: string[]; zoneNote: string | null } | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  // The zone-matrix step's compact upload panel is a SEPARATE mount from the
  // full upload-first screen (that screen's own <input> only exists while
  // showUploadStep is true) — reusing uploadFileInputRef there pointed at an
  // unmounted input (.current === null), so tapping it silently did nothing.
  // Reported live 2026-09-22: "tap to choose files stopped working".
  const zoneUploadFileInputRef = useRef<HTMLInputElement>(null);

  const [wasAiPrefilled, setWasAiPrefilled] = useState<boolean>(() => {
    const hasManuallySaved = !!localStorage.getItem('transporter_price_rate');
    const hasExtractedCharges = !!localStorage.getItem('transporter_extracted_price_rate');
    // A file can have genuine zone-to-zone rates with zero surcharge/charge
    // data at all (e.g. a rate card with no docket/fuel/ROV line items) — that
    // must still count as "AI prefilled" so the Zone-to-Zone grid hides the
    // all-empty rows. Checking transporter_extracted_price_rate alone missed
    // this case entirely.
    let hasExtractedZoneRates = false;
    try {
      const savedRates = localStorage.getItem('transporter_zone_rates');
      if (savedRates) {
        const parsed = JSON.parse(savedRates);
        hasExtractedZoneRates = Array.isArray(parsed?.matrix) && parsed.matrix.some((row: number[]) => row.some(v => v > 0));
      }
    } catch (_) {}
    return !hasManuallySaved && (hasExtractedCharges || hasExtractedZoneRates);
  });

  // Load priceRate: user's saved progress > AI-extracted > defaults
  const [priceRate, setPriceRate] = useState<PriceRate>(() => {
    const saved = localStorage.getItem('transporter_price_rate');
    if (saved) { try { return JSON.parse(saved); } catch (_) {} }
    const extracted = localStorage.getItem('transporter_extracted_price_rate');
    if (extracted) { try { return JSON.parse(extracted); } catch (_) {} }
    return DEFAULT_PRICE_RATE;
  });

  const [transporterName, setTransporterName] = useState("");
  const [zoneLabels, setZoneLabels] = useState<string[]>([]);
  const [zonePincodeData, setZonePincodeData] = useState<ZonePincodeEntry[]>([]);
  const [zoneRates, setZoneRates] = useState<number[][]>([]);
  const [loading, setLoading] = useState(false);
  // Synchronous guard against a double-submit race: a fast double-click/
  // double-Enter can fire handleSubmit twice before React re-renders the
  // disabled={loading} button, sending two concurrent addprice POSTs for the
  // same companyId — the second one hits the unique index and throws
  // E11000 even though the backend upserts (the two requests' find-then-write
  // steps interleave). A ref flips synchronously, unlike state.
  const isSubmittingRef = useRef(false);
  const [showZoneGrid, setShowZoneGrid] = useState(() => {
    return !localStorage.getItem('transporter_extracted_price_rate');
  });

  // Per-row billing mode (FLAT vs % ON BASE) — drives which of Fixed/Variable
  // is editable for that charge row.
  const [unitMode, setUnitMode] = useState<Record<string, 'FLAT' | 'PER KG' | '% ON BASE'>>(DEFAULT_UNIT_MODE);
  // Optional Charges accordion — closed by default, opens on click.
  const [showOptional, setShowOptional] = useState(false);

  // Docket/Fuel/GST/ROV/Handling must be filled before the user can leave
  // this step or save the vendor — see MANDATORY_CHARGE_FIELDS above.
  const missingMandatoryFields = MANDATORY_CHARGE_FIELDS.filter(({ key }) => {
    const unit = unitMode[key as string] ?? 'FLAT';
    const data = priceRate[key] as unknown as VariableFixed;
    const value = unit === '% ON BASE' ? data?.variable : data?.fixed;
    return !(value > 0);
  });
  const mandatoryChargesComplete = missingMandatoryFields.length === 0;
  // Errors stay invisible until the user actually tries to move on — no red
  // on a page they haven't touched yet. Once shown, it tracks live as they fill
  // fields in, and never hides again this session (so it can't flash on/off).
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Split into steps so each screen fits without the huge charges table + zone
  // matrix + zone summary all being one long scroll: 0 = Charges, 1 = Zone Rate
  // Matrix (skipped when AI already extracted zone rates), 2 = Review (Zone
  // Summary cards, shown AFTER the matrix per the requested order) + T&C + Submit.
  const [step, setStep] = useState(0);

  // NOTE: We intentionally do NOT auto-set 'transporter_onboarding_active_route' here.
  // Setting it on every mount caused SignUpPage to permanently redirect to /addprice,
  // trapping users even when starting a fresh signup flow.

  // Persist price rate edits to localStorage
  useEffect(() => {
    localStorage.setItem('transporter_price_rate', JSON.stringify(priceRate));
  }, [priceRate]);

  // Persist zone rates to localStorage, paired with the exact zone labels
  // they were built against. A previous version stored only the matrix, so a
  // later reload with a *different* (but same-length) zoneLabels order would
  // silently reuse rows under the wrong zone — see loadFromStorage below.
  useEffect(() => {
    if (zoneRates && zoneRates.length > 0) {
      localStorage.setItem('transporter_zone_rates', JSON.stringify({ labels: zoneLabels, matrix: zoneRates }));
    }
  }, [zoneRates, zoneLabels]);

  // Announce readiness to parent so it can push UTSF prefill via postMessage
  useEffect(() => {
    window.parent.postMessage({ type: 'addprice_ready' }, '*');
  }, []);

  useReportIframeHeight([step, wasAiPrefilled, zoneLabels.length, showUploadStep, uploadStatus, uploadFiles.length, gapReport]);

  // Listen for UTSF prefill data from parent window (main freightcompare app)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'utsf_prefill') return;
      const { companyName, pricing, zoneLabels: labels, zoneMatrix: matrix } = event.data;

      if (companyName) setTransporterName(companyName);

      if (pricing) {
        setPriceRate(prev => ({
          ...prev,
          ...(pricing.minWeight  ? { minWeight: Number(pricing.minWeight) } : {}),
          // Docket/Min Charges default to FLAT (₹); Fuel/GST default to % ON BASE — matches DEFAULT_UNIT_MODE.
          ...(pricing.docketCharges ? { docketCharges: { variable: 0, fixed: Number(pricing.docketCharges) } } : {}),
          ...(pricing.fuel ? { fuel: { variable: Number(pricing.fuel), fixed: 0 } } : {}),
          ...(pricing.minCharges ? { minCharges: { variable: 0, fixed: Number(pricing.minCharges) } } : {}),
          ...(pricing.gstPct ? { gstPct: { variable: Number(pricing.gstPct), fixed: 0 } } : {}),
          // Complex charges: only set if non-null
          ...(pricing.rovCharges    ? { rovCharges:    { variable: pricing.rovCharges.v || 0,    fixed: pricing.rovCharges.f || 0 } } : {}),
          ...(pricing.odaCharges    ? { odaCharges:    { variable: pricing.odaCharges.v || 0,    fixed: pricing.odaCharges.f || 0 } } : {}),
          ...(pricing.handlingCharges ? { handlingCharges: { variable: pricing.handlingCharges.v || 0, fixed: pricing.handlingCharges.f || 0, threshholdweight: 0 } } : {}),
          ...(pricing.greenTax      ? { greenTax:      { variable: pricing.greenTax.v || 0,      fixed: pricing.greenTax.f || 0 } } : {}),
          ...(pricing.hamaliCharges ? { hamaliCharges: { variable: pricing.hamaliCharges.v || 0, fixed: pricing.hamaliCharges.f || 0 } } : {}),
          ...(pricing.miscCharges  ? { miscellanousCharges: { variable: pricing.miscCharges.v || 0, fixed: pricing.miscCharges.f || 0 } } : {}),
          ...(pricing.topayCharges ? { topayCharges: { variable: pricing.topayCharges.v || 0, fixed: pricing.topayCharges.f || 0 } } : {}),
          ...(pricing.codCharges   ? { codCharges:   { variable: pricing.codCharges.v || 0,   fixed: pricing.codCharges.f || 0 } } : {}),
          ...(pricing.daccCharges  ? { daccCharges:  { variable: pricing.daccCharges.v || 0,  fixed: pricing.daccCharges.f || 0 } } : {}),
        }));
      }

      if (Array.isArray(labels) && labels.length > 0 && Array.isArray(matrix)) {
        setZoneLabels(labels);
        setZoneRates(matrix);
      }

      if (pricing || (Array.isArray(labels) && labels.length > 0)) {
        setWasAiPrefilled(true);
        toast.success('AI-extracted pricing loaded — review and save', { duration: 4000 });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Whether vendor creation is still pending — set by SignUpPage the instant
  // "Yes, Read My Files Now" is clicked, before extraction has even started
  // (see startAiExtractionAndContinue). While this is true, background
  // extraction may still be running, so zones/pricing might not be in
  // storage yet — the effect below polls for them instead of reading once.
  const isPendingAiCreation = localStorage.getItem('transporter_pending_creation') === 'true';
  const [aiExtractionStatus, setAiExtractionStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>(
    () => (localStorage.getItem('transporter_ai_extraction_status') as any) || 'idle'
  );

  // Load transporter name and zone labels from session storage. When vendor
  // creation is still pending (background extraction may not be done yet),
  // this re-checks every 1.5s instead of reading once, and also merges any
  // newly-available charges into priceRate — but only into fields the user
  // hasn't touched (still at their zero default), never overwriting an
  // in-progress manual edit.
  useEffect(() => {
    const loadFromStorage = () => {
      const savedName = sessionStorage.getItem("companyName");
      const savedZones = sessionStorage.getItem("zones");
      const savedPincodeData = sessionStorage.getItem("transporter_zone_pincode_data");

      if (savedPincodeData) {
        try {
          const parsed = JSON.parse(savedPincodeData);
          if (Array.isArray(parsed)) setZonePincodeData(parsed);
        } catch (_) {}
      }

      if (savedName) setTransporterName(savedName);

      // Prefer the explicit zone label list, but fall back to deriving names
      // straight from the pincode-level data if that's missing/stale — the
      // pincode data is the actual source of truth for what was uploaded.
      let arr: string[] | null = null;
      if (savedZones) {
        try {
          const parsedZones = JSON.parse(savedZones);
          if (Array.isArray(parsedZones) && parsedZones.length > 0) arr = parsedZones;
        } catch (_) {}
      }
      if (!arr && savedPincodeData) {
        try {
          const parsedData = JSON.parse(savedPincodeData);
          if (Array.isArray(parsedData) && parsedData.length > 0) {
            arr = Array.from(new Set(parsedData.map((e: any) => e.zone).filter(Boolean)));
          }
        } catch (_) {}
      }

      if (arr) {
        setZoneLabels(arr);
        const savedRates = localStorage.getItem('transporter_zone_rates');
        // A saved matrix is only reusable if it was built against this exact
        // label order — a stale matrix from an earlier extraction attempt can
        // have the same length (same zone count) but a different order, which
        // would silently attach real rates to the wrong origin zone.
        let reused = false;
        if (savedRates) {
          try {
            const parsed = JSON.parse(savedRates);
            const sameLabels = Array.isArray(parsed?.labels) &&
              parsed.labels.length === arr.length &&
              parsed.labels.every((z: string, i: number) => z === arr![i]);
            if (sameLabels && Array.isArray(parsed.matrix)) {
              setZoneRates(parsed.matrix);
              reused = true;
            }
          } catch (_) {}
        }
        if (!reused) {
          setZoneRates(arr.map(() => arr!.map(() => 0)));
        }
      }

      // Merge freshly-extracted charges into priceRate — field by field, and
      // only into ones still at their untouched (zero) default.
      const rawExtracted = localStorage.getItem('transporter_extracted_price_rate');
      if (rawExtracted) {
        try {
          const extracted = JSON.parse(rawExtracted);
          const isBlank = (v: any) => {
            if (v == null) return true;
            if (typeof v === 'number') return v === 0;
            if (typeof v === 'object') return !(v.fixed > 0) && !(v.variable > 0);
            return false;
          };
          setPriceRate(prev => {
            const next = { ...prev };
            (Object.keys(extracted) as Array<keyof PriceRate>).forEach(key => {
              if (!(key in DEFAULT_PRICE_RATE)) return; // ignore fields PriceRate doesn't have (e.g. kFactor)
              if (isBlank((prev as any)[key])) {
                (next as any)[key] = extracted[key];
              }
            });
            return next;
          });
        } catch (_) {}
      }

      const status = (localStorage.getItem('transporter_ai_extraction_status') as any) || 'idle';
      setAiExtractionStatus(status);
      return status;
    };

    loadFromStorage();

    if (!isPendingAiCreation) return;

    // Poll while extraction is still running — stop once it resolves either
    // way, or after 5 minutes as a safety cap so this can never poll forever.
    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      const status = loadFromStorage();
      if (status === 'success' || status === 'failed' || Date.now() - startedAt > 5 * 60 * 1000) {
        clearInterval(intervalId);
      }
    }, 1500);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the upload screen once we know for sure this is a returning,
  // already-authenticated transporter — never for the mid-signup flow (which
  // has its own upload step on SignUpPage.tsx already) and never again this
  // session once they've dismissed it (extraction ran, or chose manual).
  useEffect(() => {
    if (returningCheckDone && isReturningTransporter && !wasAiPrefilled && !uploadDismissed) {
      setShowUploadStep(true);
    }
  }, [returningCheckDone, isReturningTransporter, wasAiPrefilled, uploadDismissed]);

  const addUploadFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const next: UploadItem[] = [];
    let remainingSlots = MAX_UPLOAD_FILES - uploadFiles.length;
    for (const f of arr) {
      if (remainingSlots <= 0) {
        toast.error(`You can only upload up to ${MAX_UPLOAD_FILES} files at a time.`);
        continue;
      }
      const ext = '.' + f.name.split('.').pop()!.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.has(ext)) {
        toast.error(`"${f.name}" isn't a supported file type.`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" is too big — files must be under 10 MB.`);
        continue;
      }
      next.push({ file: f, id: Math.random().toString(36).slice(2), category: guessCategory(f.name) });
      remainingSlots--;
    }
    setUploadFiles(prev => [...prev, ...next]);
  };
  const removeUploadFile = (id: string) => setUploadFiles(prev => prev.filter(f => f.id !== id));

  // Merges freshly-extracted data onto whatever's already in priceRate/zoneRates
  // — a second upload round (filling a gap the first round left) must ADD to
  // what's there, not wipe it out. A field counts as "already filled" if it's
  // non-zero; only blank ones get overwritten by the new extraction.
  const runExtractionAndApply = async () => {
    if (uploadFiles.length === 0) {
      toast.error('Please add at least one file first.');
      return;
    }
    setUploadStatus('processing');
    setUploadLogs([]);
    setUploadError(null);
    const appendLog = (l: string) => setUploadLogs(prev => [...prev, l]);

    try {
      // Excel/CSV files are tried client-side FIRST — entirely in the
      // browser, no backend round-trip — and only fall back to the backend
      // AI pipeline for the ones that don't confidently match. Photos and
      // PDFs never attempt a client-side parse at all; they always go
      // straight to the backend, same as before. Asked for live 2026-09-22:
      // "if the files are plain excel it doesnt need backend at all if its
      // properly readable...if its complex send it back...same like pics
      // and pdfs".
      const EXCEL_EXTS = new Set(['.xlsx', '.xls', '.csv']);
      const extOf = (name: string) => '.' + name.split('.').pop()!.toLowerCase();
      const excelFiles = uploadFiles.filter(f => EXCEL_EXTS.has(extOf(f.file.name)));
      const otherFiles = uploadFiles.filter(f => !EXCEL_EXTS.has(extOf(f.file.name)));

      const localResults: ParsedUtsfResult[] = [];
      const needsBackend: UploadItem[] = [...otherFiles];

      for (const item of excelFiles) {
        appendLog(`[INFO] Checking "${item.file.name}" locally...`);
        const outcome = await tryParseExcelClientSide(item.file, zoneLabels);
        if (outcome.handled && outcome.result) localResults.push(outcome.result);

        // The client parser can only MATCH zones against labels this
        // transporter already has — it can't discover brand-new ones from
        // scratch (no dictionary to fall back on, unlike the shipper-side
        // parser). So when nothing's known yet (zoneLabels empty), the file
        // still needs the backend for zone/service discovery even if its
        // charges sheet matched perfectly client-side — otherwise a file
        // that's 50% readable locally would silently lose the other half
        // instead of falling back for it.
        const canSkipBackend = outcome.handled && zoneLabels.length >= 2;
        if (canSkipBackend) {
          appendLog(`[OK] Read "${item.file.name}" directly — no server round-trip needed.`);
        } else {
          appendLog(outcome.handled
            ? `[INFO] Found some details in "${item.file.name}" already — still sending it for a full read (no zones set up yet to match against).`
            : `[INFO] "${item.file.name}" needs a closer read — sending to the document processor.`);
          needsBackend.push(item);
        }
      }

      const allResults: ParsedUtsfResult[] = [...localResults];
      if (needsBackend.length > 0) {
        const utsf = await runUtsfExtraction(needsBackend, transporterName || 'transporter', appendLog);
        allResults.push(parseUtsfOutput(utsf));
      }
      if (allResults.length === 0) {
        throw new Error('Could not read any of the uploaded documents.');
      }

      let workingPriceRate = priceRate;
      let workingZoneLabels = zoneLabels;
      let workingZoneRates = zoneRates;
      let workingZonePincodeData = zonePincodeData;
      const allSourcedFields: string[] = [];
      let anyCompanyName = '';
      let anyGstPct: number | null = null;

      for (const parsed of allResults) {
        workingPriceRate = mergePricingInto(workingPriceRate, parsed.pricing);
        const zm = mergeZonesInto(workingZoneLabels, workingZoneRates, parsed.zoneLabels, parsed.zoneMatrix);
        workingZoneLabels = zm.labels;
        workingZoneRates = zm.rates;
        workingZonePincodeData = mergeServiceInto(workingZonePincodeData, parsed.service as unknown as ZonePincodeEntry[]);
        for (const f of parsed.sourcedFields) {
          if (f === 'gstPct') continue; // synthetic marker from the client parser, handled separately below
          if (!allSourcedFields.includes(f)) allSourcedFields.push(f);
        }
        if (parsed.companyName && !anyCompanyName) anyCompanyName = parsed.companyName;
        const gst = (parsed as any)._gstPct;
        if (gst != null && anyGstPct == null) anyGstPct = gst;
      }

      // gstPct isn't a ParsedPricing field (the real PriceRate stores it as
      // {variable,fixed} directly, not via the shared merge helper above) —
      // the client parser surfaces it separately as _gstPct.
      if (anyGstPct != null && isBlankCharge(workingPriceRate.gstPct)) {
        workingPriceRate = { ...workingPriceRate, gstPct: { variable: anyGstPct, fixed: 0 } };
        allSourcedFields.push('gstPct');
      }

      if (anyCompanyName && !transporterName) setTransporterName(anyCompanyName);
      setPriceRate(workingPriceRate);
      setZoneLabels(workingZoneLabels);
      setZoneRates(workingZoneRates);
      setZonePincodeData(workingZonePincodeData);
      setWasAiPrefilled(true);
      setUploadStatus('success');

      // Gap report — tell them exactly what's still missing, not just "review
      // everything below." MANDATORY_CHARGE_FIELDS is the same list Save
      // itself requires filled.
      const missingCharges = MANDATORY_CHARGE_FIELDS
        .filter(({ key }) => !allSourcedFields.includes(key as string))
        .map(f => f.label);
      const zoneCount = workingZoneLabels.length;
      let zoneNote: string | null = null;
      if (zoneCount === 0) {
        zoneNote = "We couldn't find any service zones or pincodes in your documents.";
      } else if (workingZoneRates.some(row => row.every(v => v === 0))) {
        zoneNote = `We found ${zoneCount} service zone${zoneCount === 1 ? '' : 's'}, but rates for some zone-to-zone pairs are still missing.`;
      }
      setGapReport(missingCharges.length > 0 || zoneNote ? { missingCharges, zoneNote } : null);

      if (missingCharges.length === 0 && !zoneNote) {
        toast.success('Everything was found in your documents — review and save below.');
      } else {
        toast.success('Documents read — some details are still missing, see below.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Could not process your documents.';
      setUploadError(msg);
      setUploadStatus('failed');
    }
  };

  const dismissUploadStep = () => {
    setShowUploadStep(false);
    setUploadDismissed(true);
  };

  // A second entry point for the same upload+extract pipeline, right on the
  // Zone Rate Matrix step — asked for live 2026-09-22: "give user option to
  // upload zone prices and zone price matrix to auto fill this hectic shit
  // too". Reuses the exact same uploadFiles/runExtractionAndApply state as
  // the upload-first screen (it already merges into existing zoneLabels/
  // zoneRates rather than overwriting), just resets to a blank slate on open
  // so a stale success/gap-report from an earlier attempt doesn't linger.
  // Gated the same way as the upload-first screen — the extraction pipeline
  // needs a real session (withCredentials), which mid-signup users don't
  // have yet.
  const [showZoneUploadPanel, setShowZoneUploadPanel] = useState(false);
  const openZoneUploadPanel = () => {
    setUploadFiles([]);
    setUploadStatus('idle');
    setUploadError(null);
    setGapReport(null);
    setShowZoneUploadPanel(true);
  };

  const handleRateChange = (
    section: keyof PriceRate,
    field: keyof VariableFixed | keyof VariableFixedThreshold | null,
    e: ChangeEvent<HTMLInputElement>,
    max: number = FIELD_MAX.card
  ) => {
    const raw = e.target.valueAsNumber || 0;
    const val = Math.min(Math.max(raw, 0), max);
    setPriceRate(prev =>
      field
        ? { ...prev, [section]: { ...(typeof prev[section] === "object" && prev[section] !== null ? prev[section] : {}), [field]: val } }
        : { ...prev, [section]: val }
    );
  };

  // Zones only ever get ADDED (every document upload unions its zone labels
  // into the existing list, see mergeZonesInto) — this is the one removal
  // path, wired to a per-zone delete button on ZoneRateMatrix.
  const handleRemoveZone = (index: number) => {
    const removedLabel = zoneLabels[index];
    const next = removeZoneAt(index, zoneLabels, zoneRates, zonePincodeData);
    setZoneLabels(next.labels);
    setZoneRates(next.rates);
    setZonePincodeData(next.pincodeData);
    toast.success(`Removed zone "${removedLabel}"`);
  };

  // Creates the transporter record itself — the same call SignUpPage used to
  // make before navigating here. Deferred all the way to this final Save
  // step (see isPendingAiCreation) so nothing incomplete is ever written:
  // by the time this runs, background extraction has long since finished.
  // Reads formData from the draft SignUpPage continuously persists to
  // localStorage (transporter_onboarding_form_data) — AddPrice never had
  // its own copy of Page 1's form state.
  // Returns the exact companyName string that was submitted to addtransporter
  // on success (so the caller can use that same string for the immediately-
  // following /addprice call instead of the possibly-stale `transporterName`
  // state — see the sessionStorage.setItem below), or null on failure.
  const createPendingTransporter = async (): Promise<string | null> => {
    const rawFormData = localStorage.getItem('transporter_onboarding_form_data');
    if (!rawFormData) {
      toast.error("Your signup details were lost — please go back and start again.");
      return null;
    }
    let formData: Record<string, any>;
    try {
      formData = JSON.parse(rawFormData);
    } catch {
      toast.error("Your signup details were corrupted — please go back and start again.");
      return null;
    }

    // Zone *labels* can populate early from a partial extraction update while
    // the actual per-pincode `service` array (what addtransporter requires)
    // is still being computed in the background — checking zoneLabels alone
    // let this fire mid-extraction with neither a file nor `service` in the
    // request, which the backend 400s on. This function only ever runs for
    // the AI-deferred flow (isPendingAiCreation), so `service` is mandatory.
    const extractedService = localStorage.getItem('transporter_extracted_service');
    if (!extractedService) {
      toast.error("Still processing your uploaded documents — please wait a few seconds and try Save again.");
      return null;
    }

    const dataToSubmit = new FormData();
    // `networks` is an array — pulled out separately so the generic
    // Object.entries loop below (which does String(value) on everything)
    // doesn't comma-join it instead of JSON-encoding it the way the backend
    // expects (same fix as SignUpPage's submitTransporterData).
    const { stateName, networks, ...restOfData } = formData;
    Object.entries({ ...restOfData, state: stateName }).forEach(([key, value]) => {
      dataToSubmit.append(key, String(value));
    });
    dataToSubmit.append('zones', JSON.stringify(zoneLabels.filter(z => z.trim())));
    dataToSubmit.append('networks', JSON.stringify(Array.isArray(networks) && networks.length > 0 ? networks : ['independent']));
    dataToSubmit.append('service', extractedService);

    try {
      await axios.post(`${API_BASE_URL}/api/transporter/auth/addtransporter`, dataToSubmit, {
        headers: { Authorization: `Bearer ${token}` },
      });
      sessionStorage.setItem('transporter_signup_email', formData.email || '');
      sessionStorage.setItem('transporter_signup_phone', formData.phone || '');
      // Keep sessionStorage.companyName in sync with what was actually just
      // submitted — it can otherwise be stale from AI-extraction time (set
      // once during upload, never refreshed if the user edits the Company
      // Name field afterward), causing the very next /addprice call to look
      // up the transporter under the wrong Redis cache key and 404 with
      // "No transporter data in cache".
      sessionStorage.setItem('companyName', formData.companyName || '');
      localStorage.removeItem('transporter_pending_creation');
      return formData.companyName || '';
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Could not create your transporter account.");
      return null;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    if (!transporterName.trim()) { toast.error("Transporter name is missing."); return; }
    // Backstop — Next already blocks reaching this step with charges missing,
    // but this guards direct/programmatic submission too.
    if (!mandatoryChargesComplete) {
      setShowValidationErrors(true);
      toast.error(`Please fill in ${missingMandatoryFields.map(f => f.label).join(', ')} before saving.`);
      return;
    }
    isSubmittingRef.current = true;
    setLoading(true);

    const zr: Record<string, Record<string, number>> = {};
    zoneLabels.forEach((from, i) => {
      zr[from] = {};
      zoneLabels.forEach((to, j) => (zr[from][to] = zoneRates[i]?.[j] || 0));
    });

    // A returning, already-authenticated transporter saves through the new
    // session-based endpoint — the signup-only /auth/addprice below depends
    // on a Redis cache entry that only exists in the few seconds right after
    // addtransporter runs, and 404s "No transporter data in cache" for
    // anyone who logged in later than that (confirmed live 2026-09-22).
    if (isReturningTransporter) {
      try {
        await axios.put(`${API_BASE_URL}/api/transporter/auth/pricing`, {
          priceRate, zoneRates: zr, service: zonePincodeData,
        }, { withCredentials: true });
        toast.success('Pricing saved!');
        localStorage.removeItem('transporter_price_rate');
        localStorage.removeItem('transporter_zone_rates');
        localStorage.removeItem('transporter_extracted_price_rate');
        // Plain in-SPA navigation only — this is the SAME iframe/session
        // IframeNav already navigates within (Dashboard/Profile), not a
        // parent-frame handoff. `navigate_back` is a different, unrelated
        // message TransporterSignupPage.tsx's parent handler uses to reset
        // the iframe to the signup landing page — sending it here was wrong
        // and bounced a successful save to /transporter-signin instead of
        // /dashboard (caught live 2026-09-22).
        navigate('/dashboard');
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Save failed.');
        console.error(err);
      } finally {
        setLoading(false);
        isSubmittingRef.current = false;
      }
      return;
    }

    // For the AI-deferred flow, use the exact companyName string that was
    // just submitted to addtransporter — not the `transporterName` state,
    // which can be a stale snapshot from AI-extraction time (see
    // createPendingTransporter). Using the just-submitted value guarantees
    // this /addprice call's Redis cache lookup key matches what addtransporter
    // just cached under, instead of risking a "No transporter data in cache" 404.
    let companyNameForSubmit = transporterName;
    if (isPendingAiCreation) {
      const created = await createPendingTransporter();
      if (!created) {
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }
      companyNameForSubmit = created;
    }

    const payload = { companyName: companyNameForSubmit, priceRate, zoneRates: zr };
    try {
      await axios.post(`${API_BASE_URL}/api/transporter/auth/addprice`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Price configuration saved successfully!");
      // Clear all onboarding cache
      localStorage.removeItem('transporter_price_rate');
      localStorage.removeItem('transporter_zone_rates');
      localStorage.removeItem('transporter_onboarding_active_route');
      localStorage.removeItem('transporter_extracted_price_rate');
      localStorage.removeItem('transporter_onboarding_form_data');
      localStorage.removeItem('transporter_onboarding_current_step');
      localStorage.removeItem('transporter_onboarding_mode');
      localStorage.removeItem('transporter_pending_creation');
      localStorage.removeItem('transporter_ai_extraction_status');
      localStorage.removeItem('transporter_extracted_service');

      const email = sessionStorage.getItem('transporter_signup_email');
      const phone = sessionStorage.getItem('transporter_signup_phone');
      if (email) {
        // Sending both together means one shared OTP goes out to email and
        // phone at once, instead of VerifyOtpPage separately triggering its
        // own (different) phone code a moment later.
        await axios.post(`${API_BASE_URL}/api/transporter/auth/send-otp`, { email, phone: phone || undefined });
        navigate("/transporter-verify-otp");
      } else {
        // No email on hand (e.g. AddPrice opened directly) — fall back to manual sign-in.
        navigate("/transporter-signin");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Save failed.");
      console.error(err);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Only skip the manual matrix-entry step when AI supplied a COMPLETE matrix
  // (every origin zone has at least one real rate) — nothing left to fill in.
  // A partial extraction (e.g. only one origin zone's rates were found in the
  // source file) must still show the grid so the user can add the rest;
  // ZoneRateMatrix itself hides the all-zero rows by default in that case.
  const zoneRatesFullyPopulated = zoneRates.length > 0 && zoneRates.every(row => row.some(v => v > 0));
  const zoneRatesPartiallyPopulated = zoneRates.some(row => row.some(v => v > 0)) && !zoneRatesFullyPopulated;
  // At least one zone-rate cell must be filled before Save & Continue is allowed —
  // an all-zero/empty matrix has no pricing to submit.
  const hasAnyZoneRate = zoneRates.some(row => row.some(v => Number(v) > 0));
  const skipMatrixStep = wasAiPrefilled && zoneRatesFullyPopulated;
  const stepLabels = skipMatrixStep ? ['Charges', 'Review'] : ['Charges', 'Rates'];
  const lastStep = stepLabels.length - 1;

  // Same "no zones found" signal already used for the inline banner below
  // (aiExtractionStatus === 'failed' && zoneLabels.length === 0) — the
  // uploaded document had nothing usable (no pincodes/zones), so the Zone
  // Matrix step would just be an empty grid. Block Next and send them back
  // to re-upload instead of letting them stumble onto a blank step.
  const [showWrongDocModal, setShowWrongDocModal] = useState(false);
  const wrongDocumentUploaded = isPendingAiCreation && aiExtractionStatus === 'failed' && zoneLabels.length === 0;

  // Shared with the header Back button's step-0 behavior — restores the
  // onboarding flow to the upload screen instead of the very first step.
  const goBackToUpload = () => {
    localStorage.removeItem('transporter_onboarding_active_route');
    localStorage.setItem('transporter_onboarding_current_step', '1');
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'navigate_back' }, '*');
    } else {
      navigate(-1);
    }
  };

  const goNext = () => {
    // Backstop matching the Next button's own disabled state — guards any
    // other caller (not just the button click) against advancing mid-read.
    if (isPendingAiCreation && aiExtractionStatus === 'processing') return;
    if (step === 0 && !mandatoryChargesComplete) {
      setShowValidationErrors(true);
      toast.error(`Please fill in: ${missingMandatoryFields.map(f => f.label).join(', ')}`);
      return;
    }
    if (step === 0 && wrongDocumentUploaded) {
      setShowWrongDocModal(true);
      return;
    }
    setStep(s => Math.min(s + 1, lastStep));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  // Android hardware back button lives in the OUTER native app, which has no
  // idea this multi-step wizard exists — every step transition here is pure
  // React state, no URL/history change at any level. Without this, pressing
  // back mid-wizard found nothing in the outer app's own history and showed
  // "Exit FreightCompare?" instead of stepping back a page. Reported live
  // 2026-09-22. See transporterIframeBackBridge.ts in the main app repo for
  // the other half of this — it asks us first, before touching its own
  // history or showing that dialog.
  useEffect(() => {
    const canGoBackHere = showZoneUploadPanel || step > 0 || (isReturningTransporter && (showUploadStep || step === 0));
    window.parent?.postMessage({ type: 'transporter_iframe_nav_state', canGoBack: canGoBackHere }, '*');
  }, [showZoneUploadPanel, step, isReturningTransporter, showUploadStep]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'transporter_iframe_consume_back') return;
      if (showZoneUploadPanel) { setShowZoneUploadPanel(false); return; }
      if (step > 0) { goBack(); return; }
      if (isReturningTransporter) { navigate('/dashboard'); return; }
      goBackToUpload();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showZoneUploadPanel, step, isReturningTransporter]);

  const renderStepper = () => (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {stepLabels.map((label, idx) => (
        <div key={label} className="flex items-center gap-1.5">
          {idx > 0 && <div className="h-px w-4 bg-slate-200" />}
          <div className="flex items-center gap-1">
            <span
              className={`w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0 transition-colors
                ${idx === step ? 'bg-blue-600 text-white' : idx < step ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}
            >
              {idx + 1}
            </span>
            <span className={`text-sm font-semibold hidden sm:inline ${idx === step ? 'text-blue-700' : 'text-slate-400'}`}>{label}</span>
          </div>
        </div>
      ))}
    </div>
  );

  // ── UnitSelect Component ───────────────────────────────────────
  // Controlled — driving Fixed/Variable enablement for its row. `readOnly`
  // rows (pure KG thresholds) render a static label instead of a dropdown.
  // "PER KG" is a Fixed-rate billing mode too (₹ per kg rather than a flat
  // ₹ amount) — only "% ON BASE" switches the row over to Variable.
  const UnitSelect = ({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) => (
    readOnly ? (
      <span className="block text-center text-slate-400 font-semibold text-[11px]">{value}</span>
    ) : (
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full bg-transparent text-slate-500 font-semibold text-[11px] border border-transparent hover:border-slate-200 rounded py-1 px-0 text-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
        style={{ textAlignLast: 'center' }}
      >
        <option value="FLAT">FLAT</option>
        <option value="PER KG">PER KG</option>
        <option value="% ON BASE">% ON BASE</option>
      </select>
    )
  );

  const setUnit = (key: string, value: string) =>
    setUnitMode(prev => ({ ...prev, [key]: value as 'FLAT' | 'PER KG' | '% ON BASE' }));

  // Plain white — the input is always editable, so it shouldn't look greyed
  // out/disabled. The active column is still distinguished from the inactive
  // one purely by the inactive side collapsing to a plain dash below.
  const cellInputClass =
    "w-16 mx-auto block p-0.5 text-center border border-slate-200 rounded-md font-medium transition-colors text-xs bg-white hover:border-slate-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-500";
  const inactiveCell = <span className="block text-center text-slate-300 text-xs">—</span>;

  // Shared row renderer for every FLAT/PER KG/%-ON-BASE charge — only the
  // column matching the row's selected unit is editable.
  const renderChargeRow = (
    key: keyof PriceRate,
    label: string,
    opts?: { icon?: React.ReactNode; indent?: boolean }
  ) => {
    const unit = unitMode[key as string] ?? 'FLAT';
    const isVariable = unit === '% ON BASE';
    const data = priceRate[key] as unknown as VariableFixed;
    const max = CHARGE_MAX[key as string] ?? { fixed: 1000, variable: 100 };
    const isMandatory = MANDATORY_CHARGE_FIELDS.some(f => f.key === key);
    const isMissing = showValidationErrors && isMandatory && missingMandatoryFields.some(f => f.key === key);
    return (
      <tr key={key as string} className={`hover:bg-slate-50/50 transition-colors ${isMissing ? 'bg-red-50/60' : ''}`}>
        <td className={`p-0.5 border-r border-slate-200 font-medium text-slate-700 text-xs uppercase tracking-wide ${opts?.indent ? 'pl-5' : 'pl-3 flex items-center gap-1.5'}`}>
          {opts?.icon}{label}
          {isMandatory && <span className={isMissing ? 'text-red-600 font-bold' : 'text-red-500'} title="Required">*</span>}
        </td>
        <td className="p-0.5 border-r border-slate-200">
          {isVariable ? inactiveCell : (
            <input
              type="number" min={0} max={max.fixed}
              className={cellInputClass} placeholder="-"
              value={data?.fixed || ""}
              onChange={e => handleRateChange(key, "fixed", e, max.fixed)}
            />
          )}
        </td>
        <td className="p-0.5 border-r border-slate-200">
          {!isVariable ? inactiveCell : (
            <input
              type="number" step="0.01" min={0} max={max.variable}
              className={cellInputClass} placeholder="-"
              value={data?.variable || ""}
              onChange={e => handleRateChange(key, "variable", e, max.variable)}
            />
          )}
        </td>
        <td className="p-0.5">
          <UnitSelect value={unit} onChange={(v) => setUnit(key as string, v)} />
        </td>
      </tr>
    );
  };

  // ── Upload-first screen (returning transporter only) ──────────────────────
  // Shown before the manual charges table — offer to read documents first,
  // fall back to manual entry only if they have none, and if extraction came
  // back partial, name exactly what's still missing rather than silently
  // dumping them into the full table.
  if (showUploadStep) {
    /* pb-24 below clears IframeNav's fixed bottom bar (measured ~65px live) —
       this div IS the page's own min-h-screen root, so padding added here
       stays inside what useReportIframeHeight already measures. A wrapper
       OUTSIDE a min-h-screen div is what caused the earlier runaway-resize
       regression (see MainLayout.tsx's comment) — this isn't that. Found
       live 2026-09-22: the Continue button sat under the fixed nav with no
       further scroll room to reach it. */
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#08141f] font-sans py-4 px-4 pb-24">
        <div className="container mx-auto max-w-xl">
          <div className="bg-white dark:bg-[#0d2438] rounded-2xl shadow-lg border border-slate-200/60 dark:border-[#1d3f5c] p-5 sm:p-6">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Add your routes & rates</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">
              Upload your rate card, zone/pincode coverage sheet, or serviceability doc — PDF, Excel, CSV, Word, or photos of the papers all work.
              We'll read them and fill in the rest for you. If anything's missing or unclear, we'll tell you exactly what — so you can add it yourself or upload another document that covers it.
            </p>

            {uploadStatus !== 'processing' && (
              <>
                <div
                  className="mt-4 border-2 border-dashed border-slate-300 dark:border-[#1d3f5c] rounded-xl p-5 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  onClick={() => uploadFileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); if (e.dataTransfer.files) addUploadFiles(e.dataTransfer.files); }}
                >
                  <Upload size={24} className="mx-auto text-slate-400 dark:text-[#6f93b8]" />
                  <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-white">Tap to choose files, or drag them here</p>
                  <p className="text-xs text-slate-400 dark:text-[#6f93b8] mt-0.5">Up to {MAX_UPLOAD_FILES} files, 10 MB each</p>
                  <input
                    ref={uploadFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept={Array.from(ACCEPTED_EXTENSIONS).join(',')}
                    onChange={e => { if (e.target.files) addUploadFiles(e.target.files); e.target.value = ''; }}
                  />
                </div>

                {uploadFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {uploadFiles.map(f => (
                      <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-[#1d3f5c] rounded-lg">
                        <span className="text-xs font-medium text-slate-700 dark:text-white truncate">{f.file.name}</span>
                        <button type="button" onClick={() => removeUploadFile(f.id)} className="text-slate-400 dark:text-[#6f93b8] hover:text-red-500 flex-shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadError && (
                  <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">{uploadError}</p>
                )}

                <button
                  type="button"
                  onClick={runExtractionAndApply}
                  disabled={uploadFiles.length === 0}
                  className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                >
                  <Sparkles size={15} /> Read my documents
                </button>

                <button
                  type="button"
                  onClick={dismissUploadStep}
                  className="mt-2 w-full text-center text-xs font-semibold text-slate-400 dark:text-[#6f93b8] hover:text-slate-600 dark:hover:text-[#8fb0cf] py-1.5"
                >
                  I don't have documents — enter details manually
                </button>
              </>
            )}

            {uploadStatus === 'processing' && (
              <div className="mt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
                  <Loader2 className="animate-spin" size={16} /> Reading your documents…
                </div>
                <div className="mt-2 bg-slate-900 dark:bg-black rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-0.5">
                  {uploadLogs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </div>
            )}

            {uploadStatus === 'success' && (
              <div className="mt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
                  <CheckCircle2 size={16} /> Documents read
                </div>

                {gapReport ? (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-semibold">Here's what's still missing:</p>
                    {gapReport.missingCharges.length > 0 && (
                      <p>Charges not found: {gapReport.missingCharges.join(', ')}.</p>
                    )}
                    {gapReport.zoneNote && <p>{gapReport.zoneNote}</p>}
                    <p className="text-xs opacity-90">Upload another document covering these, or continue and fill them in yourself below.</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-[#8fb0cf]">Everything we needed was found — review the numbers on the next screen before saving.</p>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setUploadStatus('idle'); setUploadFiles([]); }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white font-semibold text-sm rounded-lg transition-colors"
                  >
                    <Upload size={14} /> Upload more documents
                  </button>
                  <button
                    type="button"
                    onClick={dismissUploadStep}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
                  >
                    Continue <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main Charges Configuration Form ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans py-1 sm:py-2">
      <div className="container mx-auto px-4 max-w-7xl space-y-2">

        {/* Header: back, title, stepper, next — all in one row */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 mb-2 px-1 py-1"
        >
          <button
            type="button"
            onClick={() => {
              // Step 0's Back leaves this page entirely (back to signup); on later
              // steps it just goes to the previous step, same as every other back
              // button in this onboarding flow.
              if (step > 0) { goBack(); return; }
              goBackToUpload();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft size={15} /> Back
          </button>

          <div className="flex items-center gap-3 flex-1 justify-center min-w-0">
            {/* On mobile the "— for CompanyName" subtitle is dropped rather than
                squeezed — a shrinking min-w-0 wrapper let the title's own text
                overflow past its allotted space and visually collide with the
                Next button (no ellipsis, since overflow was visible not hidden).
                Title alone always fits at any width; the company name is
                still available via the title="" tooltip attribute below. */}
            <div className="flex items-baseline gap-1.5 min-w-0" title={transporterName || undefined}>
              {/* whitespace-nowrap alone (no truncate) let the title render at
                  full width regardless of how little space the flex row left
                  it — fine against the short "Next" button this was tuned
                  against, but "Save & Continue" (the last step's button,
                  longer text) leaves less room and the title visibly
                  overlapped it. Reported live 2026-09-22 with a screenshot:
                  "save and continue is getting iced with price config...
                  just below header". truncate+min-w-0 lets it ellipsis
                  instead of overflowing when space is actually tight. */}
              <h1 className="text-base font-semibold text-slate-900 truncate min-w-0">Price Configuration</h1>
              <span className="hidden sm:inline text-sm text-slate-300 flex-shrink-0">—</span>
              <span className="hidden sm:inline text-base text-slate-500 truncate">
                for <span className="font-bold text-blue-600">{transporterName || "your new transporter"}</span>
              </span>
            </div>
            <div className="hidden md:block h-4 w-px bg-slate-200 flex-shrink-0" />
            <div className="hidden md:flex flex-shrink-0">{renderStepper()}</div>
            {wasAiPrefilled && (
              <div
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #0f2027, #1a3a4a)', border: '1px solid #1e4060' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <Sparkles size={11} className="text-blue-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-white whitespace-nowrap">AI Pre-filled</span>
              </div>
            )}
          </div>

          {step !== lastStep ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Sits directly left of the Next/Reading button instead of its
                  own centered line below the header, so the two read as one
                  unit: what's happening + the button it's blocking. */}
              {isPendingAiCreation && aiExtractionStatus === 'processing' && (
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-lg">
                  <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
                  <span className="text-[11px] font-semibold text-blue-800 whitespace-nowrap">Reading your documents…</span>
                </div>
              )}
              <button
                key="next-btn"
                type="button"
                onClick={goNext}
                disabled={isPendingAiCreation && aiExtractionStatus === 'processing'}
                title={isPendingAiCreation && aiExtractionStatus === 'processing' ? 'Still reading your documents — please wait' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-md shadow-blue-500/20 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
              >
                {isPendingAiCreation && aiExtractionStatus === 'processing'
                  ? <><Loader2 className="animate-spin" size={15} />Reading...</>
                  : <>Next <ArrowRight size={15} /></>
                }
              </button>
            </div>
          ) : (
            <button
              key="submit-btn"
              type="submit"
              form="addPriceForm"
              disabled={loading || !hasAnyZoneRate}
              title={!hasAnyZoneRate ? 'Fill at least one zone rate cell before continuing' : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-md shadow-blue-500/20 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            >
              {loading
                ? <><Loader2 className="animate-spin" size={15} />Saving...</>
                : <><FileText size={15} /> Save & Continue</>
              }
            </button>
          )}
        </motion.div>

        {/* Only appears after a blocked Next/Save attempt — never shown proactively. */}
        {showValidationErrors && !mandatoryChargesComplete && (
          <p className="text-xs text-red-600 text-center -mt-1 mb-1">
            Required before you can continue: {missingMandatoryFields.map(f => f.label).join(', ')}
          </p>
        )}

        {/* Stepper on its own line for small screens */}
        <div className="flex md:hidden justify-center mb-1">{renderStepper()}</div>

        {/* Background extraction status — mobile-only fallback; sm+ screens
            show this inline to the left of the Next/Reading button instead
            (see the header row above). */}
        {isPendingAiCreation && aiExtractionStatus === 'processing' && (
          <div className="sm:hidden mx-auto max-w-fit flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
            <span className="text-xs font-semibold text-blue-800">Still reading your documents in the background…</span>
          </div>
        )}
        {isPendingAiCreation && aiExtractionStatus === 'failed' && zoneLabels.length === 0 && (
          <div className="mx-auto max-w-fit flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-xs font-semibold text-amber-800">
              Couldn't find service zones in your documents — go Back to upload a file, or add them manually before saving.
            </span>
          </div>
        )}

        {/* AI Pre-fill banner — shown inline in the header on lg+ screens now;
            this stacked version only appears below that, where the header row
            wraps and there's no room for the inline badge. */}
        {wasAiPrefilled && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:hidden rounded-lg overflow-hidden mx-auto max-w-fit"
            style={{ background: 'linear-gradient(135deg, #0f2027, #1a3a4a)', border: '1px solid #1e4060' }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <Sparkles size={12} className="text-blue-400 flex-shrink-0" />
              <span className="text-xs font-bold text-white">Charges Pre-filled by AI Extraction</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-semibold"
                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
              >
                Review & edit all values before submitting
              </span>
            </div>
          </motion.div>
        )}

        <form id="addPriceForm" onSubmit={handleSubmit} className="space-y-2">

          {/* Step 1: Unified Price Configuration Table */}
          {step === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="max-w-5xl mx-auto">
            <Card className="p-0 overflow-hidden border-0 shadow-lg">
              {/* Unified Table — min-w-[560px] means this always overflows a
                  phone-width screen. The scroll itself works, but nothing told
                  a first-time user two required columns (Variable %, Unit)
                  were hidden off to the right — this fade + hint makes that
                  visible instead of silently failing validation later. */}
              <div className="relative">
                <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[560px]">
                  <thead className="bg-[#f8fafc] text-slate-500 text-xs tracking-wider uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-1 border-r border-slate-200 w-[32%]">Charge</th>
                      <th className="p-1 border-r border-slate-200 w-[16%] text-center">Fixed (₹)</th>
                      <th className="p-1 border-r border-slate-200 w-[16%] text-center">Variable (%)</th>
                      <th className="p-1 w-[36%] text-center">Unit / Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {/* BASIC CHARGES HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-3 py-0.5 text-xs font-semibold text-slate-600 uppercase tracking-wider border-y border-slate-200">Basic Charges</td>
                    </tr>

                    {renderChargeRow("docketCharges", "Docket Charges", { icon: <Package size={13} className="text-blue-500"/> })}
                    {renderChargeRow("fuel", "Fuel Surcharge", { icon: <Percent size={13} className="text-blue-500"/> })}

                    {/* Min Chargeable Weight — pure KG threshold, no fixed/variable duality */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-0.5 border-r border-slate-200 font-medium text-slate-700 pl-3 flex items-center gap-1.5 text-xs uppercase tracking-wide"><Weight size={13} className="text-blue-500"/> Min Chargeable Wt</td>
                      <td className="p-0.5 border-r border-slate-200">
                        <input type="number" min={0} max={FIELD_MAX.minWeight} className="w-16 mx-auto block p-0.5 text-center border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium transition-colors bg-transparent placeholder-slate-300 text-xs" placeholder="-" value={priceRate.minWeight || ""} onChange={(e) => handleRateChange("minWeight", null, e, FIELD_MAX.minWeight)} />
                      </td>
                      <td className="p-0.5 border-r border-slate-200">
                        <input type="number" disabled className="w-16 mx-auto block p-0.5 text-center border border-transparent rounded-md font-medium bg-slate-50 text-slate-300 cursor-not-allowed text-xs" placeholder="-" />
                      </td>
                      <td className="p-0.5">
                        <UnitSelect value="KG" readOnly />
                      </td>
                    </tr>

                    {renderChargeRow("minCharges", "Minimum Charges", { icon: <DollarSign size={13} className="text-blue-500"/> })}
                    {renderChargeRow("gstPct", "GST %", { icon: <Percent size={13} className="text-blue-500"/> })}

                    {/* ADDITIONAL CHARGES HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-3 py-0.5 text-xs font-semibold text-slate-600 uppercase tracking-wider border-y border-slate-200">Additional Charges</td>
                    </tr>

                    {renderChargeRow("rovCharges", "ROV / FOV Charges", { indent: true })}
                    {renderChargeRow("odaCharges", "ODA Charges", { indent: true })}
                    {renderChargeRow("handlingCharges", "Handling Charges", { indent: true })}

                    {/* Weight Threshold — pure KG value tied to Handling, no fixed/variable duality */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-0.5 border-r border-slate-200 font-medium text-slate-400 pl-6 text-xs uppercase tracking-wide">› Weight Threshold</td>
                      <td className="p-0.5 border-r border-slate-200">
                        <input type="number" min={0} max={FIELD_MAX.minWeight} placeholder="-" className="w-16 mx-auto block p-0.5 text-center border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium transition-colors bg-transparent placeholder-slate-300 text-xs" value={(priceRate.handlingCharges as any)?.threshholdweight || ""} onChange={e => handleRateChange("handlingCharges", "threshholdweight", e, FIELD_MAX.minWeight)} />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input type="number" disabled className="w-full p-1 text-center border border-transparent rounded-md font-medium bg-slate-50 text-slate-300 cursor-not-allowed text-xs" placeholder="-" />
                      </td>
                      <td className="p-1">
                        <UnitSelect value="KG" readOnly />
                      </td>
                    </tr>

                    {renderChargeRow("greenTax", "Green Tax / NGT", { indent: true })}
                    {renderChargeRow("hamaliCharges", "Hamali Charges", { indent: true })}
                    {renderChargeRow("miscellanousCharges", "MISC / AOC Charges", { indent: true })}

                    {/* Volumetric Divisor — one field driving both priceRate.divisor and
                        priceRate.kFactor. The backend schema keeps them as two separate
                        fields (legacy), but both default to 5000 and represent the same
                        "L×W×H ÷ this = volumetric KG" concept in this UI, so a vendor
                        should only ever have to enter it once. Last row in Additional
                        Charges, not tucked away in Optional. */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-1 border-r border-slate-200 font-medium text-slate-700 pl-4 flex items-center gap-2 text-xs">
                        <Scale size={15} className="text-blue-500"/> Volumetric Divisor
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="number" min={0} max={NUMBER_FIELD_MAX.divisor}
                          className={cellInputClass} placeholder="-"
                          value={priceRate.divisor || ""}
                          onChange={(e) => {
                            const raw = e.target.valueAsNumber || 0;
                            const val = Math.min(Math.max(raw, 0), NUMBER_FIELD_MAX.divisor);
                            setPriceRate(prev => ({ ...prev, divisor: val, kFactor: val }));
                          }}
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">{inactiveCell}</td>
                      <td className="p-1">
                        <UnitSelect value="L×W×H ÷ N" readOnly />
                      </td>
                    </tr>

                    {/* OPTIONAL CHARGES — collapsed by default, click to expand */}
                    <tr
                      className="bg-slate-50/80 cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
                      onClick={() => setShowOptional(o => !o)}
                    >
                      <td colSpan={4} className="px-3 py-1 text-xs font-semibold text-slate-600 uppercase tracking-wider border-y border-slate-200">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronDown size={13} className={`transition-transform ${showOptional ? '' : '-rotate-90'}`} />
                          Optional Charges
                        </span>
                      </td>
                    </tr>

                    {showOptional && (
                      <>
                        {renderChargeRow("topayCharges", "To-Pay Charges", { indent: true })}
                        {renderChargeRow("codCharges", "COD / DOD Charges", { indent: true })}
                        {renderChargeRow("daccCharges", "DACC Charges", { indent: true })}
                        {renderChargeRow("insuaranceCharges", "Insurance Charges", { indent: true })}
                        {renderChargeRow("prepaidCharges", "Prepaid Charges", { indent: true })}
                        {renderChargeRow("fmCharges", "FM (First-Mile) Charges", { indent: true })}
                        {renderChargeRow("appointmentCharges", "Appointment Charges", { indent: true })}

                        {/* Cheque Handling — plain ₹ value, no fixed/variable duality */}
                        <tr className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-1 border-r border-slate-200 font-medium text-slate-700 pl-6 text-xs">Cheque Handling Charges</td>
                          <td className="p-1 border-r border-slate-200">
                            <input type="number" min={0} max={NUMBER_FIELD_MAX.chequeHandlingCharges} className="w-full p-1 text-center border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium transition-colors bg-transparent placeholder-slate-300 text-xs" placeholder="-" value={priceRate.chequeHandlingCharges || ""} onChange={(e) => handleRateChange("chequeHandlingCharges", null, e, NUMBER_FIELD_MAX.chequeHandlingCharges)} />
                          </td>
                          <td className="p-1 border-r border-slate-200">
                            <input type="number" disabled className="w-full p-1 text-center border border-transparent rounded-md font-medium bg-slate-50 text-slate-300 cursor-not-allowed text-xs" placeholder="-" />
                          </td>
                          <td className="p-1">
                            <UnitSelect value="FLAT" readOnly />
                          </td>
                        </tr>

                      </>
                    )}

                  </tbody>
                </table>
                </div>
                <div className="sm:hidden pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent" aria-hidden="true" />
                <div className="sm:hidden flex items-center justify-center gap-1 py-1 text-[10px] font-semibold text-slate-400 bg-slate-50/80 border-t border-slate-100">
                  <ArrowLeft size={10} className="rotate-180" /> Swipe table to see Variable % and Unit columns
                </div>
              </div>
            </Card>
          </motion.div>
          )}

          {/* Zone Rate Matrix — skipped entirely when AI already supplied zone rates.
              Shown on the same "Rates" step as Review below, not as its own step. */}
          {!skipMatrixStep && step === 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              {zoneRatesPartiallyPopulated && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Only one origin zone's rates were found in the uploaded file — the source sheet appears to list a single
                    per-destination-zone price list rather than a full zone-to-zone matrix. Please review and fill in the
                    remaining rows below.
                  </span>
                </div>
              )}

              {isReturningTransporter && (
                <div className="mb-3">
                  {!showZoneUploadPanel ? (
                    <button
                      type="button"
                      onClick={openZoneUploadPanel}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                    >
                      <Upload size={14} /> Upload a zone/pincode rate sheet to auto-fill
                    </button>
                  ) : (
                    <div className="bg-white dark:bg-[#0d2438] rounded-xl border border-slate-200/60 dark:border-[#1d3f5c] p-4">
                      {uploadStatus !== 'processing' && uploadStatus !== 'success' && (
                        <>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <p className="text-sm font-semibold text-slate-700 dark:text-white">Upload zone rates or a pincode/zone coverage sheet</p>
                            <button type="button" onClick={() => setShowZoneUploadPanel(false)} className="text-slate-400 dark:text-[#6f93b8] hover:text-slate-600 dark:hover:text-[#8fb0cf] flex-shrink-0">
                              <X size={16} />
                            </button>
                          </div>
                          <div
                            className="border-2 border-dashed border-slate-300 dark:border-[#1d3f5c] rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                            onClick={() => zoneUploadFileInputRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); if (e.dataTransfer.files) addUploadFiles(e.dataTransfer.files); }}
                          >
                            <Upload size={20} className="mx-auto text-slate-400 dark:text-[#6f93b8]" />
                            <p className="mt-1.5 text-sm font-semibold text-slate-700 dark:text-white">Tap to choose files, or drag them here</p>
                            <input
                              ref={zoneUploadFileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              accept={Array.from(ACCEPTED_EXTENSIONS).join(',')}
                              onChange={e => { if (e.target.files) addUploadFiles(e.target.files); e.target.value = ''; }}
                            />
                          </div>
                          {uploadFiles.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {uploadFiles.map(f => (
                                <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-[#1d3f5c] rounded-lg">
                                  <span className="text-xs font-medium text-slate-700 dark:text-white truncate">{f.file.name}</span>
                                  <button type="button" onClick={() => removeUploadFile(f.id)} className="text-slate-400 dark:text-[#6f93b8] hover:text-red-500 flex-shrink-0">
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {uploadError && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{uploadError}</p>}
                          <button
                            type="button"
                            onClick={runExtractionAndApply}
                            disabled={uploadFiles.length === 0}
                            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg transition-colors"
                          >
                            <Sparkles size={14} /> Read this document
                          </button>
                        </>
                      )}
                      {uploadStatus === 'processing' && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
                          <Loader2 className="animate-spin" size={16} /> Reading your document…
                        </div>
                      )}
                      {uploadStatus === 'success' && (
                        <>
                          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
                            <CheckCircle2 size={16} /> Document read — zone rates below updated where found
                          </div>
                          {gapReport?.zoneNote && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{gapReport.zoneNote}</p>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowZoneUploadPanel(false)}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white font-semibold text-sm rounded-lg transition-colors"
                          >
                            Done
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <Card>
                <ZoneRateMatrix
                  zoneLabels={zoneLabels}
                  zoneRates={zoneRates}
                  onRatesChange={setZoneRates}
                  onRemoveZone={handleRemoveZone}
                  title="Zone-to-Zone Rates"
                  subtitle={<>Per-kilogram rate between each zone — use <strong>Bulk Paste</strong> to import from Excel.</>}
                />
              </Card>
            </motion.div>
          )}

          {/* Final step: Review (Zone Summary — shown after the matrix, per the requested order) — Save & Continue lives in the header */}
          {step === lastStep && zonePincodeData.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <ZoneSummaryPanel pincodeData={zonePincodeData} />
              </Card>
            </motion.div>
          )}

        </form>
      </div>

      {/* Wrong-document block — the uploaded file had no usable data (no
          pincodes/zones), so the Zone Matrix step would just be empty. Hard
          block per product decision: no "enter manually" escape hatch, since
          without any pincode data there's nothing to build a manual matrix
          from either — the only real fix is re-uploading a correct file. */}
      <AnimatePresence>
        {showWrongDocModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Wrong document uploaded</h3>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                We couldn't find any usable data in your uploaded file — no pincodes, zones, or serviceability info. Please go back and upload the correct document.
              </p>
              <button
                type="button"
                onClick={goBackToUpload}
                className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
              >
                <ArrowLeft size={15} /> Go Back &amp; Re-upload
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
