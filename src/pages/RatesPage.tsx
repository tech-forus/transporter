import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

import {
  Truck, Package, Receipt, Grid3x3, Route, ArrowLeft, Loader, AlertTriangle,
  Pencil, Layers, PlusCircle, Info,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/apiConfig';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';

// --- Same shapes as ProfilePage.tsx — this page just renders the tabular/
// bulk pricing data that used to live at the bottom of the profile page, so
// the profile itself stays short and scannable. ---
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
  accountType?: 'business' | 'individual';
  individualLaneRates?: LaneRate[];
}

type VarFixed = { variable?: number; fixed?: number };
type MixedCharge = number | VarFixed | { maxWeight: number; charge: number }[] | undefined | null;

interface PriceConfig {
  priceRate: {
    minWeight?: number;
    docketCharges?: MixedCharge;
    fuel?: MixedCharge;
    minCharges?: MixedCharge;
    rovCharges?: VarFixed;
    insuaranceCharges?: VarFixed;
    odaCharges?: VarFixed;
    codCharges?: VarFixed;
    prepaidCharges?: VarFixed;
    topayCharges?: VarFixed;
    handlingCharges?: VarFixed;
    fmCharges?: VarFixed;
    appointmentCharges?: VarFixed;
    greenTax?: MixedCharge;
    daccCharges?: MixedCharge;
    miscellanousCharges?: MixedCharge;
    hamaliCharges?: MixedCharge;
    chequeHandlingCharges?: number;
    divisor?: number;
  };
  zoneRates?: Record<string, Record<string, number>>;
}

const formatVarFixed = (vf?: VarFixed): string | null => {
  if (!vf) return null;
  const parts: string[] = [];
  if (vf.fixed) parts.push(`₹${vf.fixed}`);
  if (vf.variable) parts.push(`${vf.variable}%`);
  return parts.length ? parts.join(' + ') : null;
};

const formatMixedCharge = (value: MixedCharge, percentIfScalar = false): string | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length ? `${value.length} weight slab${value.length === 1 ? '' : 's'}` : null;
  if (typeof value === 'object') return formatVarFixed(value);
  const num = Number(value);
  if (!num) return null;
  return percentIfScalar ? `${num}%` : `₹${num}`;
};

// Capacity can arrive either as a straight max weight, or as raised-bed
// dimensions (no weight rating on file) — show whichever the record
// actually has instead of always falling back to "-".
const formatCapacity = (lane: LaneRate): string => {
  if (lane.maxCapacityKg) return `${lane.maxCapacityKg} kg`;
  const { bedLengthFt, bedWidthFt, bedHeightFt } = lane;
  if (bedLengthFt || bedWidthFt || bedHeightFt) {
    return `${bedLengthFt || '-'} × ${bedWidthFt || '-'} × ${bedHeightFt || '-'} ft`;
  }
  return '-';
};

interface FieldDef {
  label: string;
  value: string | number | null | undefined | false;
  icon: React.ReactNode;
}

