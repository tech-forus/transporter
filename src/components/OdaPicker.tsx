// ODA (Out of Delivery Area) billing picker — port of the website's Add Vendor OdaChargeTypePicker +
// ODA matrix modal (freight-compare-frontend/src/components/OdaChargeTypePicker.tsx, ChargesSection.tsx).
// readOda/writeOda use the same saved shapes as AddVendor.tsx's priceRate.odaCharges / odaMatrix, which
// freight-compare-backend/utils/chargeFormulas.js prices.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Rate = Record<string, any>;
export type OdaType = 'per_kg' | 'per_shipment' | 'per_kg_minimum' | 'per_kg_excess' | 'matrix' | 'negotiable';
export interface Band { minKg: number | null; maxKg: number | null; charge: number }
export interface MatrixRow { minDist: number | null; maxDist: number | null; bands: Band[] }
export interface OdaState {
  enabled: boolean; type: OdaType; custom: boolean;
  rate: number; amount: number; minimum: number; base: number; limit: number; extra: number; matrix: MatrixRow[];
}

export const ODA_OPTIONS: { type: OdaType; label: string; blurb: string }[] = [
  { type: 'per_kg', label: 'Per KG', blurb: 'Charged purely by weight — a fixed ₹ rate for every kilogram of the shipment.' },
  { type: 'per_shipment', label: 'Flat Fee', blurb: 'One fixed charge per shipment, no matter how much it weighs.' },
  { type: 'per_kg_minimum', label: 'Per KG, with a Floor (+Min)', blurb: 'Charged per kg, but never less than a minimum amount — a safety-net rate.' },
  { type: 'per_kg_excess', label: 'Base + Extra Beyond Limit (+Extra)', blurb: 'A fixed base amount covers weight up to a limit; anything heavier is billed extra per kg.' },
  { type: 'matrix', label: 'Weight / Distance Slabs (Matrix)', blurb: 'Different rates for different weight or distance ranges — for tiered pricing.' },
  { type: 'negotiable', label: 'Negotiable', blurb: 'Rate is decided case-by-case at the time of booking.' },
];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const EMPTY: OdaState = { enabled: false, type: 'per_kg', custom: false, rate: 0, amount: 0, minimum: 0, base: 0, limit: 0, extra: 0, matrix: [] };
const DEFAULT_MATRIX: MatrixRow[] = [{ minDist: 0, maxDist: null, bands: [{ minKg: 0, maxKg: 100, charge: 0 }, { minKg: 100, maxKg: 500, charge: 0 }, { minKg: 500, maxKg: null, charge: 0 }] }];

/** Saved odaCharges/odaMatrix → picker state. Shapes the engine bills differently than any option are `custom` (kept untouched). */
export function readOda(oda: Rate | undefined, odaMatrix: Rate | undefined): OdaState {
  const o = oda && typeof oda === 'object' ? oda : {};
  const matrix: MatrixRow[] = Array.isArray(odaMatrix?.matrix) && odaMatrix!.matrix.length ? odaMatrix!.matrix
    : Array.isArray(o.matrix) && o.matrix.length && o.matrix[0]?.bands ? o.matrix : [];
  const bt = o.billingType || o.type;
  const fixed = num(o.fixed), variable = num(o.variable);
  if (matrix.length || bt === 'matrix') return { ...EMPTY, enabled: true, type: 'matrix', matrix };
  if (bt === 'negotiable') return { ...EMPTY, enabled: true, type: 'negotiable' };
  if (bt === 'per_kg_excess') return { ...EMPTY, enabled: true, type: 'per_kg_excess', base: num(o.fixedAmount ?? fixed), limit: num(o.thresholdWeight), extra: num(o.variableRange ?? variable) };
  if (o.type === 'per_kg_minimum') return { ...EMPTY, enabled: true, type: 'per_kg_minimum', rate: num(o.perKg), minimum: num(o.minimum) };
  if (o.type === 'per_shipment' || bt === 'per_shipment') return { ...EMPTY, enabled: true, type: 'per_shipment', amount: fixed || num(o.minimum) || variable };
  if (fixed === 0 && variable === 0 && !(num(o.perKg) > 0)) return EMPTY;
  // Legacy shapes: only the two the engine bills like an option can be shown as one.
  if ((o.mode && o.mode !== 'legacy') || num(o.thresholdWeight) > 0) return { ...EMPTY, enabled: true, custom: true };
  if (bt === 'per_kg' && fixed === 0) return { ...EMPTY, enabled: true, type: 'per_kg', rate: num(o.perKg) || variable };
  if (variable === 0) return { ...EMPTY, enabled: true, type: 'per_shipment', amount: fixed }; // engine: flat
  return { ...EMPTY, enabled: true, custom: true };
}

