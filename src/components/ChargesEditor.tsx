// Charges table for the rates editor — same sections, rows, limits, tooltips and required marks as the
// website's Add Vendor charges step (freight-compare-frontend ChargesSection.tsx), writing the transporter's
// own priceRate shape. Every unit offered is one the quote engine actually bills that way
// (freight-compare-backend/utils/chargeFormulas.js):
//   ₹      → fixed            (flat per shipment)
//   ₹/KG   → perKg            (₹ × billable weight; handling uses type 'per_kg_minimum')
//   %      → variable         (% of base freight)
import React, { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import OdaPicker, { readOda, writeOda, odaSummary } from './OdaPicker';

type Rate = Record<string, any>;
type Unit = 'flat' | 'kg' | 'pct';

const UNIT_LABEL: Record<Unit, string> = { flat: '₹', kg: '₹/KG', pct: '%' };
const FLAT_MAX = 1000;   // Add Vendor's per-charge ceiling
const PCT_MAX = 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── Card charges (Fixed | Variable) ─────────────────────────────────────────
interface CardDef { key: string; label: string; tip: string; units: Unit[]; required?: boolean }
const CARDS: Record<string, CardDef> = {
  rovCharges: { key: 'rovCharges', label: 'ROV / FOV', tip: 'Risk/Freight of Value: flat, per kg, or % of freight', units: ['flat', 'kg', 'pct'] },
  handlingCharges: { key: 'handlingCharges', label: 'Handling', tip: 'Material handling: flat per shipment or per kg', units: ['flat', 'kg'], required: true },
  insuaranceCharges: { key: 'insuaranceCharges', label: 'Insurance', tip: 'Insurance on the shipment: flat, per kg, or % of freight', units: ['flat', 'kg', 'pct'] },
  fmCharges: { key: 'fmCharges', label: 'First mile (FM)', tip: 'Pickup / first-mile charge', units: ['flat', 'kg', 'pct'] },
  greenTax: { key: 'greenTax', label: 'Green Tax / NGT', tip: 'Environmental surcharge levied by state', units: ['flat', 'kg'] },
  hamaliCharges: { key: 'hamaliCharges', label: 'Hamali', tip: 'Loading & unloading labour charges', units: ['flat', 'kg', 'pct'] },
  miscellanousCharges: { key: 'miscellanousCharges', label: 'MISC / AOC', tip: 'Miscellaneous or airport operations charges', units: ['flat', 'kg'] },
  topayCharges: { key: 'topayCharges', label: 'To-Pay', tip: 'Surcharge for consignee-paid shipments', units: ['flat', 'kg', 'pct'] },
  codCharges: { key: 'codCharges', label: 'COD / DOD', tip: 'Cash/Demand Draft on Delivery fee', units: ['flat', 'kg', 'pct'] },
  daccCharges: { key: 'daccCharges', label: 'DACC', tip: 'Delivery Area Congestion Charge', units: ['flat', 'kg', 'pct'] },
};

// Which unit a saved charge is billed in, and its value. Older shapes are read the way the engine reads them.
function readCard(key: string, d: Rate | undefined): { unit: Unit; value: number; mixed: boolean } {
  const r = d && typeof d === 'object' ? d : {};
  const fixed = num(r.fixed), variable = num(r.variable), perKg = num(r.perKg);
  if (key === 'handlingCharges' && r.type === 'per_kg_minimum') return { unit: 'kg', value: perKg, mixed: false };
  if (perKg > 0) return { unit: 'kg', value: perKg, mixed: fixed > 0 };
  if (key === 'greenTax' && variable > 0) return { unit: 'kg', value: variable, mixed: fixed > 0 }; // engine: variable is ₹/kg
  if (key === 'miscellanousCharges') return { unit: 'flat', value: fixed || variable, mixed: false }; // engine: fixed || variable
  if (fixed > 0) return { unit: 'flat', value: fixed, mixed: variable > 0 };
  if (variable > 0) return { unit: 'pct', value: variable, mixed: false };
  return { unit: 'flat', value: 0, mixed: false };
}

function writeCard(key: string, d: Rate | undefined, unit: Unit, value: number): Rate {
  const base = { ...(d && typeof d === 'object' ? d : {}), fixed: 0, variable: 0, perKg: 0 };
  if (unit === 'flat') base.fixed = value;
  if (unit === 'pct') base.variable = value;
  if (unit === 'kg') base.perKg = value;
  if (key === 'handlingCharges') {
    base.type = unit === 'kg' ? 'per_kg_minimum' : 'legacy';
    if (unit === 'kg') base.minimum = 0;
  }
  return base;
}

// Single-value charges saved as a number or as { fixed } / { variable } (older sign-up shape).
const readSingle = (v: unknown, field: 'fixed' | 'variable') => (v && typeof v === 'object' ? num((v as Rate)[field]) : num(v));
const writeSingle = (v: unknown, field: 'fixed' | 'variable', value: number) =>
  v && typeof v === 'object' ? { ...(v as Rate), [field]: value } : value;

/** Required charges still missing (shown in red; saving waits for them). Same set as Add Vendor. */
export function missingRequiredCharges(rate: Rate): string[] {
  const missing: string[] = [];
  if (!(readSingle(rate.docketCharges, 'fixed') > 0)) missing.push('docketCharges');
  if (!(readSingle(rate.fuel, 'variable') > 0)) missing.push('fuel');
  if (!(readSingle(rate.gstPct ?? rate.gst, 'variable') > 0)) missing.push('gstPct');
  if (!(readCard('handlingCharges', rate.handlingCharges).value > 0)) missing.push('handlingCharges');
  return missing;
}

/** priceRate keys this table owns — the page's "Basic settings" card leaves these out. */
export const CHARGE_KEYS = new Set([
  'docketCharges', 'fuel', 'fuelMax', 'minWeight', 'minCharges', 'gstPct', 'gst', 'odaCharges', 'odaMatrix', ...Object.keys(CARDS),
]);

// ── UI pieces (mirroring ChargesSection.tsx) ─────────────────────────────────
const NumInput: React.FC<{ value: number; max: number; decimals?: number; error?: boolean; onChange: (v: number) => void; disabled?: boolean }> = ({ value, max, decimals = 2, error, onChange, disabled }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.round(Math.min(Math.max(n, 0), max) * 10 ** decimals) / 10 ** decimals;
  return (
    <input
      type="number" inputMode="decimal" min={0} max={max} step={decimals > 0 ? 10 ** -decimals : 1} disabled={disabled}
      value={draft ?? (value ? String(value) : '')}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') { setDraft(''); onChange(0); return; }
        const n = parseFloat(raw);
        if (Number.isNaN(n)) return;
        const c = clamp(n);
        setDraft(c === n ? raw : String(c));
        onChange(c);
      }}
      onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
      onBlur={() => setDraft(null)}
      className={`w-20 rounded border bg-white px-2 py-1 text-right text-sm text-slate-700 shadow-sm outline-none transition focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 dark:bg-[#0b1d2e] dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${error ? 'border-red-400 ring-1 ring-red-100 focus:ring-red-300' : 'border-slate-200 focus:border-blue-400 focus:ring-blue-400 dark:border-[#1d3f5c]'}`}
    />
  );
};