const RatesPage: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TransporterProfile | null>(null);
  const [priceConfig, setPriceConfig] = useState<PriceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // See ProfilePage.tsx's identical call for why — without it the host
  // iframe keeps a stale height and this page scrolls inside its own nested
  // scrollbar instead of the outer page growing to fit it.
  useReportIframeHeight([loading, profile, priceConfig]);

  useEffect(() => {
    if (!user?._id) {
      setError('Authentication token not found. Please log in again.');
      setLoading(false);
      return;
    }
    axios
      .get<{ success: boolean; data: TransporterProfile }>(`${API_BASE_URL}/api/transporter/profile/${user._id}`)
      .then((res) => setProfile(res.data.data))
      .catch(() => setError('Could not load your rates. Please try again.'))
      .finally(() => setLoading(false));
  }, [user?._id]);

  useEffect(() => {
    if (!user?._id || profile?.accountType === 'individual') return;
    axios
      .get<{ success: boolean; data: PriceConfig | null }>(`${API_BASE_URL}/api/transporter/price/${user._id}`)
      .then((res) => setPriceConfig(res.data.data))
      .catch(() => {/* rate card section just stays hidden */});
  }, [user?._id, profile?.accountType]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
        <Loader className="animate-spin mr-3" size={24} />
        <p className="text-lg">Loading Rates...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-600 p-4">
        <AlertTriangle className="mb-3" size={40} />
        <p className="text-lg font-semibold text-center">Could not load rates</p>
        <p className="text-slate-600 text-center">{error || 'No data available.'}</p>
        <Link to="/profile" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
          <ArrowLeft size={15} /> Back to Profile
        </Link>
      </div>
    );
  }

  const isIndividual = profile.accountType === 'individual';
  const laneRates = profile.individualLaneRates || [];

  const pr = priceConfig?.priceRate;
  const rateCardFields: FieldDef[] = pr
    ? [
        { label: 'Min Chargeable Weight', value: pr.minWeight ? `${pr.minWeight} kg` : null, icon: <Package size={16} /> },
        { label: 'Docket Charges', value: formatMixedCharge(pr.docketCharges), icon: <Receipt size={16} /> },
        { label: 'Fuel Surcharge', value: formatMixedCharge(pr.fuel, true), icon: <Receipt size={16} /> },
        { label: 'Minimum Charges', value: formatMixedCharge(pr.minCharges), icon: <Receipt size={16} /> },
        { label: 'ROV / FOV Charges', value: formatVarFixed(pr.rovCharges), icon: <Receipt size={16} /> },
        { label: 'Insurance Charges', value: formatVarFixed(pr.insuaranceCharges), icon: <Receipt size={16} /> },
        { label: 'ODA Charges', value: formatVarFixed(pr.odaCharges), icon: <Receipt size={16} /> },
        { label: 'COD Charges', value: formatVarFixed(pr.codCharges), icon: <Receipt size={16} /> },
        { label: 'Prepaid Charges', value: formatVarFixed(pr.prepaidCharges), icon: <Receipt size={16} /> },
        { label: 'To-Pay Charges', value: formatVarFixed(pr.topayCharges), icon: <Receipt size={16} /> },
        { label: 'Handling Charges', value: formatVarFixed(pr.handlingCharges), icon: <Receipt size={16} /> },
        { label: 'FM Charges', value: formatVarFixed(pr.fmCharges), icon: <Receipt size={16} /> },
        { label: 'Appointment Charges', value: formatVarFixed(pr.appointmentCharges), icon: <Receipt size={16} /> },
        { label: 'Green Tax / NGT', value: formatMixedCharge(pr.greenTax), icon: <Receipt size={16} /> },
        { label: 'DACC Charges', value: formatMixedCharge(pr.daccCharges), icon: <Receipt size={16} /> },
        { label: 'Misc / AOC Charges', value: formatMixedCharge(pr.miscellanousCharges), icon: <Receipt size={16} /> },
        { label: 'Hamali Charges', value: formatMixedCharge(pr.hamaliCharges), icon: <Receipt size={16} /> },
        { label: 'Cheque Handling', value: pr.chequeHandlingCharges ? `₹${pr.chequeHandlingCharges}` : null, icon: <Receipt size={16} /> },
        { label: 'Volumetric Divisor', value: pr.divisor ? `${pr.divisor} (L×W×H ÷ N)` : null, icon: <Receipt size={16} /> },
      ].filter((f) => f.value !== null && f.value !== undefined)
    : [];

  const zoneRatesData = priceConfig?.zoneRates || {};
  const fromZones = Object.keys(zoneRatesData).filter((z) => Object.values(zoneRatesData[z] || {}).some((v) => Number(v) > 0));
  const toZonesSet = new Set<string>();
  fromZones.forEach((fz) => Object.entries(zoneRatesData[fz] || {}).forEach(([tz, v]) => { if (Number(v) > 0) toZonesSet.add(tz); }));
  const toZones = Array.from(toZonesSet).sort();

  const nothingToShow = isIndividual ? laneRates.length === 0 : rateCardFields.length === 0 && fromZones.length === 0;

  // Group the flat list into what a transporter thinks in: the essentials, the
  // extras that apply to some shipments, and the rarely-used optional ones.
  const BASIC = new Set(['Min Chargeable Weight', 'Docket Charges', 'Fuel Surcharge', 'Minimum Charges', 'Volumetric Divisor']);
  const OPTIONAL = new Set(['Insurance Charges', 'COD Charges', 'Prepaid Charges', 'To-Pay Charges', 'FM Charges', 'Appointment Charges', 'DACC Charges']);
  const groups = [
    { title: 'Basic charges', hint: 'Applied on every shipment', tone: 'bg-blue-50 text-blue-600', icon: <Receipt size={18} />, items: rateCardFields.filter((f) => BASIC.has(f.label)) },
    { title: 'Additional charges', hint: 'Added when they apply', tone: 'bg-indigo-50 text-indigo-600', icon: <Layers size={18} />, items: rateCardFields.filter((f) => !BASIC.has(f.label) && !OPTIONAL.has(f.label)) },
    { title: 'Optional charges', hint: 'Only on request', tone: 'bg-slate-100 text-slate-600', icon: <PlusCircle size={18} />, items: rateCardFields.filter((f) => OPTIONAL.has(f.label)) },
  ].filter((g) => g.items.length > 0);

  const allRates = fromZones.flatMap((fz) => toZones.map((tz) => Number(zoneRatesData[fz]?.[tz]) || 0));
  const maxRate = Math.max(1, ...allRates);
  // Heat-map: costlier lanes get a deeper tint, so the pricing shape reads at a glance.
  const cellTint = (rate: number) => ({ backgroundColor: `rgba(37, 99, 235, ${0.05 + 0.2 * (rate / maxRate)})` });
  const singleOrigin = !isIndividual && fromZones.length === 1 && toZones.length > 1;

  const stats = isIndividual
    ? [{ label: 'Lanes', value: laneRates.length }]
    : [
        { label: 'Charges set', value: rateCardFields.length },
        { label: 'Origin zones', value: fromZones.length },
        { label: 'Destination zones', value: toZones.length },
      ];

  return (
    <div className="max-w-6xl mx-auto py-2">
      <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-600 mb-4 transition-colors">
        <ArrowLeft size={16} /> Profile
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">{isIndividual ? 'Lane Rates' : 'Rate Card & Zone Rates'}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isIndividual ? 'Your pricing per origin-destination lane, as submitted.' : 'What shippers see when they compare you. Keep it current to win more bookings.'}
          </p>
        </div>
        <Link to="/profile/rates/edit" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition-colors">
          <Pencil size={15} /> Edit rates
        </Link>
      </div>

      {!nothingToShow && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map((st) => (
            <div key={st.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-2xl font-black tabular-nums text-slate-900">{st.value}</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{st.label}</p>
            </div>
          ))}
        </div>
      )}

      {singleOrigin && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info size={18} className="mt-0.5 flex-none text-amber-600" />
          <p className="flex-1">
            You have priced only <b>{fromZones[0]}</b> as a starting zone. If you also pick up from other zones, add those rates so shippers there can book you.
          </p>
          <Link to="/profile/rates/edit" className="flex-none font-bold text-amber-800 underline">Add rates</Link>
        </div>
      )}

      {nothingToShow && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Truck size={22} /></div>
          <p className="font-semibold text-slate-800">No rates saved yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Add your rate card and zone rates so shippers can see your prices.</p>
          <Link to="/profile/rates/edit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Pencil size={14} /> Add rates
          </Link>
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-6 items-start">
          {groups.map((g) => (
            <section key={g.title} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${g.tone}`}>{g.icon}</span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{g.title}</h2>
                  <p className="text-xs text-slate-400">{g.hint}</p>
                </div>
              </div>
              <dl className="divide-y divide-slate-100">
                {g.items.map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-3 px-5 py-3">
                    <dt className="text-sm text-slate-500">{f.label}</dt>
                    <dd className="text-sm font-bold tabular-nums text-slate-900 text-right">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}

      {fromZones.length > 0 && toZones.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Grid3x3 size={18} /></span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Zone-to-zone rates</h2>
                <p className="text-xs text-slate-400">Rupees per kg, from the row zone to the column zone. Darker means costlier.</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">From \ To</th>
                  {toZones.map((tz) => (
                    <th key={tz} className="bg-slate-50 px-4 py-3 text-center text-xs font-bold text-slate-600">{tz}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fromZones.map((fz) => (
                  <tr key={fz}>
                    <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-4 py-3 font-bold text-slate-800">{fz}</td>
                    {toZones.map((tz) => {
                      const rate = Number(zoneRatesData[fz]?.[tz]) || 0;
                      return (
                        <td key={tz} style={rate ? cellTint(rate) : undefined} className="border-t border-slate-100 px-4 py-3 text-center font-semibold tabular-nums text-slate-800">
                          {rate ? `₹${rate}` : <span className="text-slate-300">–</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isIndividual && laneRates.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Route size={18} /></span>
            <h2 className="text-sm font-bold text-slate-900">Your lanes ({laneRates.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="text-left px-5 py-3">Origin</th>
                  <th className="text-left px-5 py-3">Destination</th>
                  <th className="text-left px-5 py-3">Vehicle</th>
                  <th className="text-left px-5 py-3">Capacity</th>
                  <th className="text-right px-5 py-3">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {laneRates.map((lane, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-800">{lane.originPincode || '-'}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-800">{lane.destinationPincode || '-'}</td>
                    <td className="px-5 py-3 text-slate-600">{lane.vehicleType || '-'}</td>
                    <td className="px-5 py-3 text-slate-600">{formatCapacity(lane)}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">{lane.price ? `₹${lane.price.toLocaleString('en-IN')}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default RatesPage;
