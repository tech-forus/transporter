// Step 2 of Individual/owner-operator signup — collects the lanes (origin →
// destination pincode), price, and vehicle type this one-truck transporter
// services. Three input methods, each producing the same LaneRate[] shape:
//   1. Manual   — one lane at a time (mirrors AddIndividualFtlTransporter.tsx
//                 in the shipper-facing freight-compare-frontend app).
//   2. Bulk     — upload an Excel/CSV sheet of pincode pairs; if the sheet has
//                 no Price column, the price is entered inline per-row before
//                 continuing.
//   3. Area     — drop a pin on a map, get every pincode within 5km computed
//                 offline (free, instant) against pincode_centroids.json via
//                 the Haversine formula, then apply one price to the batch.
//                 If VITE_MAPPLS_API_KEY is configured, the same click is also
//                 checked against the Mappls Nearby API and the API's pincode
//                 set wins on any disagreement (Mappls verification is
//                 optional/best-effort — the offline calc always works even
//                 without a key).
import { Fragment, useEffect, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapPin, Truck, IndianRupee, PenLine, UploadCloud, MapIcon, Loader2,
  CheckCircle2, Trash2, ArrowLeft, ArrowRight, Search, ChevronDown,
} from 'lucide-react';

// Leaflet's default marker icons reference image paths that don't survive
// bundling — point them at the CDN copies, the standard workaround.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Same canonical vehicle classes and "(up to X kg)" labeling as freight-compare-
// frontend's Add Vendor -> Individual FTL Transporter dropdown (src/config/
// ftlVehicleTypes.ts + AddIndividualFtlTransporter.tsx) — kept as a plain list
// here since this app doesn't run the Wheelseye pricing engine, just needs the
// dropdown to read identically to the rest of the product.
const VEHICLE_TYPES: { value: string; maxCapacityKg: number }[] = [
  { value: 'Champion', maxCapacityKg: 665 },
  { value: 'Tata Ace', maxCapacityKg: 1000 },
  { value: 'Pickup', maxCapacityKg: 1200 },
  { value: '10 ft Truck', maxCapacityKg: 1500 },
  { value: 'Eicher 14 ft', maxCapacityKg: 2000 },
  { value: '17 ft Truck', maxCapacityKg: 4000 },
  { value: 'Eicher 19 ft', maxCapacityKg: 7000 },
  { value: 'Eicher 20 ft', maxCapacityKg: 10000 },
  { value: 'Container 32 ft MXL', maxCapacityKg: 18000 },
  { value: '22 ft Container', maxCapacityKg: 20000 },
  { value: '40 ft Container', maxCapacityKg: 28000 },
];

export const VEHICLE_TYPE_OPTIONS = VEHICLE_TYPES.map((v) => v.value);

// Sentinel for "Other — enter your own vehicle", same convention as
// freight-compare-frontend's CUSTOM_VEHICLE_OPTION (config/ftlVehicleTypes.ts).
export const CUSTOM_VEHICLE = '__custom__';

function vehicleLabel(value: string): string {
  const v = VEHICLE_TYPES.find((t) => t.value === value);
  return v ? `${v.value} (up to ${v.maxCapacityKg.toLocaleString('en-IN')} kg)` : value;
}

export interface LaneRate {
  originPincode: string;
  destinationPincode: string;
  price: number;
  vehicleType: string;
  source: 'manual' | 'bulk' | 'area';
  isCustomVehicle?: boolean;
  customVehicleName?: string;
  maxCapacityKg?: number;
  bedLengthFt?: number | null;
  bedWidthFt?: number | null;
  bedHeightFt?: number | null;
  runningCostPerKm?: number | null;
}

// Input caps — shared by the custom-vehicle form (all three tabs) and every
// price field on this page.
export const VEHICLE_NAME_MAX_LEN = 30;
export const VEHICLE_NAME_PATTERN = /^[A-Za-z0-9 ]*$/; // letters, digits, spaces only — no special characters
export const CAPACITY_MAX_KG = 40000;
export const BED_LENGTH_MAX_FT = 32;
export const BED_WIDTH_MAX_FT = 8;
export const BED_HEIGHT_MAX_FT = 8;
export const RUNNING_COST_MAX = 1000;
export const PRICE_MAX = 1000;

// Strips any character outside [A-Za-z0-9 ] and caps length — used as the
// vehicle-name input's onChange filter so invalid characters never even
// land in state, rather than only being rejected at submit time.
export function sanitizeVehicleName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 ]/g, '').slice(0, VEHICLE_NAME_MAX_LEN);
}

