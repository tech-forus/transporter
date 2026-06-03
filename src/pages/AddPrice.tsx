import { useState, useEffect, ChangeEvent, FormEvent } from "react";
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
  SlidersHorizontal,
  Package,
  Cog,
  BotMessageSquare,
  Save,
  Loader2,
  Scale,
  ArrowLeft,
  FileText,
  CheckCircle,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Cookies from "js-cookie";
import ZoneRateMatrix from "../components/ZoneRateMatrix";

// --- Type Definitions ---
interface VariableFixed { variable: number; fixed: number; }
interface VariableFixedThreshold extends VariableFixed { thresholdWeight?: number; }

type PriceRate = {
  minWeight: number;
  docketCharges: number;
  fuel: number;
  rovCharges: VariableFixed;
  insuranceCharges: VariableFixed;
  odaCharges: VariableFixed;
  codCharges: VariableFixed;
  prepaidCharges: VariableFixed;
  topayCharges: VariableFixed;
  handlingCharges: VariableFixedThreshold;
  fmCharges: VariableFixed;
  appointmentCharges: VariableFixed;
  kFactor: number;
  minCharges: number;
  greenTax: number;
  daccCharges: number;
  miscellanousCharges: number;
};

const DEFAULT_PRICE_RATE: PriceRate = {
  minWeight: 0, docketCharges: 0, fuel: 0,
  rovCharges: { variable: 0, fixed: 0 },
  insuranceCharges: { variable: 0, fixed: 0 },
  odaCharges: { variable: 0, fixed: 0 },
  codCharges: { variable: 0, fixed: 0 },
  prepaidCharges: { variable: 0, fixed: 0 },
  topayCharges: { variable: 0, fixed: 0 },
  handlingCharges: { variable: 0, fixed: 0, thresholdWeight: 0 },
  fmCharges: { variable: 0, fixed: 0 },
  appointmentCharges: { variable: 0, fixed: 0 },
  kFactor: 1, minCharges: 0, greenTax: 0, daccCharges: 0, miscellanousCharges: 0,
};

