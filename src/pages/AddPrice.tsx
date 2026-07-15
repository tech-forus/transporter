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
        hasExtractedZoneRates = Array.isArray(parsed) && parsed.some((row: number[]) => row.some(v => v > 0));
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

  // Persist zone rates to localStorage
  useEffect(() => {
    if (zoneRates && zoneRates.length > 0) {
      localStorage.setItem('transporter_zone_rates', JSON.stringify(zoneRates));
    }
  }, [zoneRates]);

  // Announce readiness to parent so it can push UTSF prefill via postMessage
  useEffect(() => {
    window.parent.postMessage({ type: 'addprice_ready' }, '*');
  }, []);

  useReportIframeHeight([step, wasAiPrefilled, zoneLabels.length]);

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
        if (savedRates) {
          const parsedRates = JSON.parse(savedRates);
          if (Array.isArray(parsedRates) && parsedRates.length === arr.length) {
            setZoneRates(parsedRates);
          } else {
            setZoneRates(arr.map(() => arr!.map(() => 0)));
          }
        } else {
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
    const { stateName, ...restOfData } = formData;
    Object.entries({ ...restOfData, state: stateName }).forEach(([key, value]) => {
      dataToSubmit.append(key, String(value));
    });
    dataToSubmit.append('zones', JSON.stringify(zoneLabels.filter(z => z.trim())));
    dataToSubmit.append('service', extractedService);

    try {
      await axios.post(`${API_BASE_URL}/api/transporter/auth/addtransporter`, dataToSubmit, {
        headers: { Authorization: `Bearer ${token}` },
      });
      sessionStorage.setItem('transporter_signup_email', formData.email || '');
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

    const zr: Record<string, Record<string, number>> = {};
    zoneLabels.forEach((from, i) => {
      zr[from] = {};
      zoneLabels.forEach((to, j) => (zr[from][to] = zoneRates[i]?.[j] || 0));
    });
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
      if (email) {
        await axios.post(`${API_BASE_URL}/api/transporter/auth/send-otp`, { email });
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
    "w-full p-1 text-center border border-slate-200 rounded-md font-medium transition-colors text-xs bg-white hover:border-slate-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-500";
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
        <td className={`p-1 border-r border-slate-200 font-medium text-slate-700 text-xs ${opts?.indent ? 'pl-6' : 'pl-4 flex items-center gap-2'}`}>
          {opts?.icon}{label}
          {isMandatory && <span className={isMissing ? 'text-red-600 font-bold' : 'text-red-500'} title="Required">*</span>}
        </td>
        <td className="p-1 border-r border-slate-200">
          {isVariable ? inactiveCell : (
            <input
              type="number" min={0} max={max.fixed}
              className={cellInputClass} placeholder="-"
              value={data?.fixed || ""}
              onChange={e => handleRateChange(key, "fixed", e, max.fixed)}
            />
          )}
        </td>
        <td className="p-1 border-r border-slate-200">
          {!isVariable ? inactiveCell : (
            <input
              type="number" step="0.01" min={0} max={max.variable}
              className={cellInputClass} placeholder="-"
              value={data?.variable || ""}
              onChange={e => handleRateChange(key, "variable", e, max.variable)}
            />
          )}
        </td>
        <td className="p-1">
          <UnitSelect value={unit} onChange={(v) => setUnit(key as string, v)} />
        </td>
      </tr>
    );
  };

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

          <div className="flex items-center gap-4 flex-1 justify-center min-w-0">
            <div className="flex items-baseline gap-1.5 min-w-0 whitespace-nowrap overflow-hidden">
              <h1 className="text-base font-semibold text-slate-900">Price Configuration</h1>
              <span className="text-sm text-slate-300">—</span>
              <span className="text-sm text-slate-500 truncate">
                for <span className="font-semibold text-blue-600">{transporterName || "your new transporter"}</span>
              </span>
            </div>
            <div className="hidden md:block h-4 w-px bg-slate-200 flex-shrink-0" />
            <div className="hidden md:flex">{renderStepper()}</div>
          </div>

          {step !== lastStep ? (
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
          ) : (
            <button
              key="submit-btn"
              type="submit"
              form="addPriceForm"
              disabled={loading}
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

        {/* Background extraction status — small and unobtrusive, mirrors the
            indicator on the upload page. Only relevant while vendor creation
            is still deferred (see isPendingAiCreation above). */}
        {isPendingAiCreation && aiExtractionStatus === 'processing' && (
          <div className="mx-auto max-w-fit flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
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

        {/* AI Pre-fill banner */}
        {wasAiPrefilled && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg overflow-hidden mx-auto max-w-fit"
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
              {/* Unified Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[700px]">
                  <thead className="bg-[#f8fafc] text-slate-500 text-xs tracking-wider uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-1.5 border-r border-slate-200 w-1/3">Charge</th>
                      <th className="p-1.5 border-r border-slate-200 w-1/5 text-center">Fixed (₹)</th>
                      <th className="p-1.5 border-r border-slate-200 w-1/5 text-center">Variable (%)</th>
                      <th className="p-1.5 w-1/5 text-center">Unit / Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {/* BASIC CHARGES HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-3 py-1 text-xs font-semibold text-slate-600 uppercase tracking-wider border-y border-slate-200">Basic Charges</td>
                    </tr>

                    {renderChargeRow("docketCharges", "Docket Charges", { icon: <Package size={15} className="text-blue-500"/> })}
                    {renderChargeRow("fuel", "Fuel Surcharge", { icon: <Percent size={15} className="text-blue-500"/> })}

                    {/* Min Chargeable Weight — pure KG threshold, no fixed/variable duality */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-1 border-r border-slate-200 font-medium text-slate-700 pl-4 flex items-center gap-2 text-xs"><Weight size={15} className="text-blue-500"/> Min Chargeable Wt</td>
                      <td className="p-1 border-r border-slate-200">
                        <input type="number" min={0} max={FIELD_MAX.minWeight} className="w-full p-1 text-center border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium transition-colors bg-transparent placeholder-slate-300 text-xs" placeholder="-" value={priceRate.minWeight || ""} onChange={(e) => handleRateChange("minWeight", null, e, FIELD_MAX.minWeight)} />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input type="number" disabled className="w-full p-1 text-center border border-transparent rounded-md font-medium bg-slate-50 text-slate-300 cursor-not-allowed text-xs" placeholder="-" />
                      </td>
                      <td className="p-1">
                        <UnitSelect value="KG" readOnly />
                      </td>
                    </tr>

                    {renderChargeRow("minCharges", "Minimum Charges", { icon: <DollarSign size={15} className="text-blue-500"/> })}
                    {renderChargeRow("gstPct", "GST %", { icon: <Percent size={15} className="text-blue-500"/> })}

                    {/* ADDITIONAL CHARGES HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-3 py-1 text-xs font-semibold text-slate-600 uppercase tracking-wider border-y border-slate-200">Additional Charges</td>
                    </tr>

                    {renderChargeRow("rovCharges", "ROV / FOV Charges", { indent: true })}
                    {renderChargeRow("odaCharges", "ODA Charges", { indent: true })}
                    {renderChargeRow("handlingCharges", "Handling Charges", { indent: true })}

                    {/* Weight Threshold — pure KG value tied to Handling, no fixed/variable duality */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-1 border-r border-slate-200 font-medium text-slate-400 pl-8 text-xs">› Weight Threshold</td>
                      <td className="p-1 border-r border-slate-200">
                        <input type="number" min={0} max={FIELD_MAX.minWeight} placeholder="-" className="w-full p-1 text-center border border-transparent hover:border-slate-200 focus:border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium transition-colors bg-transparent placeholder-slate-300 text-xs" value={(priceRate.handlingCharges as any)?.threshholdweight || ""} onChange={e => handleRateChange("handlingCharges", "threshholdweight", e, FIELD_MAX.minWeight)} />
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
            </Card>
          </motion.div>
          )}

          {/* Zone Rate Matrix — skipped entirely when AI already supplied zone rates.
              Shown on the same "Rates" step as Review below, not as its own step. */}
          {!skipMatrixStep && step === 1 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <ZoneRateMatrix
                  zoneLabels={zoneLabels}
                  zoneRates={zoneRates}
                  onRatesChange={setZoneRates}
                  title="Zone-to-Zone Rates"
                  subtitle={<>Per-kilogram rate between each zone — use <strong>Bulk Paste</strong> to import from Excel.</>}
                  hideEmptyRowsByDefault={wasAiPrefilled && zoneRatesPartiallyPopulated}
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