// Shared validation for the custom-vehicle fields — same rule set as
// freight-compare-frontend's AddIndividualFtlTransporter.tsx: capacity is
// required (finite, > 0, <= CAPACITY_MAX_KG); L/W/H/running-cost are
// optional but if given must be finite, >= 0, and within their own caps.
// Returns an error message, or null if valid.
function validateCustomVehicleFields(fields: {
  customVehicleName: string;
  maxCapacityKg: string;
  bedLengthFt: string;
  bedWidthFt: string;
  bedHeightFt: string;
  runningCostPerKm: string;
}): string | null {
  const name = fields.customVehicleName.trim();
  if (!name) return 'Enter the vehicle name';
  if (name.length > VEHICLE_NAME_MAX_LEN) return `Vehicle name must be ${VEHICLE_NAME_MAX_LEN} characters or fewer`;
  if (!VEHICLE_NAME_PATTERN.test(name)) return 'Vehicle name can only contain letters and numbers';
  const capacity = Number(fields.maxCapacityKg);
  if (!Number.isFinite(capacity) || capacity <= 0) return 'Enter a valid carrying capacity (kg)';
  if (capacity > CAPACITY_MAX_KG) return `Carrying capacity cannot exceed ${CAPACITY_MAX_KG.toLocaleString('en-IN')} kg`;
  const dims: [string, string, number][] = [
    ['Bed length', fields.bedLengthFt, BED_LENGTH_MAX_FT],
    ['Bed width', fields.bedWidthFt, BED_WIDTH_MAX_FT],
    ['Bed height', fields.bedHeightFt, BED_HEIGHT_MAX_FT],
    ['Running cost', fields.runningCostPerKm, RUNNING_COST_MAX],
  ];
  for (const [label, raw, max] of dims) {
    if (!raw.trim()) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return `${label} must be a valid non-negative number`;
    if (n > max) return `${label} cannot exceed ${max}`;
  }
  return null;
}

interface IndividualLaneRatesStepProps {
  onBack: () => void;
  onContinue: (lanes: LaneRate[]) => void;
  initialLanes?: LaneRate[];
  // Whether the parent's onContinue handler (submitTransporterData) is
  // currently in flight — disables Continue so a fast double-click can't
  // fire two overlapping submits. Each submit generates its own OTP
  // server-side, so a duplicate call silently overwrites the first code in
  // Redis with a second one before the user has a chance to use it,
  // surfacing as "Invalid OTP" even though the code they typed was correct
  // a moment earlier.
  submitting?: boolean;
}

const MAPPLS_API_KEY = (import.meta as any).env?.VITE_MAPPLS_API_KEY || '';
const RADIUS_KM = 5;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let centroidCache: Map<string, { lat: number; lng: number }> | null = null;
async function loadCentroids(): Promise<Map<string, { lat: number; lng: number }>> {
  if (centroidCache) return centroidCache;
  const res = await fetch('/pincode_centroids.json', { cache: 'force-cache' });
  const data: Array<{ pincode: string; lat: number; lng: number }> = await res.json();
  const map = new Map<string, { lat: number; lng: number }>();
  for (const e of data) if (e.pincode) map.set(e.pincode, { lat: e.lat, lng: e.lng });
  centroidCache = map;
  return map;
}