/** Picker state → { odaCharges, odaMatrix }, same shapes as Add Vendor saves. */
export function writeOda(s: OdaState): { odaCharges: Rate; odaMatrix: Rate } {
  const noMatrix = { type: 'distance_weight_matrix', matrix: [] };
  const base = { mode: 'legacy', matrix: [] as MatrixRow[] };
  if (!s.enabled) return { odaCharges: { ...base, fixed: 0, variable: 0, perKg: 0, minimum: 0, type: 'per_kg', billingType: 'per_kg' }, odaMatrix: noMatrix };
  switch (s.type) {
    case 'per_kg': return { odaCharges: { ...base, fixed: 0, variable: s.rate, perKg: s.rate, minimum: 0, type: 'legacy', billingType: 'per_kg' }, odaMatrix: noMatrix };
    case 'per_shipment': return { odaCharges: { ...base, fixed: s.amount, variable: 0, perKg: 0, minimum: s.amount, type: 'per_shipment', billingType: 'per_shipment' }, odaMatrix: noMatrix };
    case 'per_kg_minimum': return { odaCharges: { ...base, fixed: s.minimum, variable: s.rate, perKg: s.rate, minimum: s.minimum, type: 'per_kg_minimum', billingType: 'per_kg_minimum' }, odaMatrix: noMatrix };
    case 'per_kg_excess': return { odaCharges: { ...base, fixed: s.base, variable: s.extra, fixedAmount: s.base, thresholdWeight: s.limit, variableRange: s.extra, type: 'per_kg_excess', billingType: 'per_kg_excess' }, odaMatrix: noMatrix };
    case 'negotiable': return { odaCharges: { ...base, fixed: 0, variable: 0, type: 'negotiable', billingType: 'negotiable', note: 'Negotiable' }, odaMatrix: noMatrix };
    case 'matrix': return {
      odaCharges: { ...base, fixed: 0, variable: 0, type: 'distance_weight_matrix', billingType: 'matrix', matrixType: '2d', matrix: s.matrix },
      odaMatrix: { type: 'distance_weight_matrix', matrix: s.matrix },
    };
  }
}

export function odaSummary(s: OdaState): string {
  if (s.custom) return 'Custom setup';
  if (!s.enabled) return 'No';
  switch (s.type) {
    case 'per_kg': return `₹${s.rate}/kg`;
    case 'per_shipment': return `₹${s.amount} flat`;
    case 'per_kg_minimum': return `₹${s.rate}/kg, min ₹${s.minimum}`;
    case 'per_kg_excess': return `₹${s.base} up to ${s.limit} kg, then ₹${s.extra}/kg`;
    case 'matrix': return `${s.matrix.length} distance row${s.matrix.length === 1 ? '' : 's'}`;
    case 'negotiable': return 'Negotiable';
  }
}

const FIELD_MAX = 5000;
const inputCls = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100 dark:border-[#1d3f5c] dark:bg-[#0b1d2e] dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const toNum = (raw: string, max = FIELD_MAX): number | null => {
  const d = raw.replace(/[^0-9.]/g, '');
  if (d === '') return null;
  const n = parseFloat(d);
  return Number.isNaN(n) ? null : Math.min(n, max);
};
const noSign = (e: React.KeyboardEvent) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); };

const Field: React.FC<{ label: string; hint?: string; unit: string; value: number; onChange: (v: number) => void; autoFocus?: boolean }> = ({ label, hint, unit, value, onChange, autoFocus }) => (
  <div className="min-w-[120px] flex-1">
    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</label>
    <div className="relative">
      <input type="number" min={0} max={FIELD_MAX} placeholder="0" autoFocus={autoFocus} value={value || ''} onKeyDown={noSign}
        onChange={(e) => onChange(toNum(e.target.value) ?? 0)} className={`${inputCls} pr-12`} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{unit}</span>
    </div>
    {hint && <p className="mt-1 text-[10px] leading-snug text-slate-400">{hint}</p>}
  </div>
);

