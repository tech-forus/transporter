import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, ArrowLeft, Check, Loader2, AlertTriangle } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import ReconfirmModal, { type DiffItem } from '../components/ReconfirmModal';
import LaneEndFields from '../components/LaneEndFields';

axios.defaults.withCredentials = true;

type Rate = Record<string, any>;
type Zones = Record<string, Record<string, number>>;
interface Lane {
  originPincode: string; destinationPincode: string; price: number; vehicleType: string;
  isCustomVehicle?: boolean; maxCapacityKg?: number; [k: string]: any;
}

// Mirrors freight-compare-backend/config/ftlVehicleCapacity.js (standard vehicles).
const VEHICLES = ['Eeco', '3 Wheeler Loaded', 'Tata Ace', 'Pickup', '10 ft Truck', 'Eicher 14 ft', 'Eicher 19 ft', 'Eicher 20 ft', 'Container 32 ft MXL', '22 ft Container', '40 ft Container'];

const num = (v: string) => (v === '' ? 0 : Number(v));
// Stable per-row id (client only — the server ignores it), so a slow "nearby pincodes" reply lands on
// the right lane even if another lane was deleted while it was in flight.
const newKey = () => Math.random().toString(36).slice(2);
const laneProblem = (l: Lane): string | null => {
  if (!/^\d{6}$/.test(l.originPincode) || !/^\d{6}$/.test(l.destinationPincode)) return 'Pincodes must be 6 digits';
  if (!(Number(l.price) > 0)) return 'Price must be more than 0';
  if (!l.vehicleType.trim()) return 'Pick a vehicle';
  return null;
};


// ---- presentation helpers (no data logic) --------------------------------
const LABELS: Record<string, string> = {
  minWeight: 'Minimum chargeable weight', divisor: 'Volumetric divisor', kFactor: 'K-factor', fuelMax: 'Maximum fuel surcharge',
  chequeHandlingCharges: 'Cheque handling', docketCharges: 'Docket charges', fuel: 'Fuel surcharge', minCharges: 'Minimum charges',
  gstPct: 'GST', rovCharges: 'ROV / FOV charges', odaCharges: 'ODA charges', handlingCharges: 'Handling charges',
  greenTax: 'Green tax / NGT', hamaliCharges: 'Hamali charges', miscellanousCharges: 'Misc / AOC charges', topayCharges: 'To-pay charges',
  codCharges: 'COD / DOD charges', daccCharges: 'DACC charges', insuaranceCharges: 'Insurance charges', prepaidCharges: 'Prepaid charges',
  fmCharges: 'First-mile (FM) charges', appointmentCharges: 'Appointment charges',
};
const humanize = (k: string) => LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
const SCALAR_META: Record<string, { prefix?: string; suffix?: string; max?: number; hint?: string }> = {
  minWeight: { suffix: 'kg', hint: 'Shipments lighter than this are billed at this weight' },
  divisor: { hint: 'Length × width × height ÷ this = volumetric kg' },
  kFactor: { hint: 'Same as the volumetric divisor' },
  fuelMax: { suffix: '%', max: 100, hint: 'Upper limit for fuel surcharge' },
  chequeHandlingCharges: { prefix: '₹', hint: 'Flat fee for paying by cheque' },
};
const SUB_META: Record<string, { label: string; prefix?: string; suffix?: string; max?: number }> = {
  fixed: { label: 'Fixed', prefix: '₹' },
  variable: { label: 'Variable', suffix: '%', max: 100 },
  thresholdWeight: { label: 'Above', suffix: 'kg' },
};
const FIELD_CLS = 'h-10 w-full rounded-lg border border-slate-200 bg-white text-sm font-semibold tabular-nums text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400';

// Rates per kg (zone matrix) can never exceed this.
const ZONE_RATE_MAX = 100;