// Best-effort Mappls Nearby verification — silently returns null (offline
// result stands unchanged) if no API key is configured or the call fails.
// Per product decision: when Mappls DOES respond, its pincode set is trusted
// over the offline Haversine set for any disagreement.
async function verifyWithMappls(lat: number, lng: number): Promise<string[] | null> {
  if (!MAPPLS_API_KEY) return null;
  try {
    const res = await fetch(
      `https://atlas.mappls.com/api/places/nearby/json?keywords=&refLocation=${lat},${lng}&radius=${RADIUS_KM * 1000}`,
      { headers: { Authorization: `Bearer ${MAPPLS_API_KEY}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pins: string[] = (data?.suggestedLocations || [])
      .map((s: any) => String(s?.pincode || '').replace(/\D/g, ''))
      .filter((p: string) => p.length === 6);
    return pins.length > 0 ? Array.from(new Set(pins)) : null;
  } catch {
    return null;
  }
}

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Per-mode (origin/destination) picker result — one map now drives two of
// these named result sets instead of rendering two separate <MapContainer>s.
interface AreaModeState {
  point: { lat: number; lng: number } | null;
  nearbyPincodes: string[];
  selected: Set<string>;
  verifiedByMappls: boolean;
  computing: boolean;
}

function emptyAreaModeState(): AreaModeState {
  return { point: null, nearbyPincodes: [], selected: new Set(), verifiedByMappls: false, computing: false };
}

// Read-only-ish list of a mode's computed nearby pincodes with toggle
// checkboxes — rendered twice in the right column (once per mode), each
// reading/writing its own AreaModeState regardless of which mode is
// currently active on the map.
function PincodeResultList({
  title,
  state,
  onToggle,
}: {
  title: string;
  state: AreaModeState;
  onToggle: (pincode: string) => void;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1"><MapPin size={12} /> {title}</h4>
      {state.computing && (
        <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Computing nearby pincodes...</p>
      )}
      {!state.computing && state.nearbyPincodes.length === 0 && !state.point && (
        <p className="text-xs text-slate-400 italic">Not picked yet — use the map on the left.</p>
      )}
      {!state.computing && state.nearbyPincodes.length === 0 && state.point && (
        <p className="text-xs text-amber-600 italic">No serviceable pincodes found within {RADIUS_KM}km of this point — try clicking a different, more built-up spot on the map.</p>
      )}
      {!state.computing && state.nearbyPincodes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle2 size={16} />
            {state.selected.size} of {state.nearbyPincodes.length} selected (within {RADIUS_KM}km)
            {state.verifiedByMappls && <span className="text-xs font-normal text-emerald-600 ml-1">(verified via Mappls)</span>}
          </div>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {state.nearbyPincodes.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => onToggle(p)}
                className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                  state.selected.has(p)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Free-text place search — OSM Nominatim's /search endpoint (same free,
// no-key service already used for BookNowModal's reverse-geocode), biased to
// India. Returns the first match's coordinates, or null if nothing matched.
//
// A bare place name like "jhansi" ambiguously matches both the city itself
// AND its enclosing district/county (an administrative boundary whose
// centroid can be many km from the actual city — e.g. Jhansi district's
// centroid lands ~6km from the nearest real pincode, just outside this
// screen's 5km radius, while the city point itself is inside it). Try
// featureType=city first so common city/town searches resolve to the
// actual settlement point; if that yields nothing (smaller towns/villages
// aren't always tagged "city" in OSM), fall back to the unrestricted query.
async function searchPlace(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const fetchHit = async (extraParams: string) => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=1&q=${encodeURIComponent(query)}${extraParams}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] || null;
  };

  const cityHit = await fetchHit('&featureType=city');
  const hit = cityHit || (await fetchHit(''));
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), label: hit.display_name };
}

export default function IndividualLaneRatesStep({ onBack, onContinue, initialLanes, submitting = false }: IndividualLaneRatesStepProps) {
  const [subTab, setSubTab] = useState<'manual' | 'bulk' | 'area'>('area');
  const [lanes, setLanes] = useState<LaneRate[]>(initialLanes || []);
  // Collapsed by default once a big batch (bulk/area-radius add) would
  // otherwise dominate the screen; small lists stay open since there's
  // nothing to hide.
  const [lanesExpanded, setLanesExpanded] = useState<boolean>((initialLanes?.length || 0) <= 5);

  // Master pincode list, loaded once for client-side "does this pincode
  // exist" validation on every manually-typed origin/destination field —
  // same /pincodes.json source and fetch pattern as ZoneSummaryPanel.tsx.
  // null while loading; an empty set means the fetch failed — in either
  // case we don't block the user (fail-open) rather than reject valid
  // pincodes because the master list wasn't available yet.
  const [pincodeSet, setPincodeSet] = useState<Set<string> | null>(null);
  useEffect(() => {
    fetch(`${(import.meta as any).env?.BASE_URL || '/'}pincodes.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: Array<{ pincode: string }>) => {
        setPincodeSet(new Set((Array.isArray(data) ? data : []).map((e) => String(e.pincode))));
      })
      .catch(() => setPincodeSet(new Set()));
  }, []);

  const isKnownPincode = (p: string): boolean => {
    if (!pincodeSet || pincodeSet.size === 0) return true; // still loading / failed to load — don't block
    return pincodeSet.has(p);
  };

  // --- Manual tab state ---
  const [manualOrigin, setManualOrigin] = useState('');
  const [manualDest, setManualDest] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualVehicle, setManualVehicle] = useState('');
  const [manualCustomName, setManualCustomName] = useState('');
  const [manualCustomCapacity, setManualCustomCapacity] = useState('');
  const [manualCustomLength, setManualCustomLength] = useState('');
  const [manualCustomWidth, setManualCustomWidth] = useState('');
  const [manualCustomHeight, setManualCustomHeight] = useState('');
  const [manualCustomRunningCost, setManualCustomRunningCost] = useState('');

  // Shown inline under the input the moment 6 digits are typed — same
  // isKnownPincode check re-run at submit time below as a hard gate, since
  // a user can technically submit via Enter before the inline error renders.
  const manualOriginError = manualOrigin.length === 6 && !isKnownPincode(manualOrigin) ? 'Invalid pincode — not found' : '';
  const manualDestError = manualDest.length === 6 && !isKnownPincode(manualDest) ? 'Invalid pincode — not found' : '';

  const addManualLane = () => {
    const origin = manualOrigin.replace(/\D/g, '').slice(0, 6);
    const dest = manualDest.replace(/\D/g, '').slice(0, 6);
    const price = Number(manualPrice);
    if (origin.length !== 6) return toast.error('Enter a valid 6-digit origin pincode');
    if (!isKnownPincode(origin)) return toast.error('Origin pincode not found — please re-check it');
    if (dest.length !== 6) return toast.error('Enter a valid 6-digit destination pincode');
    if (!isKnownPincode(dest)) return toast.error('Destination pincode not found — please re-check it');
    if (!manualVehicle) return toast.error('Select a vehicle type');
    if (!Number.isFinite(price) || price <= 0) return toast.error('Enter a valid price');
    if (price > PRICE_MAX) return toast.error(`Price cannot exceed ₹${PRICE_MAX}`);

    const isCustom = manualVehicle === CUSTOM_VEHICLE;
    let customFields: Partial<LaneRate> = {};
    if (isCustom) {
      const err = validateCustomVehicleFields({
        customVehicleName: manualCustomName,
        maxCapacityKg: manualCustomCapacity,
        bedLengthFt: manualCustomLength,
        bedWidthFt: manualCustomWidth,
        bedHeightFt: manualCustomHeight,
        runningCostPerKm: manualCustomRunningCost,
      });
      if (err) return toast.error(err);
      customFields = {
        isCustomVehicle: true,
        customVehicleName: manualCustomName.trim(),
        maxCapacityKg: Number(manualCustomCapacity),
        bedLengthFt: manualCustomLength.trim() ? Number(manualCustomLength) : null,
        bedWidthFt: manualCustomWidth.trim() ? Number(manualCustomWidth) : null,
        bedHeightFt: manualCustomHeight.trim() ? Number(manualCustomHeight) : null,
        runningCostPerKm: manualCustomRunningCost.trim() ? Number(manualCustomRunningCost) : null,
      };
    }

    setLanes((prev) => [
      ...prev,
      {
        originPincode: origin,
        destinationPincode: dest,
        price,
        vehicleType: isCustom ? manualCustomName.trim() : manualVehicle,
        source: 'manual',
        ...customFields,
      },
    ]);
    setManualOrigin('');
    setManualDest('');
    setManualPrice('');
    setManualCustomName('');
    setManualCustomCapacity('');
    setManualCustomLength('');
    setManualCustomWidth('');
    setManualCustomHeight('');
    setManualCustomRunningCost('');
    toast.success('Lane added');
  };

  // --- Bulk tab state ---
  const [bulkRows, setBulkRows] = useState<Array<{
    originPincode: string; destinationPincode: string; price: string; vehicleType: string;
    customVehicleName: string; customCapacityKg: string; customLengthFt: string; customWidthFt: string; customHeightFt: string; customRunningCost: string;
  }>>([]);
  const [bulkFileName, setBulkFileName] = useState('');

  const handleBulkFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const parsed = rows.map((r) => {
      const originPincode = String(r['Origin Pincode'] ?? r['Origin'] ?? r['origin'] ?? '').replace(/\D/g, '').slice(0, 6);
      const destinationPincode = String(r['Destination Pincode'] ?? r['Destination'] ?? r['destination'] ?? '').replace(/\D/g, '').slice(0, 6);
      const price = String(r['Price'] ?? r['price'] ?? r['Charge'] ?? '').replace(/[^0-9.]/g, '');
      const vehicleType = String(r['Vehicle Type'] ?? r['Vehicle'] ?? r['vehicle'] ?? '');
      return {
        originPincode, destinationPincode, price, vehicleType,
        customVehicleName: '', customCapacityKg: '', customLengthFt: '', customWidthFt: '', customHeightFt: '', customRunningCost: '',
      };
    }).filter((r) => r.originPincode.length === 6 && r.destinationPincode.length === 6);

    if (parsed.length === 0) {
      toast.error('No valid rows found — expected columns like "Origin Pincode", "Destination Pincode", "Price", "Vehicle Type"');
      return;
    }
    setBulkRows(parsed);
    const missingPrice = parsed.filter((r) => !r.price).length;
    if (missingPrice > 0) {
      toast(`${missingPrice} row(s) have no price — fill them in below before continuing`, { icon: '✏️' });
    } else {
      toast.success(`${parsed.length} lanes loaded`);
    }
  };

  const updateBulkRow = (
    idx: number,
    field: 'price' | 'vehicleType' | 'customVehicleName' | 'customCapacityKg' | 'customLengthFt' | 'customWidthFt' | 'customHeightFt' | 'customRunningCost',
    value: string
  ) => {
    setBulkRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const commitBulkRows = () => {
    const incomplete = bulkRows.filter((r) => !r.price || Number(r.price) <= 0 || !r.vehicleType);
    if (incomplete.length > 0) {
      toast.error(`${incomplete.length} row(s) still need a price and vehicle type`);
      return;
    }
    const overCap = bulkRows.filter((r) => Number(r.price) > PRICE_MAX);
    if (overCap.length > 0) {
      toast.error(`${overCap.length} row(s) have a price above ₹${PRICE_MAX} — please fix before continuing`);
      return;
    }
    for (const r of bulkRows) {
      if (r.vehicleType !== CUSTOM_VEHICLE) continue;
      const err = validateCustomVehicleFields({
        customVehicleName: r.customVehicleName,
        maxCapacityKg: r.customCapacityKg,
        bedLengthFt: r.customLengthFt,
        bedWidthFt: r.customWidthFt,
        bedHeightFt: r.customHeightFt,
        runningCostPerKm: r.customRunningCost,
      });
      if (err) return toast.error(`Row ${r.originPincode} → ${r.destinationPincode}: ${err}`);
    }
    const newBulkLanes: LaneRate[] = bulkRows.map((r) => {
      const isCustom = r.vehicleType === CUSTOM_VEHICLE;
      return {
        originPincode: r.originPincode,
        destinationPincode: r.destinationPincode,
        price: Number(r.price),
        vehicleType: isCustom ? r.customVehicleName.trim() : r.vehicleType,
        source: 'bulk' as const,
        ...(isCustom
          ? {
              isCustomVehicle: true,
              customVehicleName: r.customVehicleName.trim(),
              maxCapacityKg: Number(r.customCapacityKg),
              bedLengthFt: r.customLengthFt.trim() ? Number(r.customLengthFt) : null,
              bedWidthFt: r.customWidthFt.trim() ? Number(r.customWidthFt) : null,
              bedHeightFt: r.customHeightFt.trim() ? Number(r.customHeightFt) : null,
              runningCostPerKm: r.customRunningCost.trim() ? Number(r.customRunningCost) : null,
            }
          : {}),
      };
    });
    // A fresh upload replaces only the lanes that came from a PRIOR bulk
    // upload — manually-added and area-drawn lanes (different `source`
    // values) are left untouched. Without this filter, re-uploading a file
    // stacked the new rows on top of the old ones forever.
    setLanes((prev) => [...prev.filter((l) => l.source !== 'bulk'), ...newBulkLanes]);
    setBulkRows([]);
    setBulkFileName('');
    toast.success('Bulk lanes added');
  };

  // --- Area/radius tab state ---
  // One shared map/search picker drives two named result sets (origin,
  // destination) via a mode toggle — switching modes never clears the other
  // mode's already-computed pincode list.
  const [areaMode, setAreaMode] = useState<'origin' | 'destination'>('origin');
  const [areaOriginState, setAreaOriginState] = useState<AreaModeState>(emptyAreaModeState);
  const [areaDestState, setAreaDestState] = useState<AreaModeState>(emptyAreaModeState);
  const [areaSearchQuery, setAreaSearchQuery] = useState('');
  const [areaSearching, setAreaSearching] = useState(false);
  const areaMapRef = useRef<L.Map | null>(null);
  const [areaPrice, setAreaPrice] = useState('');
  const [areaVehicle, setAreaVehicle] = useState('');
  const [areaCustomName, setAreaCustomName] = useState('');
  const [areaCustomCapacity, setAreaCustomCapacity] = useState('');
  const [areaCustomLength, setAreaCustomLength] = useState('');
  const [areaCustomWidth, setAreaCustomWidth] = useState('');
  const [areaCustomHeight, setAreaCustomHeight] = useState('');
  const [areaCustomRunningCost, setAreaCustomRunningCost] = useState('');

  useEffect(() => {
    loadCentroids().catch(() => {});
  }, []);

  const areaOriginSelected = Array.from(areaOriginState.selected);
  const areaDestSelected = Array.from(areaDestState.selected);
  const areaLaneCount = areaOriginSelected.length * areaDestSelected.length;

  const setActiveAreaState = areaMode === 'origin' ? setAreaOriginState : setAreaDestState;

  const handleAreaMapPick = async (lat: number, lng: number) => {
    setActiveAreaState((prev) => ({ ...prev, point: { lat, lng }, computing: true, verifiedByMappls: false }));
    try {
      const centroids = await loadCentroids();
      const offline: string[] = [];
      centroids.forEach((coords, pincode) => {
        if (haversineKm(lat, lng, coords.lat, coords.lng) <= RADIUS_KM) offline.push(pincode);
      });
      const mapplsResult = await verifyWithMappls(lat, lng);
      const result = mapplsResult || offline;
      const sel = new Set(result);
      setActiveAreaState((prev) => ({ ...prev, nearbyPincodes: result, verifiedByMappls: !!mapplsResult, selected: sel, computing: false }));
    } catch {
      toast.error('Could not compute nearby pincodes — try a different point');
      setActiveAreaState((prev) => ({ ...prev, computing: false }));
    }
  };

  const searchAreaPlace = async () => {
    const query = areaSearchQuery.trim();
    if (!query) return;
    setAreaSearching(true);
    try {
      const hit = await searchPlace(query);
      if (!hit) {
        toast.error('Could not find that place — try a more specific name (e.g. add city/state)');
        return;
      }
      areaMapRef.current?.flyTo([hit.lat, hit.lng], 13, { duration: 1 });
      await handleAreaMapPick(hit.lat, hit.lng);
    } catch {
      toast.error('Search failed — check your connection and try again');
    } finally {
      setAreaSearching(false);
    }
  };

  const toggleOriginPincode = (p: string) => {
    setAreaOriginState((prev) => {
      const next = new Set(prev.selected);
      if (next.has(p)) next.delete(p); else next.add(p);
      return { ...prev, selected: next };
    });
  };

  const toggleDestPincode = (p: string) => {
    setAreaDestState((prev) => {
      const next = new Set(prev.selected);
      if (next.has(p)) next.delete(p); else next.add(p);
      return { ...prev, selected: next };
    });
  };

  const activeAreaState = areaMode === 'origin' ? areaOriginState : areaDestState;

  const commitAreaLanes = () => {
    const price = Number(areaPrice);
    if (areaOriginSelected.length === 0) return toast.error('Pick and select at least one origin pincode');
    if (areaDestSelected.length === 0) return toast.error('Pick and select at least one destination pincode');
    if (!areaVehicle) return toast.error('Select a vehicle type');
    if (Number.isFinite(price) && price > PRICE_MAX) return toast.error(`Price cannot exceed ₹${PRICE_MAX}`);
    if (!Number.isFinite(price) || price <= 0) return toast.error('Enter a valid price');

    const isCustom = areaVehicle === CUSTOM_VEHICLE;
    let customFields: Partial<LaneRate> = {};
    if (isCustom) {
      const err = validateCustomVehicleFields({
        customVehicleName: areaCustomName,
        maxCapacityKg: areaCustomCapacity,
        bedLengthFt: areaCustomLength,
        bedWidthFt: areaCustomWidth,
        bedHeightFt: areaCustomHeight,
        runningCostPerKm: areaCustomRunningCost,
      });
      if (err) return toast.error(err);
      customFields = {
        isCustomVehicle: true,
        customVehicleName: areaCustomName.trim(),
        maxCapacityKg: Number(areaCustomCapacity),
        bedLengthFt: areaCustomLength.trim() ? Number(areaCustomLength) : null,
        bedWidthFt: areaCustomWidth.trim() ? Number(areaCustomWidth) : null,
        bedHeightFt: areaCustomHeight.trim() ? Number(areaCustomHeight) : null,
        runningCostPerKm: areaCustomRunningCost.trim() ? Number(areaCustomRunningCost) : null,
      };
    }

    const newLanes: LaneRate[] = [];
    for (const originPincode of areaOriginSelected) {
      for (const destinationPincode of areaDestSelected) {
        newLanes.push({
          originPincode,
          destinationPincode,
          price,
          vehicleType: isCustom ? areaCustomName.trim() : areaVehicle,
          source: 'area',
          ...customFields,
        });
      }
    }
    setLanes((prev) => [...prev, ...newLanes]);
    setAreaPrice('');
    toast.success(`${newLanes.length} lanes added from the selected areas`);
  };

  const removeLane = (idx: number) => setLanes((prev) => prev.filter((_, i) => i !== idx));

  const canContinue = lanes.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-3 overflow-x-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 gap-3 flex-wrap">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <h2 className="text-lg font-bold text-slate-800 whitespace-nowrap">Delivery Areas</h2>
          <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
            <button type="button" onClick={() => setSubTab('manual')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${subTab === 'manual' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <PenLine size={14} /> Manual
            </button>
            <button type="button" onClick={() => setSubTab('bulk')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${subTab === 'bulk' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <UploadCloud size={14} /> Bulk Upload
            </button>
            <button type="button" onClick={() => setSubTab('area')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${subTab === 'area' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <MapIcon size={14} /> Area / Radius
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onContinue(lanes)}
          disabled={!canContinue || submitting}
          className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-semibold text-sm rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting...</> : <>Continue <ArrowRight size={15} /></>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-start">
      <div className="lg:col-span-6 min-w-0 space-y-5">
      {subTab === 'manual' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><Truck size={13} /> Vehicle Type</label>
            <select value={manualVehicle} onChange={(e) => setManualVehicle(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white">
              <option value="">Select vehicle type</option>
              {VEHICLE_TYPE_OPTIONS.map((v) => <option key={v} value={v}>{vehicleLabel(v)}</option>)}
              <option value={CUSTOM_VEHICLE}>Other — enter your own vehicle</option>
            </select>
          </div>

          {manualVehicle === CUSTOM_VEHICLE && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Vehicle Name</label>
                <input type="text" maxLength={VEHICLE_NAME_MAX_LEN} value={manualCustomName} onChange={(e) => setManualCustomName(sanitizeVehicleName(e.target.value))} placeholder="e.g. Ashok Leyland Dost" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Carrying Capacity (kg)</label>
                <input type="number" min={1} max={CAPACITY_MAX_KG} value={manualCustomCapacity} onChange={(e) => setManualCustomCapacity(e.target.value)} placeholder="e.g. 850" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Bed Size — optional (ft)</label>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min={0} max={BED_LENGTH_MAX_FT} value={manualCustomLength} onChange={(e) => setManualCustomLength(e.target.value)} placeholder="Length" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                  <input type="number" min={0} max={BED_WIDTH_MAX_FT} value={manualCustomWidth} onChange={(e) => setManualCustomWidth(e.target.value)} placeholder="Width" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                  <input type="number" min={0} max={BED_HEIGHT_MAX_FT} value={manualCustomHeight} onChange={(e) => setManualCustomHeight(e.target.value)} placeholder="Height" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Running Cost — optional (₹/km)</label>
                <input type="number" min={0} max={RUNNING_COST_MAX} value={manualCustomRunningCost} onChange={(e) => setManualCustomRunningCost(e.target.value)} placeholder="e.g. 18" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><MapPin size={13} /> Origin Pincode</label>
              <input
                type="text" inputMode="numeric" maxLength={6} value={manualOrigin}
                onChange={(e) => setManualOrigin(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 400001"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:outline-none ${manualOriginError ? 'border-red-300 focus:ring-red-300' : 'border-slate-200 focus:ring-blue-400'}`}
              />
              {manualOriginError && <p className="text-xs text-red-600 mt-1">{manualOriginError}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><MapPin size={13} /> Destination Pincode</label>
              <input
                type="text" inputMode="numeric" maxLength={6} value={manualDest}
                onChange={(e) => setManualDest(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 110001"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:outline-none ${manualDestError ? 'border-red-300 focus:ring-red-300' : 'border-slate-200 focus:ring-blue-400'}`}
              />
              {manualDestError && <p className="text-xs text-red-600 mt-1">{manualDestError}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><IndianRupee size={13} /> Price (₹)</label>
            <input type="number" min={1} max={PRICE_MAX} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="e.g. 800" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
            <p className="text-[11px] text-slate-400 mt-1">Limit ₹{PRICE_MAX} max</p>
          </div>
          <button
            type="button"
            onClick={addManualLane}
            disabled={!!manualOriginError || !!manualDestError}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
          >
            Add Lane
          </button>
        </div>
      )}

      {subTab === 'bulk' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkFile} className="hidden" id="bulk-lane-file" />
            <label htmlFor="bulk-lane-file" className="cursor-pointer inline-flex flex-col items-center gap-2">
              <UploadCloud size={22} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">{bulkFileName || 'Click to upload Excel/CSV'}</span>
              <span className="text-xs text-slate-400">Columns: Origin Pincode, Destination Pincode, Price (optional), Vehicle Type (optional)</span>
            </label>
          </div>

          {bulkRows.length > 0 && (
            <div className="space-y-3">
              <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-bold text-slate-600">Origin</th>
                      <th className="text-left p-2 font-bold text-slate-600">Destination</th>
                      <th className="text-left p-2 font-bold text-slate-600">Vehicle Type</th>
                      <th className="text-left p-2 font-bold text-slate-600">Price (₹) — max {PRICE_MAX}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.map((row, idx) => (
                      <Fragment key={idx}>
                        <tr className="border-t border-slate-100">
                          <td className="p-2">{row.originPincode}</td>
                          <td className="p-2">{row.destinationPincode}</td>
                          <td className="p-2">
                            <select value={row.vehicleType} onChange={(e) => updateBulkRow(idx, 'vehicleType', e.target.value)} className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs bg-white">
                              <option value="">Select</option>
                              {VEHICLE_TYPE_OPTIONS.map((v) => <option key={v} value={v}>{vehicleLabel(v)}</option>)}
                              <option value={CUSTOM_VEHICLE}>Other</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input type="number" min={1} max={PRICE_MAX} value={row.price} onChange={(e) => updateBulkRow(idx, 'price', e.target.value)} className="w-24 px-1.5 py-1 border border-slate-200 rounded text-xs" placeholder="Enter price" />
                          </td>
                        </tr>
                        {row.vehicleType === CUSTOM_VEHICLE && (
                          <tr className="border-t border-slate-100 bg-blue-50/40">
                            <td colSpan={4} className="p-2">
                              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                                <input maxLength={VEHICLE_NAME_MAX_LEN} value={row.customVehicleName} onChange={(e) => updateBulkRow(idx, 'customVehicleName', sanitizeVehicleName(e.target.value))} placeholder="Vehicle name" className="px-1.5 py-1 border border-slate-200 rounded text-xs col-span-2" />
                                <input type="number" min={1} max={CAPACITY_MAX_KG} value={row.customCapacityKg} onChange={(e) => updateBulkRow(idx, 'customCapacityKg', e.target.value)} placeholder="Capacity (kg)" className="px-1.5 py-1 border border-slate-200 rounded text-xs" />
                                <input type="number" min={0} max={BED_LENGTH_MAX_FT} value={row.customLengthFt} onChange={(e) => updateBulkRow(idx, 'customLengthFt', e.target.value)} placeholder="Length (ft)" className="px-1.5 py-1 border border-slate-200 rounded text-xs" />
                                <input type="number" min={0} max={BED_WIDTH_MAX_FT} value={row.customWidthFt} onChange={(e) => updateBulkRow(idx, 'customWidthFt', e.target.value)} placeholder="Width (ft)" className="px-1.5 py-1 border border-slate-200 rounded text-xs" />
                                <input type="number" min={0} max={BED_HEIGHT_MAX_FT} value={row.customHeightFt} onChange={(e) => updateBulkRow(idx, 'customHeightFt', e.target.value)} placeholder="Height (ft)" className="px-1.5 py-1 border border-slate-200 rounded text-xs" />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={commitBulkRows} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors">
                Add {bulkRows.length} Lanes
              </button>
            </div>
          )}
        </div>
      )}

      {subTab === 'area' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: one map + search, re-targeted by the mode toggle */}
            <div className="space-y-3">
              <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setAreaMode('origin')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${areaMode === 'origin' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Origin
                </button>
                <button
                  type="button"
                  onClick={() => setAreaMode('destination')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${areaMode === 'destination' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Destination
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={areaSearchQuery}
                  onChange={(e) => setAreaSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchAreaPlace(); } }}
                  placeholder={`Search for the ${areaMode} area, locality, or city...`}
                  className="w-full px-3 py-2.5 pr-24 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={searchAreaPlace}
                  disabled={areaSearching || !areaSearchQuery.trim()}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-md flex items-center gap-1"
                >
                  {areaSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                  Search
                </button>
              </div>

              <div className="h-72 rounded-xl overflow-hidden border border-slate-200">
                <MapContainer ref={areaMapRef} center={[22.9734, 78.6569]} zoom={5} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <ClickCapture onPick={handleAreaMapPick} />
                  {activeAreaState.point && (
                    <>
                      <Marker position={[activeAreaState.point.lat, activeAreaState.point.lng]} />
                      <Circle center={[activeAreaState.point.lat, activeAreaState.point.lng]} radius={RADIUS_KM * 1000} pathOptions={{ color: '#2563eb', fillOpacity: 0.1 }} />
                    </>
                  )}
                </MapContainer>
              </div>
              <p className="text-xs text-slate-500">
                Click anywhere on the map to select the center of your {areaMode} area ({RADIUS_KM}km radius).
                Flip the toggle above to set the other side — your previous selection stays saved.
              </p>
            </div>

            {/* Right column: both computed pincode lists, vehicle type, price —
                kept at the same column width as the pincode lists per explicit
                request, not a full-width block below the 2-column grid. */}
            <div className="space-y-5">
              <PincodeResultList title="Origin Pincodes" state={areaOriginState} onToggle={toggleOriginPincode} />
              <PincodeResultList title="Destination Pincodes" state={areaDestState} onToggle={toggleDestPincode} />

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><Truck size={13} /> Vehicle Type</label>
                  <select value={areaVehicle} onChange={(e) => setAreaVehicle(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white">
                    <option value="">Select vehicle type</option>
                    {VEHICLE_TYPE_OPTIONS.map((v) => <option key={v} value={v}>{vehicleLabel(v)}</option>)}
                    <option value={CUSTOM_VEHICLE}>Other — enter your own vehicle</option>
                  </select>
                </div>

                {areaVehicle === CUSTOM_VEHICLE && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Vehicle Name</label>
                      <input type="text" maxLength={VEHICLE_NAME_MAX_LEN} value={areaCustomName} onChange={(e) => setAreaCustomName(sanitizeVehicleName(e.target.value))} placeholder="e.g. Ashok Leyland Dost" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Carrying Capacity (kg)</label>
                      <input type="number" min={1} max={CAPACITY_MAX_KG} value={areaCustomCapacity} onChange={(e) => setAreaCustomCapacity(e.target.value)} placeholder="e.g. 850" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Bed Size — optional (ft)</label>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="number" min={0} max={BED_LENGTH_MAX_FT} value={areaCustomLength} onChange={(e) => setAreaCustomLength(e.target.value)} placeholder="Length" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                        <input type="number" min={0} max={BED_WIDTH_MAX_FT} value={areaCustomWidth} onChange={(e) => setAreaCustomWidth(e.target.value)} placeholder="Width" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                        <input type="number" min={0} max={BED_HEIGHT_MAX_FT} value={areaCustomHeight} onChange={(e) => setAreaCustomHeight(e.target.value)} placeholder="Height" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Running Cost — optional (₹/km)</label>
                      <input type="number" min={0} max={RUNNING_COST_MAX} value={areaCustomRunningCost} onChange={(e) => setAreaCustomRunningCost(e.target.value)} placeholder="e.g. 18" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><IndianRupee size={13} /> Price (₹) — applied to every generated lane</label>
                  <input type="number" min={1} max={PRICE_MAX} value={areaPrice} onChange={(e) => setAreaPrice(e.target.value)} placeholder="e.g. 800" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                  <p className="text-[11px] text-slate-400 mt-1">Limit ₹{PRICE_MAX} max</p>
                </div>
                <p className="text-xs text-slate-500">
                  {areaOriginSelected.length} origin pincode(s) × {areaDestSelected.length} destination pincode(s) selected.
                </p>
                <button
                  type="button"
                  onClick={commitAreaLanes}
                  disabled={areaLaneCount === 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
                >
                  Add {areaLaneCount} Lanes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>

      <div className="lg:col-span-4 min-w-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setLanesExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-sm font-bold text-slate-700"
            aria-expanded={lanesExpanded}
          >
            <span>Lanes Added ({lanes.length})</span>
            <ChevronDown
              size={16}
              className={`text-slate-400 transition-transform duration-200 ${lanesExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {lanes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete all ${lanes.length} lane(s)? This can't be undone.`)) setLanes([]);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700"
            >
              <Trash2 size={13} /> Delete all
            </button>
          )}
        </div>
        {lanesExpanded && (
          lanes.length === 0 ? (
            <p className="text-sm text-slate-400 italic px-4 sm:px-6 py-8 text-center">No lanes added yet — use the form on the left.</p>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full text-xs table-fixed border-collapse">
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[19%]" />
                  <col className="w-[38%]" />
                  <col className="w-[16%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2.5 pl-4 sm:pl-6 font-bold text-slate-600 border border-slate-200">Origin</th>
                    <th className="text-left p-2.5 font-bold text-slate-600 border border-slate-200">Destination</th>
                    <th className="text-left p-2.5 font-bold text-slate-600 border border-slate-200">Vehicle</th>
                    <th className="text-left p-2.5 font-bold text-slate-600 border border-slate-200">Price (₹)</th>
                    <th className="p-2.5 pr-4 sm:pr-6 border border-slate-200"></th>
                  </tr>
                </thead>
                <tbody>
                  {lanes.map((lane, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60">
                      <td className="p-2.5 pl-4 sm:pl-6 font-mono truncate border border-slate-100">{lane.originPincode}</td>
                      <td className="p-2.5 font-mono truncate border border-slate-100">{lane.destinationPincode}</td>
                      <td className="p-2.5 truncate border border-slate-100" title={lane.vehicleType}>{lane.vehicleType}</td>
                      <td className="p-2.5 truncate border border-slate-100">₹{lane.price.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 pr-4 sm:pr-6 text-right border border-slate-100">
                        <button type="button" onClick={() => removeLane(idx)} className="text-red-500 hover:text-red-700">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      </div>
    </div>
  );
}