// --- Styled & Reusable Components ---
const Card = ({ children, className }: { children: React.ReactNode; className?: string; }) => (
  <div className={`bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8 ${className}`}>{children}</div>
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


// T&C content sections
const TNC_SECTIONS = [
  {
    title: "1. Data Accuracy",
    body: "All pricing, serviceability, and company information provided is accurate and current. You accept responsibility for maintaining up-to-date rate data on the platform at all times.",
  },
  {
    title: "2. Service Obligations",
    body: "You commit to honoring the quoted rates for all confirmed bookings made through FreightCompare during the validity period of your registered rate card. Last-minute rate revisions on active bookings are not permitted.",
  },
  {
    title: "3. Regulatory Compliance",
    body: "You confirm your organization holds all required permits, licenses, and insurance coverage mandated for freight transportation operations under Indian law, including the Motor Vehicles Act, Goods and Services Tax (GST) registration, and applicable state transport regulations.",
  },
  {
    title: "4. Rate Update Policy",
    body: "You will notify FreightCompare of any rate revisions with a minimum of 7 working days' advance notice to ensure customers receive accurate and timely pricing. Emergency surcharges (e.g., fuel crisis, regulatory levy) may be raised with 48-hour notice with documented justification.",
  },
  {
    title: "5. Platform Usage & Data Sharing",
    body: "Your rate card data, service zones, and operational capabilities will be used to match shippers with appropriate transport services. FreightCompare may display your rates and zone coverage to registered verified customers on the platform.",
  },
  {
    title: "6. Data Privacy",
    body: "Your business information will be handled in accordance with our Privacy Policy. Personal contact data is protected and not shared with third parties outside the platform's core matching function. Rate data is visible only to verified registered customers.",
  },
  {
    title: "7. Dispute Resolution",
    body: "Any disputes regarding bookings, rates, or service quality will first be addressed through FreightCompare's internal resolution process (target resolution: 5 working days). Both parties agree to good-faith participation before pursuing external legal recourse.",
  },
  {
    title: "8. Account Security & Integrity",
    body: "You are solely responsible for maintaining the confidentiality of your account credentials. All activity performed under your account is your responsibility. Misuse, fraudulent rate listings, or platform abuse may result in immediate suspension or permanent termination of your account.",
  },
];

export default function AddPrice() {
  const navigate = useNavigate();
  const token = Cookies.get("authToken");

  const [wasAiPrefilled, setWasAiPrefilled] = useState<boolean>(() => {
    const hasManuallySaved = !!localStorage.getItem('transporter_price_rate');
    const hasExtracted = !!localStorage.getItem('transporter_extracted_price_rate');
    return !hasManuallySaved && hasExtracted;
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
  const [zoneRates, setZoneRates] = useState<number[][]>([]);
  const [loading, setLoading] = useState(false);
  const [showTnC, setShowTnC] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(false);
  const [showZoneGrid, setShowZoneGrid] = useState(() => {
    return !localStorage.getItem('transporter_extracted_price_rate');
  });

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
          ...(pricing.docketCharges ? { docketCharges: Number(pricing.docketCharges) } : {}),
          ...(pricing.fuel ? { fuel: Number(pricing.fuel) } : {}),
          ...(pricing.minCharges ? { minCharges: Number(pricing.minCharges) } : {}),
          ...(pricing.greenTax ? { greenTax: Number(pricing.greenTax) } : {}),
          ...(pricing.daccCharges ? { daccCharges: Number(pricing.daccCharges) } : {}),
          ...(pricing.miscCharges ? { miscellanousCharges: Number(pricing.miscCharges) } : {}),
          // Complex charges: only set if non-null
          ...(pricing.rovCharges         ? { rovCharges:         { variable: pricing.rovCharges.v || 0,         fixed: pricing.rovCharges.f || 0 } } : {}),
          ...(pricing.insuranceCharges   ? { insuranceCharges:   { variable: pricing.insuranceCharges.v || 0,   fixed: pricing.insuranceCharges.f || 0 } } : {}),
          ...(pricing.odaCharges         ? { odaCharges:         { variable: pricing.odaCharges.v || 0,         fixed: pricing.odaCharges.f || 0 } } : {}),
          ...(pricing.codCharges         ? { codCharges:         { variable: pricing.codCharges.v || 0,         fixed: pricing.codCharges.f || 0 } } : {}),
          ...(pricing.handlingCharges    ? { handlingCharges:    { variable: pricing.handlingCharges.v || 0,    fixed: pricing.handlingCharges.f || 0, thresholdWeight: 0 } } : {}),
          ...(pricing.topayCharges       ? { topayCharges:       { variable: pricing.topayCharges.v || 0,       fixed: pricing.topayCharges.f || 0 } } : {}),
          ...(pricing.appointmentCharges ? { appointmentCharges: { variable: pricing.appointmentCharges.v || 0, fixed: pricing.appointmentCharges.f || 0 } } : {}),
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

  // Load transporter name and zone labels from session storage
  useEffect(() => {
    const savedName = sessionStorage.getItem("companyName");
    const savedZones = sessionStorage.getItem("zones");
    if (savedName) setTransporterName(savedName);
    if (savedZones) {
      try {
        const arr = JSON.parse(savedZones);
        if (Array.isArray(arr)) {
          setZoneLabels(arr);
          const savedRates = localStorage.getItem('transporter_zone_rates');
          if (savedRates) {
            const parsed = JSON.parse(savedRates);
            if (Array.isArray(parsed) && parsed.length === arr.length) {
              setZoneRates(parsed);
            } else {
              setZoneRates(arr.map(() => arr.map(() => 0)));
            }
          } else {
            setZoneRates(arr.map(() => arr.map(() => 0)));
          }
        }
      } catch (_) {}
    }
  }, []);

  const handleRateChange = (
    section: keyof PriceRate,
    field: keyof VariableFixed | keyof VariableFixedThreshold | null,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const val = e.target.valueAsNumber || 0;
    setPriceRate(prev =>
      field
        ? { ...prev, [section]: { ...(typeof prev[section] === "object" && prev[section] !== null ? prev[section] : {}), [field]: val } }
        : { ...prev, [section]: val }
    );
  };

  // Step 1: validate and show T&C
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!transporterName.trim()) { toast.error("Transporter name is missing."); return; }
    setShowTnC(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2: final API submission after T&C acceptance
  const handleFinalSubmit = async () => {
    if (!tcAccepted) { toast.error("Please accept the Terms & Conditions to proceed."); return; }
    const zr: Record<string, Record<string, number>> = {};
    zoneLabels.forEach((from, i) => {
      zr[from] = {};
      zoneLabels.forEach((to, j) => (zr[from][to] = zoneRates[i]?.[j] || 0));
    });
    const payload = { companyName: transporterName, priceRate, zoneRates: zr };
    setLoading(true);
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
      navigate("/compare");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Save failed.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Terms & Conditions Screen ──────────────────────────────────────────────
  if (showTnC) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-50 rounded-2xl mb-4">
                <ShieldCheck className="text-blue-600" size={28} />
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Terms & Conditions</h1>
              <p className="mt-2 text-slate-500 text-lg">Please read and accept before submitting your configuration.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <FileText className="text-blue-600 flex-shrink-0" size={20} />
                <h2 className="text-lg font-bold text-slate-800">FreightCompare Transporter Service Agreement</h2>
              </div>

              <div
                className="space-y-5 text-sm text-slate-700 max-h-[420px] overflow-y-auto pr-2 scroll-smooth"
                style={{ scrollbarWidth: 'thin' }}
              >
                {TNC_SECTIONS.map(s => (
                  <section key={s.title}>
                    <h3 className="font-bold text-slate-900 mb-1">{s.title}</h3>
                    <p className="leading-relaxed text-slate-600">{s.body}</p>
                  </section>
                ))}
              </div>

              {/* Acceptance checkbox */}
              <label className="flex items-start gap-3 cursor-pointer p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors group">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={tcAccepted}
                    onChange={e => setTcAccepted(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className={`w-5 h-5 border-2 rounded transition-colors flex items-center justify-center
                    ${tcAccepted ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white group-hover:border-blue-400'}`}>
                    {tcAccepted && <CheckCircle size={13} className="text-white" />}
                  </div>
                </div>
                <span className="text-sm text-slate-700 font-medium leading-relaxed">
                  I have read and agree to the FreightCompare Transporter Service Agreement, including all data usage policies, rate commitment obligations, and regulatory compliance requirements stated above.
                </span>
              </label>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-4">
                <button
                  type="button"
                  onClick={() => setShowTnC(false)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  <ArrowLeft size={16} /> Back to Charges
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={!tcAccepted || loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all"
                >
                  {loading
                    ? <><Loader2 className="animate-spin" size={18} />Saving...</>
                    : <><Save size={18} /> Accept & Submit Configuration</>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Main Charges Configuration Form ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans py-4 sm:py-6">
      <div className="container mx-auto px-4 max-w-5xl space-y-6">

        {/* Header with back button */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative flex items-center justify-center mb-2">
          <button
            type="button"
            onClick={() => {
              // Clear the resume-route key so SignUpPage doesn't redirect here again
              localStorage.removeItem('transporter_onboarding_active_route');
              if (window.parent !== window) {
                window.parent.postMessage({ type: 'navigate_back' }, '*');
              } else {
                navigate(-1);
              }
            }}
            className="absolute left-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-lg transition-colors"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Price Configuration</h1>
            <p className="mt-2 text-lg text-slate-600">
              Set up rates and surcharges for{' '}
              <span className="font-bold text-blue-600">{transporterName || "your new transporter"}</span>.
            </p>
          </div>
        </motion.div>

        {/* AI Pre-fill banner */}
        {wasAiPrefilled && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0f2027, #1a3a4a)', border: '1px solid #1e4060' }}
          >
            <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <Sparkles size={15} className="text-blue-400 flex-shrink-0" />
              <span className="text-sm font-bold text-white">Charges Pre-filled by AI Extraction</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold"
                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
              >
                Review & edit all values before submitting
              </span>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Unified Price Configuration Table */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-0 overflow-hidden border-0 shadow-lg">
              {/* Header */}
              <div className="bg-slate-50 p-5 sm:p-6 border-b border-slate-200">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-extrabold text-slate-800">Transporter Pricing</h2>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-slate-500 mr-2">Configuring rates for:</span>
                  <span className="font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded text-sm">{transporterName || "your new transporter"}</span>
                </div>
              </div>

              {/* Unified Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[700px]">
                  <thead className="bg-[#f8fafc] text-slate-500 text-xs tracking-wider uppercase font-extrabold border-b border-slate-200">
                    <tr>
                      <th className="p-4 border-r border-slate-200 w-1/3">Charge</th>
                      <th className="p-4 border-r border-slate-200 w-1/5 text-center">Fixed (₹)</th>
                      <th className="p-4 border-r border-slate-200 w-1/5 text-center">Variable (%)</th>
                      <th className="p-4 w-1/5 text-center">Unit / Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {/* BASIC CHARGES HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider border-y border-slate-200">Basic Charges</td>
                    </tr>
                    
                    {/* Docket Charges */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 pl-4 flex items-center gap-2.5"><Package size={15} className="text-blue-500"/> Docket Charges</td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="number" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={priceRate.docketCharges || ""} onChange={(e) => handleRateChange("docketCharges", null, e)} />
                      </td>
                      <td className="p-2 border-r border-slate-200 bg-slate-50 text-center text-slate-300">-</td>
                      <td className="p-2 bg-slate-50 text-center text-slate-400 text-xs font-semibold">FLAT</td>
                    </tr>

                    {/* Fuel Surcharge */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 pl-4 flex items-center gap-2.5"><Percent size={15} className="text-blue-500"/> Fuel Surcharge</td>
                      <td className="p-2 border-r border-slate-200 bg-slate-50 text-center text-slate-300">-</td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="number" step="0.01" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={priceRate.fuel || ""} onChange={(e) => handleRateChange("fuel", null, e)} />
                      </td>
                      <td className="p-2 bg-slate-50 text-center text-slate-500 font-semibold text-xs">% ON BASE</td>
                    </tr>

                    {/* Min Chargeable Weight */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 border-r border-slate-200 font-semibold text-slate-700 pl-4 flex items-center gap-2.5"><Weight size={15} className="text-blue-500"/> Min Chargeable Wt</td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="number" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={priceRate.minWeight || ""} onChange={(e) => handleRateChange("minWeight", null, e)} />
                      </td>
                      <td className="p-2 border-r border-slate-200 bg-slate-50 text-center text-slate-300">-</td>
                      <td className="p-2 bg-slate-50 text-center text-slate-500 font-semibold text-xs">KG</td>
                    </tr>

                    {/* SURCHARGES HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider border-y border-slate-200">Surcharges & Additional</td>
                    </tr>

                    {[
                      { key: 'rovCharges', label: 'ROV / FOV Charges' },
                      { key: 'insuranceCharges', label: 'Insurance Charges' },
                      { key: 'odaCharges', label: 'ODA Charges' },
                      { key: 'handlingCharges', label: 'Handling Charges', hasThreshold: true },
                      { key: 'appointmentCharges', label: 'Appointment Charges' },
                      { key: 'codCharges', label: 'COD Charges' },
                      { key: 'topayCharges', label: 'To-Pay Charges' },
                      { key: 'prepaidCharges', label: 'Prepaid Charges' },
                      { key: 'fmCharges', label: 'FM Charges' },
                    ].map((charge) => (
                      <tr key={charge.key} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 border-r border-slate-200 font-medium text-slate-700 pl-6">{charge.label}</td>
                        <td className="p-2 border-r border-slate-200">
                          <input type="number" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={(priceRate as any)[charge.key]?.fixed || ""} onChange={e => handleRateChange(charge.key as any, "fixed", e)} />
                        </td>
                        <td className="p-2 border-r border-slate-200">
                          <input type="number" step="0.01" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={(priceRate as any)[charge.key]?.variable || ""} onChange={e => handleRateChange(charge.key as any, "variable", e)} />
                        </td>
                        <td className="p-2">
                          {charge.hasThreshold ? (
                            <div className="flex items-center gap-2 px-2">
                              <input type="number" placeholder="Threshold" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={(priceRate.handlingCharges as any)?.thresholdWeight || ""} onChange={e => handleRateChange("handlingCharges", "thresholdWeight", e)} />
                              <span className="text-xs text-slate-500 font-bold">KG</span>
                            </div>
                          ) : <span className="block text-center text-slate-300">-</span>}
                        </td>
                      </tr>
                    ))}

                    {/* OTHER PARAMETERS HEADER */}
                    <tr className="bg-slate-50/80">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider border-y border-slate-200">Other Parameters</td>
                    </tr>
                    
                    {[
                      { key: 'minCharges', label: 'Minimum Charges' },
                      { key: 'greenTax', label: 'Green Tax / NGT' },
                      { key: 'daccCharges', label: 'DACC Charges' },
                      { key: 'miscellanousCharges', label: 'Misc. Charges' },
                      { key: 'kFactor', label: 'Divisor Coefficient (K Factor)' },
                    ].map((param) => (
                      <tr key={param.key} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 border-r border-slate-200 font-medium text-slate-700 pl-6">{param.label}</td>
                        <td className="p-2 border-r border-slate-200">
                          <input type="number" className="w-full p-2 text-center border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 font-medium" value={(priceRate as any)[param.key] || ""} onChange={e => handleRateChange(param.key as any, null, e)} />
                        </td>
                        <td className="p-2 border-r border-slate-200 bg-slate-50 text-center text-slate-300">-</td>
                        <td className="p-2 bg-slate-50 text-center text-slate-300">-</td>
                      </tr>
                    ))}

                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>

          {/* Zone-to-Zone Rates */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card>
              <div className="flex items-center gap-3">
                <SlidersHorizontal size={22} className="text-blue-600" />
                <h2 className="text-xl font-bold text-slate-800">Zone-to-Zone Rates</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1 mb-6">
                Enter the per-kilogram rate for shipping between each zone. Use <strong>Bulk Paste</strong> to quickly import data from Excel or spreadsheets.
              </p>
              
              {!showZoneGrid && wasAiPrefilled && zoneRates.length > 0 ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={24} className="text-green-600" />
                    <div>
                      <p className="font-semibold text-green-800">Already extracted</p>
                      <p className="text-sm text-green-700">No need to fill. ({zoneLabels.length} zones found).</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowZoneGrid(true)} className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-100 font-medium transition-colors text-sm shadow-sm">
                    Review / Edit
                  </button>
                </div>
              ) : (
                <ZoneRateMatrix zoneLabels={zoneLabels} zoneRates={zoneRates} onRatesChange={setZoneRates} onZoneLabelsChange={setZoneLabels} />
              )}
            </Card>
          </motion.div>

          {/* Footer: back + submit */}
          <div className="flex items-center justify-between pt-4 gap-4">
            <button
              type="button"
              onClick={() => navigate('/transporter-signup')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 max-w-xs inline-flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white text-base font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {loading
                ? <><Loader2 className="animate-spin" size={20} />Saving...</>
                : <><FileText size={20} /> Review & Submit</>
              }
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