const ModeToggle: React.FC<{ isFixed: boolean; onChange: (fixed: boolean) => void; disabled?: boolean }> = ({ isFixed, onChange, disabled }) => (
  <span className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 p-0.5 dark:border-[#1d3f5c] dark:bg-white/5">
    {[true, false].map((f) => (
      <button key={String(f)} type="button" disabled={disabled} onClick={() => onChange(f)}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${isFixed === f ? 'border border-blue-100 bg-white text-blue-700 shadow-sm dark:border-transparent dark:bg-[#12304a] dark:text-blue-300' : 'text-slate-400 hover:text-slate-600'}`}>
        {f ? 'Fixed' : 'Variable'}
      </button>
    ))}
  </span>
);

const Tip: React.FC<{ text: string }> = ({ text }) => (
  <span className="group relative shrink-0 cursor-help">
    <Info size={13} className="text-slate-400" />
    <span className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-1 w-48 rounded bg-slate-800 p-1.5 text-[10px] font-normal normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">{text}</span>
  </span>
);

const Row: React.FC<{
  label: string; tip?: string; required?: boolean; indent?: boolean; error?: string; note?: string;
  prefix?: React.ReactNode; type?: React.ReactNode; value: React.ReactNode; unit: React.ReactNode; dim?: boolean;
}> = ({ label, tip, required, indent, error, note, prefix, type, value, unit, dim }) => (
  <>
    <tr className={`transition-colors hover:bg-blue-50/50 dark:hover:bg-white/5 ${dim ? 'opacity-50' : ''}`}>
      <td className="px-2 py-1.5">
        <span className={`flex items-center gap-1.5 leading-tight ${indent ? 'pl-4 text-sm text-slate-400' : 'text-sm text-slate-800 dark:text-white'}`}>
          {prefix}
          <span className="truncate uppercase tracking-wide">{label}</span>
          {required && <span className="shrink-0 font-bold text-red-500">*</span>}
          {tip && <Tip text={tip} />}
        </span>
      </td>
      <td className="px-1 py-1.5 text-center">{type ?? <span className="text-xs text-slate-400">—</span>}</td>
      <td className="py-1.5 pr-1 text-right">{value}</td>
      <td className="py-1.5 pl-1 text-xs font-bold uppercase tracking-wide text-slate-400">{unit}</td>
    </tr>
    {(error || note) && (
      <tr><td colSpan={4} className={`px-2 pb-1.5 text-xs font-medium ${error ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'}`}>{error || note}</td></tr>
    )}
  </>
);

const Section: React.FC<{ icon: string; title: string; open: boolean; onToggle: () => void; badge?: string; children: React.ReactNode }> = ({ icon, title, open, onToggle, badge, children }) => (
  <div>
    <button type="button" onClick={onToggle} className="group flex w-full items-center gap-2 rounded-lg px-2 pb-1.5 pt-4 hover:bg-slate-50 dark:hover:bg-white/5">
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-extrabold uppercase tracking-widest text-slate-700 group-hover:text-blue-600 dark:text-white">{title}</span>
      {!open && badge && <span className="ml-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">{badge}</span>}
      <div className="ml-1 h-px flex-1 bg-slate-200 dark:bg-[#1d3f5c]" />
      <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
    {open && (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-100 dark:border-[#1d3f5c] dark:bg-white/5">
              <th className="w-[30%] px-2 py-2 text-left text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-[#8fb0cf]">Charge</th>
              <th className="w-[30%] px-1 py-2 text-center text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-[#8fb0cf]">Type</th>
              <th className="w-[20%] py-2 pr-1 text-right text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-[#8fb0cf]">Value</th>
              <th className="w-[20%] py-2 pl-1 text-left text-xs font-extrabold uppercase tracking-widest text-slate-600 dark:text-[#8fb0cf]">Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1d3f5c]">{children}</tbody>
        </table>
      </div>
    )}
  </div>
);

// ── Main ────────────────────────────────────────────────────────────────────
const ChargesEditor: React.FC<{ rate: Rate; onChange: (key: string, value: unknown) => void; showErrors: boolean }> = ({ rate, onChange, showErrors }) => {
  const [open, setOpen] = useState({ basic: true, additional: true, optional: false });
  // Mode picked on screen. A charge with no value yet has no unit of its own, so without this a switch to
  // Variable or ₹/KG would snap straight back to Fixed ₹ (Add Vendor keeps the mode separately too).
  const [picked, setPicked] = useState<Record<string, Unit>>({});
  // Ticked optional charges (UI only; an unticked one is saved as 0). Saved values > 0 start ticked.
  const [optOn, setOptOn] = useState<Set<string>>(() => new Set(['topayCharges', 'codCharges', 'daccCharges'].filter((k) => readCard(k, rate[k]).value > 0)));
  const missing = new Set(missingRequiredCharges(rate));
  const err = (key: string, label: string) => (showErrors && missing.has(key) ? `${label} is required` : undefined);

  const cardRow = (key: string, optional = false) => {
    const def = CARDS[key];
    const saved = readCard(key, rate[key]);
    const unit = picked[key] ?? saved.unit;
    const value = picked[key] && picked[key] !== saved.unit ? 0 : saved.value;
    const mixed = saved.mixed && !picked[key];
    const enabled = !optional || value > 0 || optOn.has(key);
    const set = (u: Unit, v: number) => { setPicked((p) => ({ ...p, [key]: u })); onChange(key, writeCard(key, rate[key], u, v)); };
    const hasPct = def.units.includes('pct');
    const isFixed = unit !== 'pct';
    const unitCell = isFixed && def.units.includes('kg') ? (
      <select value={unit} onChange={(e) => set(e.target.value as Unit, 0)} disabled={!enabled}
        className="rounded border border-slate-200 bg-white px-1 py-1 text-xs font-bold text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-[#1d3f5c] dark:bg-[#0b1d2e]">
        <option value="flat">₹</option>
        <option value="kg">₹/KG</option>
      </select>
    ) : UNIT_LABEL[unit];
    return (
      <Row
        key={key} label={def.label} tip={def.tip} required={def.required} dim={!enabled}
        error={def.required ? err(key, def.label) : undefined}
        note={mixed ? 'Saved with two values; editing this row keeps only the one shown.' : undefined}
        prefix={optional ? (
          <input type="checkbox" checked={!!enabled} className="mr-1 h-3 w-3 shrink-0 cursor-pointer accent-blue-600"
            onChange={(e) => {
              const on = e.target.checked;
              setOptOn((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });
              if (!on) onChange(key, writeCard(key, rate[key], 'flat', 0));
            }} />
        ) : undefined}
        type={hasPct ? <ModeToggle isFixed={isFixed} disabled={!enabled} onChange={(f) => set(f ? 'flat' : 'pct', 0)} /> : <span className="text-xs text-slate-400">Fixed</span>}
        value={<NumInput value={value} max={unit === 'pct' ? PCT_MAX : FLAT_MAX} disabled={!enabled} error={!!(def.required && err(key, def.label))} onChange={(v) => set(unit, v)} />}
        unit={unitCell}
      />
    );
  };

  const oda = readOda(rate.odaCharges, rate.odaMatrix);
  const handlingThreshold = num(rate.handlingCharges?.thresholdWeight ?? rate.handlingCharges?.threshholdweight);
  const optionalActive = ['topayCharges', 'codCharges', 'daccCharges'].filter((k) => readCard(k, rate[k]).value > 0).length;

  return (
    <div className="flex flex-col">
      <Section icon="💰" title="Basic Charges" open={open.basic} onToggle={() => setOpen((o) => ({ ...o, basic: !o.basic }))}>
        <Row label="Docket Charges" tip="Fixed charge per booking" required error={err('docketCharges', 'Docket charges')} unit="₹"
          value={<NumInput value={readSingle(rate.docketCharges, 'fixed')} max={FLAT_MAX} error={!!err('docketCharges', '')} onChange={(v) => onChange('docketCharges', writeSingle(rate.docketCharges, 'fixed', v))} />} />
        <Row label="Fuel Surcharge" tip="% of base freight" required error={err('fuel', 'Fuel surcharge')} unit="%"
          type={<span className="text-xs text-slate-400">% on Base</span>}
          value={<NumInput value={readSingle(rate.fuel, 'variable')} max={50} error={!!err('fuel', '')} onChange={(v) => onChange('fuel', writeSingle(rate.fuel, 'variable', v))} />} />
        <Row label="› Fuel cap" tip="Fuel surcharge never goes above this amount. Leave empty for no cap." indent unit="₹"
          value={<NumInput value={num(rate.fuelMax)} max={5000} onChange={(v) => onChange('fuelMax', v)} />} />
        <Row label="Min Chargeable Wt" tip="Minimum billable weight per consignment" unit="KG"
          value={<NumInput value={num(rate.minWeight)} max={1000} decimals={1} onChange={(v) => onChange('minWeight', v)} />} />
        <Row label="Minimum Charges" tip="Floor charge regardless of weight" unit="₹"
          value={<NumInput value={readSingle(rate.minCharges, 'fixed')} max={FLAT_MAX} onChange={(v) => onChange('minCharges', writeSingle(rate.minCharges, 'fixed', v))} />} />
        <Row label="GST %" tip="GST percentage applied on final freight" required error={err('gstPct', 'GST')} unit="%"
          type={<span className="text-xs text-slate-400">% on Total</span>}
          value={<NumInput value={readSingle(rate.gstPct ?? rate.gst, 'variable')} max={PCT_MAX} error={!!err('gstPct', '')}
            onChange={(v) => onChange('gstPct', rate.gstPct && typeof rate.gstPct === 'object' ? { ...rate.gstPct, variable: v } : { variable: v, fixed: 0 })} />} />
        {cardRow('rovCharges')}
        <Row label="ODA Charges" tip="Out of Delivery Area surcharge — per KG, flat fee, per KG with a floor, base + extra, slab matrix, or negotiable"
          note={oda.custom ? 'Custom ODA setup, kept as it is. Pick a type under Edit to replace it.' : undefined}
          type={<span className="text-xs text-slate-500">{odaSummary(oda)}</span>}
          value={<OdaPicker state={oda} onChange={(next) => { const w = writeOda(next); onChange('odaCharges', w.odaCharges); onChange('odaMatrix', w.odaMatrix); }} />}
          unit="" />
        {cardRow('handlingCharges')}
        <Row label="› Weight Threshold" tip="Weight above which handling charge applies" indent unit="KG"
          value={<NumInput value={handlingThreshold} max={1000} decimals={1}
            onChange={(v) => onChange('handlingCharges', { ...(rate.handlingCharges || {}), thresholdWeight: v, threshholdweight: v })} />} />
      </Section>

      <Section icon="📋" title="Additional Charges" open={open.additional} onToggle={() => setOpen((o) => ({ ...o, additional: !o.additional }))} badge="5 rows">
        {['greenTax', 'hamaliCharges', 'miscellanousCharges', 'insuaranceCharges', 'fmCharges'].map((k) => cardRow(k))}
      </Section>

      <Section icon="⚙️" title="Optional Charges" open={open.optional} onToggle={() => setOpen((o) => ({ ...o, optional: !o.optional }))} badge={`${optionalActive} active`}>
        {['topayCharges', 'codCharges', 'daccCharges'].map((k) => cardRow(k, true))}
      </Section>
    </div>
  );
};

export default ChargesEditor;