// Defined at module level so typing never remounts the input (which would drop focus).
// Shows an EMPTY box for 0 (no auto-zero), keeps what the user is typing as a draft
// (so "0.5" works), and never lets the value go above `max`.
const NumField: React.FC<{
  value: number | string; onChange: (v: string) => void; prefix?: string; suffix?: string;
  step?: string; max?: number; cls?: string;
}> = ({ value, onChange, prefix, suffix, step, max, cls }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === '' || Number(value) === 0 ? '' : String(value));
  const handle = (raw: string) => {
    if (raw === '' || raw === '-' || Number(raw) < 0) { setDraft(''); onChange(''); return; }
    let next = raw;
    if (max !== undefined && Number(raw) > max) next = String(max);
    setDraft(next);
    onChange(Number.isFinite(Number(next)) ? next : '');
  };
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
      <input
        type="number" min={0} max={max} step={step} inputMode="decimal" placeholder="–" value={shown}
        onChange={(e) => handle(e.target.value)} onBlur={() => setDraft(null)}
        className={cls ?? `${FIELD_CLS} ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-9' : 'pr-3'}`}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{suffix}</span>}
    </div>
  );
};

const RatesEditorPage: React.FC = () => {
  const [params] = useSearchParams();
  const linkId = params.get('linkId');

  const [loaded, setLoaded] = useState(false);
  const [individual, setIndividual] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [priceRate, setPriceRate] = useState<Rate>({});
  const [zoneRates, setZoneRates] = useState<Zones>({});
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [diff, setDiff] = useState<{ items: DiffItem[]; affected: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Lane ends currently fetching their nearby-pincode list; autosave and publish wait for them.
  const [busy, setBusy] = useState(0);
  const onBusy = useCallback((isBusy: boolean) => setBusy((n) => Math.max(0, n + (isBusy ? 1 : -1))), []);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  // Public masters use an explicit review + confirm; private masters and per-shipper custom rates autosave.
  const explicitPublish = isPublic && !linkId;
  const lanesValid = lanes.every((l) => !laneProblem(l));

  useEffect(() => {
    (async () => {
      try {
        const url = linkId
          ? `${API_BASE_URL}/api/vendor-referral/links/${linkId}/rates`
          : `${API_BASE_URL}/api/transporter/price/me/config`;
        const d = (await axios.get(url)).data.data || {};
        const isInd = Array.isArray(d.lanes);
        setIndividual(isInd);
        setIsPublic(!linkId && d.visibility === 'public');
        if (isInd) setLanes(d.lanes.map((l: any) => ({ ...l, price: Number(l.price), _key: newKey() })));
        else { setPriceRate(d.priceRate || {}); setZoneRates(d.zoneRates || {}); }
      } catch { toast.error('Could not load your rates.'); }
      finally { setLoaded(true); }
    })();
  }, [linkId]);

  const put = useCallback((confirmed?: boolean) => axios.put(
    `${API_BASE_URL}/api/transporter/price/me`,
    individual
      ? { lanes, linkId: linkId || undefined, confirmed }
      : { priceRate, zoneRates, linkId: linkId || undefined, confirmed }
  ), [individual, lanes, priceRate, zoneRates, linkId]);

  const reportError = (e: any, fallback: string) => {
    const errs: string[] | undefined = e?.response?.data?.errors;
    toast.error(errs?.[0] || e?.response?.data?.message || fallback);
  };

  // Autosave (debounced) for private / custom.
  useEffect(() => {
    if (!loaded || explicitPublish || !dirty.current) return;
    if (individual && (!lanesValid || busy > 0)) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try { await put(); setSaveState('saved'); dirty.current = false; }
      catch (e: any) { setSaveState('error'); reportError(e, 'Could not save.'); }
    }, 800);
    return () => window.clearTimeout(timer.current);
  }, [priceRate, zoneRates, lanes, loaded, explicitPublish, individual, lanesValid, busy, put]);

  const review = async () => {
    if (individual && !lanesValid) { toast.error('Fix the highlighted lanes first.'); return; }
    if (busy > 0) { toast.error('Still checking nearby pincodes. Try again in a moment.'); return; }
    setPublishing(true);
    try { await put(); toast.success('No changes to publish.'); }
    catch (e: any) {
      if (e?.response?.status === 409) setDiff({ items: e.response.data.diff, affected: e.response.data.affectedShippers });
      else reportError(e, 'Could not review changes.');
    } finally { setPublishing(false); }
  };
  const confirm = async () => {
    setPublishing(true);
    try { await put(true); setDiff(null); dirty.current = false; toast.success('Rates published.'); }
    catch (e: any) { reportError(e, 'Could not publish.'); }
    finally { setPublishing(false); }
  };

  const setCharge = (key: string, sub: string | null, value: string) => {
    dirty.current = true;
    setPriceRate((p) => (sub ? { ...p, [key]: { ...(p[key] || {}), [sub]: num(value) } } : { ...p, [key]: num(value) }));
  };
  const setCell = (from: string, to: string, value: string) => {
    dirty.current = true;
    setZoneRates((z) => ({ ...z, [from]: { ...(z[from] || {}), [to]: num(value) } }));
  };
  const setLane = (i: number, patch: Partial<Lane>) => { dirty.current = true; setLanes((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))); };
  const patchLaneByKey = useCallback((key: string, patch: Partial<Lane>) => {
    dirty.current = true;
    setLanes((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }, []);
  const addLane = () => { dirty.current = true; setLanes((ls) => [...ls, { originPincode: '', destinationPincode: '', price: 0, vehicleType: 'Tata Ace', _key: newKey() }]); };
  const removeLane = (i: number) => { dirty.current = true; setLanes((ls) => ls.filter((_, idx) => idx !== i)); };

  if (!loaded) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading your rates…</div>;

  const scalar = Object.entries(priceRate).filter(([, v]) => typeof v === 'number');
  const compound = Object.entries(priceRate).filter(([, v]) => v && typeof v === 'object');
  const origins = Object.keys(zoneRates);
  const dests = Array.from(new Set(origins.flatMap((o) => Object.keys(zoneRates[o] || {})))).sort();
  const input = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400';

  // What the save pill says — one calm line instead of scattered status text.
  const status: { tone: string; text: string; icon: React.ReactNode } | null =
    explicitPublish ? null
    : individual && !lanesValid ? { tone: 'bg-amber-50 text-amber-700 ring-amber-200', text: 'Complete the highlighted lanes to save', icon: <AlertTriangle size={14} /> }
    : busy > 0 ? { tone: 'bg-slate-100 text-slate-600 ring-slate-200', text: 'Checking nearby pincodes…', icon: <Loader2 size={14} className="animate-spin" /> }
    : saveState === 'saving' ? { tone: 'bg-amber-50 text-amber-700 ring-amber-200', text: 'Saving…', icon: <Loader2 size={14} className="animate-spin" /> }
    : saveState === 'saved' ? { tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200', text: 'All changes saved', icon: <Check size={14} /> }
    : saveState === 'error' ? { tone: 'bg-red-50 text-red-700 ring-red-200', text: 'Not saved. Edit again to retry', icon: <AlertTriangle size={14} /> }
    : { tone: 'bg-slate-100 text-slate-500 ring-slate-200', text: 'Changes save automatically', icon: <Check size={14} /> };

  const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

  return (
    // min-h + bottom padding leave empty space above the footer instead of it hugging the content.
    <div className="mx-auto min-h-[75vh] max-w-6xl pb-20 sm:pb-24">
      {/* Sticky action bar: title, live save status, and the primary action always in reach */}
      <div className="sticky top-20 z-20 -mx-2 mb-5 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/profile/rates" aria-label="Back to rates" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-blue-600">
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{linkId ? 'Custom rates for this shipper' : 'Edit your rates'}</h1>
              <p className="text-xs text-slate-500">
                {explicitPublish ? 'Your rates are public. Review changes before they go live.'
                  : linkId ? 'Only this shipper sees these rates.' : 'Update a value and it is saved for you.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.tone}`}>{status.icon}{status.text}</span>
            )}
            {explicitPublish && (
              <button onClick={review} disabled={publishing} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                {publishing ? 'Checking…' : 'Review & publish'}
              </button>
            )}
            <Link to="/profile/rates" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700">Done</Link>
          </div>
        </div>
      </div>

      {individual ? (
        <section className={`${card} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Your lanes</h2>
              <p className="text-xs text-slate-500">Each lane is one route with one vehicle and one price.</p>
            </div>
            {!linkId && <button onClick={addLane} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"><Plus size={15} /> Add lane</button>}
          </div>
          {lanes.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
              No lanes yet. Add one to start receiving quotes.
            </div>
          )}
          <div className="space-y-3">
            {lanes.map((l, i) => {
              const problem = laneProblem(l);
              const locked = !!linkId; // custom mode edits prices only
              return (
                <div key={l._key ?? i} className={`space-y-3 rounded-xl border p-4 ${problem ? 'border-amber-300 bg-amber-50/70' : 'border-slate-200 bg-slate-50/40'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Lane {i + 1}</span>
                    {!locked && <button title="Remove lane" onClick={() => removeLane(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <LaneEndFields title="From" side="origin" lane={l} locked={locked} onBusy={onBusy} onPatch={(patch) => patchLaneByKey(l._key, patch)} />
                    <LaneEndFields title="To" side="destination" lane={l} locked={locked} onBusy={onBusy} onPatch={(patch) => patchLaneByKey(l._key, patch)} />
                  </div>
                  <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2">
                    {l.isCustomVehicle || locked
                      ? <input className={input} value={l.vehicleType} disabled />
                      : <select className={input} value={l.vehicleType} onChange={(e) => setLane(i, { vehicleType: e.target.value })}>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</select>}
                    <NumField prefix="₹" value={l.price || ''} onChange={(v) => setLane(i, { price: num(v) })} />
                  </div>
                  {problem && <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700"><AlertTriangle size={13} /> {problem}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-3">
            {scalar.length > 0 && (
              <section className={`${card} p-5`}>
                <h2 className="text-base font-bold text-slate-900">Basic settings</h2>
                <p className="mb-4 text-xs text-slate-500">General rules used to work out every quote.</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {scalar.map(([k, v]) => {
                    const meta = SCALAR_META[k] || {};
                    return (
                      <label key={k} className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">{humanize(k)}</span>
                        <NumField value={v as number} onChange={(x) => setCharge(k, null, x)} prefix={meta.prefix} suffix={meta.suffix} max={meta.max} />
                        {meta.hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400">{meta.hint}</span>}
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {compound.length > 0 && (
              <section className={`${card} overflow-hidden`}>
                <div className="px-5 pt-5">
                  <h2 className="text-base font-bold text-slate-900">Charges</h2>
                  <p className="mb-4 text-xs text-slate-500">Use <b>Fixed</b> for a flat rupee amount, <b>Variable</b> for a percentage. Leave 0 if you do not charge it.</p>
                </div>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {compound.map(([k, v]) => {
                    const subs = Object.entries(v as Rate).filter(([, x]) => typeof x === 'number');
                    return (
                      <div key={k} className="grid grid-cols-1 items-center gap-3 px-5 py-3 sm:grid-cols-[1.2fr_2fr]">
                        <p className="text-sm font-semibold text-slate-800">{humanize(k)}</p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {subs.map(([sub, x]) => {
                            const m = SUB_META[sub] || { label: humanize(sub) };
                            return (
                              <label key={sub} className="block">
                                <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">{m.label}</span>
                                <NumField value={x as number} onChange={(val) => setCharge(k, sub, val)} prefix={m.prefix} suffix={m.suffix} max={m.max} />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <section className={`${card} overflow-hidden lg:col-span-2`}>
            <div className="px-5 pt-5">
              <h2 className="text-base font-bold text-slate-900">Zone rates</h2>
              <p className="mb-3 text-xs text-slate-500">Rupees per kg (max ₹100), from the row zone to the column zone.</p>
            </div>
            {origins.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-slate-400">No zone rates yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">From \ To</th>
                        {dests.map((d) => <th key={d} className="bg-slate-50 px-2 py-2.5 text-center text-xs font-bold text-slate-600">{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {origins.map((o) => (
                        <tr key={o}>
                          <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-2 font-bold text-slate-800">{o}</td>
                          {dests.map((d) => (
                            <td key={d} className="border-t border-slate-100 p-1.5">
                              <NumField
                                step="0.01" max={ZONE_RATE_MAX} value={zoneRates[o]?.[d] ?? ''} onChange={(val) => setCell(o, d, val)}
                                cls={`h-10 w-20 rounded-lg border text-center text-sm font-semibold tabular-nums outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${zoneRates[o]?.[d] ? 'border-blue-200 bg-blue-50/60 text-slate-900' : 'border-slate-200 bg-white text-slate-500'}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {diff && <ReconfirmModal diff={diff.items} affectedShippers={diff.affected} saving={publishing} onConfirm={confirm} onCancel={() => setDiff(null)} />}
    </div>
  );
};

export default RatesEditorPage;