const Modal: React.FC<{ title: string; sub: string; onClose: () => void; wide?: boolean; children: React.ReactNode; footer: React.ReactNode }> = ({ title, sub, onClose, wide, children, footer }) =>
  createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        className={`flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#0d2438] ${wide ? 'max-w-4xl' : 'max-w-[440px]'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-[#1d3f5c] dark:bg-white/5">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#1d3f5c] dark:bg-white/5">{footer}</div>
      </div>
    </div>,
    document.body,
  );

const doneBtn = 'rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700';

// Distance × weight slab table (rows = distance ranges, columns = weight ranges), as in Add Vendor.
const MatrixEditor: React.FC<{ value: MatrixRow[]; onChange: (m: MatrixRow[]) => void }> = ({ value, onChange }) => {
  const m = value.length ? value : DEFAULT_MATRIX;
  const cols = m[0]?.bands || [];
  const setCol = (ci: number, patch: Partial<Band>) => onChange(m.map((r) => ({ ...r, bands: r.bands.map((b, i) => (i === ci ? { ...b, ...patch } : b)) })));
  const setRow = (ri: number, patch: Partial<MatrixRow>) => onChange(m.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  const setCell = (ri: number, ci: number, charge: number) => onChange(m.map((r, i) => (i === ri ? { ...r, bands: r.bands.map((b, j) => (j === ci ? { ...b, charge } : b)) } : r)));
  const small = 'w-14 rounded border border-slate-200 bg-white p-1 text-center text-[11px] font-medium outline-none focus:border-blue-400 dark:border-[#1d3f5c] dark:bg-[#0b1d2e] dark:text-white';
  const range = (min: number | null, max: number | null, onMin: (v: number | null) => void, onMax: (v: number | null) => void) => (
    <div className="flex items-center justify-center gap-1">
      <input type="number" className={small} placeholder="Min" value={min ?? ''} onKeyDown={noSign} onChange={(e) => onMin(toNum(e.target.value, 100000))} />
      <span className="text-[10px] text-slate-400">-</span>
      <input type="number" className={small} placeholder="Max" value={max ?? ''} onKeyDown={noSign} onChange={(e) => onMax(toNum(e.target.value, 100000))} />
    </div>
  );
  return (
    <div className="p-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
        <table className="w-full min-w-[600px] border-collapse text-center">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:border-[#1d3f5c] dark:bg-white/5">
            <tr>
              <th className="w-[160px] border-r border-slate-200 px-2 py-3 dark:border-[#1d3f5c]">Distance (KM) \ Weight (KG)</th>
              {cols.map((b, ci) => (
                <th key={ci} className="relative min-w-[120px] border-r border-slate-200 px-2 py-2 dark:border-[#1d3f5c]">
                  {range(b.minKg, b.maxKg, (v) => setCol(ci, { minKg: v }), (v) => setCol(ci, { maxKg: v }))}
                  {cols.length > 1 && <button type="button" title="Remove weight column" onClick={() => onChange(m.map((r) => ({ ...r, bands: r.bands.filter((_, i) => i !== ci) })))} className="absolute right-1 top-1 text-[10px] font-bold text-red-400 hover:text-red-600">✕</button>}
                </th>
              ))}
              <th className="w-[90px] px-2 py-2">
                <button type="button" onClick={() => onChange(m.map((r) => ({ ...r, bands: [...r.bands, { minKg: null, maxKg: null, charge: 0 }] })))} className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-100">+ Col</button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1d3f5c]">
            {m.map((r, ri) => (
              <tr key={ri}>
                <td className="border-r border-slate-200 p-2 dark:border-[#1d3f5c]">{range(r.minDist, r.maxDist, (v) => setRow(ri, { minDist: v }), (v) => setRow(ri, { maxDist: v }))}</td>
                {r.bands.map((b, ci) => (
                  <td key={ci} className="border-r border-slate-100 p-2 dark:border-[#1d3f5c]">
                    <input type="number" placeholder="₹" value={b.charge || ''} onKeyDown={noSign} onChange={(e) => setCell(ri, ci, toNum(e.target.value) ?? 0)}
                      aria-label={`Charge for ${r.minDist ?? 0}-${r.maxDist ?? '∞'} km, ${b.minKg ?? 0}-${b.maxKg ?? '∞'} kg`}
                      className="w-full rounded bg-slate-50 p-1.5 text-center text-[12px] font-bold text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400 dark:bg-white/5 dark:text-white" />
                  </td>
                ))}
                <td className="p-2">{m.length > 1 && <button type="button" onClick={() => onChange(m.filter((_, i) => i !== ri))} className="text-[10px] font-bold text-red-400 hover:text-red-600">✕ Row</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-center">
        <button type="button" onClick={() => onChange([...m, { minDist: null, maxDist: null, bands: cols.map((b) => ({ minKg: b.minKg, maxKg: b.maxKg, charge: 0 })) }])}
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-100">+ Add Distance Row</button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">Leave Max empty for "and above". Distance is from your pickup to the delivery pincode.</p>
    </div>
  );
};

/** The ODA row's Yes/No + edit button, with Add Vendor's billing-type popup and slab-table modal. */
const OdaPicker: React.FC<{ state: OdaState; onChange: (s: OdaState) => void }> = ({ state, onChange }) => {
  const [open, setOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const set = (patch: Partial<OdaState>) => onChange({ ...state, custom: false, ...patch });
  const pick = (type: OdaType) => set({ type, enabled: true, matrix: type === 'matrix' && !state.matrix.length ? DEFAULT_MATRIX : state.matrix });

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <select aria-label="ODA charged" value={state.enabled ? 'yes' : 'no'}
          onChange={(e) => { if (e.target.value === 'yes') { set({ enabled: true }); setOpen(true); } else set({ enabled: false }); }}
          className="h-[30px] w-20 rounded border border-slate-200 bg-white px-1 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-[#1d3f5c] dark:bg-[#0b1d2e] dark:text-white">
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
        {state.enabled && <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>}
      </div>

      {open && (
        <Modal title="How is ODA charged?" sub="Pick the billing logic you use for out-of-delivery-area shipments." onClose={() => setOpen(false)}
          footer={<button type="button" onClick={() => setOpen(false)} className={doneBtn}>Done</button>}>
          <div role="radiogroup" aria-label="ODA charge type" className="space-y-1.5">
            {ODA_OPTIONS.map((opt) => {
              const active = !state.custom && state.type === opt.type;
              return (
                <div key={opt.type} className={`rounded-xl border transition-colors ${active ? 'border-blue-400 bg-blue-50/60 dark:bg-white/5' : 'border-slate-200 hover:border-slate-300 dark:border-[#1d3f5c]'}`}>
                  <button type="button" role="radio" aria-checked={active} onClick={() => pick(opt.type)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-blue-500' : 'border-slate-300'}`}>{active && <span className="h-2 w-2 rounded-full bg-blue-500" />}</span>
                    <span className="min-w-0">
                      <span className={`block text-[13px] font-semibold ${active ? 'text-blue-800 dark:text-blue-300' : 'text-slate-700 dark:text-white'}`}>{opt.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{opt.blurb}</span>
                    </span>
                  </button>
                  {active && (
                    <div className="flex flex-wrap gap-2 px-3 pb-3 pl-9 pt-0.5">
                      {opt.type === 'per_kg' && <Field label="Rate" unit="₹/KG" value={state.rate} onChange={(rate) => set({ rate })} autoFocus />}
                      {opt.type === 'per_shipment' && <Field label="Flat Amount" unit="₹" value={state.amount} onChange={(amount) => set({ amount })} autoFocus />}
                      {opt.type === 'per_kg_minimum' && <>
                        <Field label="Rate" unit="₹/KG" value={state.rate} onChange={(rate) => set({ rate })} autoFocus />
                        <Field label="Minimum Floor" hint="Charge never drops below this" unit="₹" value={state.minimum} onChange={(minimum) => set({ minimum })} />
                      </>}
                      {opt.type === 'per_kg_excess' && <>
                        <Field label="Base Amount" hint="Covers weight up to the limit" unit="₹" value={state.base} onChange={(b) => set({ base: b })} autoFocus />
                        <Field label="Weight Limit" hint="Base amount applies up to here" unit="KG" value={state.limit} onChange={(limit) => set({ limit })} />
                        <Field label="Extra Rate" hint="Only on weight above the limit" unit="₹/KG" value={state.extra} onChange={(extra) => set({ extra })} />
                      </>}
                      {opt.type === 'matrix' && (
                        <div>
                          <button type="button" onClick={() => { setOpen(false); setMatrixOpen(true); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
                            {state.matrix.length ? 'Edit Slab Table →' : 'Configure Slab Table →'}
                          </button>
                          {state.matrix.length > 0 && <p className="mt-1.5 text-[10px] text-slate-400">{state.matrix.length} row(s) configured.</p>}
                        </div>
                      )}
                      {opt.type === 'negotiable' && <p className="text-[11px] text-slate-400">No amount needed — shippers see "Negotiable" and ODA is settled at booking.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {matrixOpen && (
        <Modal wide title="ODA Matrix Configuration" sub="Configure distance and weight bands for Out of Delivery Area charges." onClose={() => setMatrixOpen(false)}
          footer={<button type="button" onClick={() => setMatrixOpen(false)} className={doneBtn}>Done</button>}>
          <MatrixEditor value={state.matrix} onChange={(matrix) => set({ type: 'matrix', enabled: true, matrix })} />
        </Modal>
      )}
    </>
  );
};

export default OdaPicker;
