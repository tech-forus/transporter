// An UPDATED rate sheet turned into a preview. The sheet is read with the same readers the sign-up uses; this decides what would change:
//   * a value the sheet states replaces the one on file (it is an update, unlike sign-up where only blanks are filled);
//   * a blank or zero in the sheet never erases what you have;
//   * only zone-to-zone rates between zones you already serve are updated (the sheet's pincodes are not part of this update);
//   * a rate above the editor's limit is skipped, like the editor itself refuses it.
// Pure: nothing is saved here and the inputs are never changed.
import type { ParsedUtsfResult } from '../lib/standaloneUtsfExtraction';
import type { DiffItem } from '../components/ReconfirmModal';
import type { PincodePriceSheet } from '../lib/pincodePriceSheet';

type Rate = Record<string, any>;
type Zones = Record<string, Record<string, number>>;
export const ZONE_RATE_MAX = 100; // per kg, same limit as the rates editor

const fixedOnly = (n: number) => ({ variable: 0, fixed: n });
const both = (c: { variable: number; fixed: number }) => ({ variable: c.variable, fixed: c.fixed });
const set = (c?: { variable: number; fixed: number }) => !!c && (c.variable > 0 || c.fixed > 0);

/** What a parsed sheet says about charges, in the shape the editor stores. Only values the sheet actually states. */
function chargePatch(r: ParsedUtsfResult): Rate {
  const p = r.pricing;
  const out: Rate = {};
  if (p.minWeight > 0) out.minWeight = p.minWeight;
  if (p.docketCharges > 0) out.docketCharges = fixedOnly(p.docketCharges);
  if (p.fuel > 0) out.fuel = { variable: p.fuel, fixed: 0 };
  if (p.minCharges > 0) out.minCharges = fixedOnly(p.minCharges);
  if (p.greenTax > 0) out.greenTax = fixedOnly(p.greenTax);
  if (p.miscellanousCharges > 0) out.miscellanousCharges = fixedOnly(p.miscellanousCharges);
  if (p.daccCharges > 0) out.daccCharges = fixedOnly(p.daccCharges);
  if (set(p.rovCharges)) out.rovCharges = both(p.rovCharges);
  if (set(p.odaCharges)) out.odaCharges = both(p.odaCharges);
  if (set(p.topayCharges)) out.topayCharges = both(p.topayCharges);
  if (set(p.codCharges)) out.codCharges = both(p.codCharges);
  if (set(p.prepaidCharges)) out.prepaidCharges = both(p.prepaidCharges);
  if (set(p.fmCharges)) out.fmCharges = both(p.fmCharges);
  if (set(p.appointmentCharges)) out.appointmentCharges = both(p.appointmentCharges);
  if (set(p.insuranceCharges)) out.insuaranceCharges = both(p.insuranceCharges); // (sic) the stored key
  if (set(p.handlingCharges)) out.handlingCharges = { ...both(p.handlingCharges), threshholdweight: p.handlingCharges.thresholdWeight };
  const gst = (r as any)._gstPct;
  if (typeof gst === 'number' && gst > 0) out.gstPct = { variable: gst, fixed: 0 };
  return out;
}

const NAMES: Record<string, string> = {
  minWeight: 'Minimum chargeable weight', docketCharges: 'Docket charges', fuel: 'Fuel surcharge', minCharges: 'Minimum charges', gstPct: 'GST',
  rovCharges: 'ROV / FOV charges', odaCharges: 'ODA charges', handlingCharges: 'Handling charges', greenTax: 'Green tax', hamaliCharges: 'Hamali charges',
  miscellanousCharges: 'Miscellaneous charges', topayCharges: 'To-pay charges', codCharges: 'COD charges', daccCharges: 'DACC charges',
  insuaranceCharges: 'Insurance charges', prepaidCharges: 'Prepaid charges', fmCharges: 'First-mile charges', appointmentCharges: 'Appointment charges',
};
const words = (k: string) => NAMES[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
/** "docketCharges.fixed" -> "Docket charges (₹)": plain words for the preview. */
function chargeLabel(key: string, sub?: string): string {
  if (!sub) return key === 'minWeight' ? `${words(key)} (kg)` : words(key);
  if (sub === 'threshholdweight') return `${words(key)}: weight limit (kg)`;
  if (key === 'fuel' && sub === 'variable') return `${words(key)} (% of freight)`;
  return `${words(key)} (${sub === 'variable' ? '% of freight' : '₹'})`;
}

const same = (a: unknown, b: unknown) => (Number(a) || 0) === (Number(b) || 0);

export interface PlanOptions {
  /** "Delivery pincode + price" sheets: one price per destination zone, measured from `originZone` (default: the sheet's own guess). */
  pincodePrices?: PincodePriceSheet[];
  originZone?: string;
}

export function planRatesUpdate(current: { priceRate: Rate; zoneRates: Zones }, sheets: ParsedUtsfResult[], options: PlanOptions = {}) {
  const priceRate: Rate = JSON.parse(JSON.stringify(current.priceRate || {}));
  const zoneRates: Zones = JSON.parse(JSON.stringify(current.zoneRates || {}));
  const known = new Set(Object.keys(zoneRates));
  const skipped = { newZones: [] as string[], overLimit: 0, pincodes: 0 };

  for (const sheet of sheets) {
    Object.assign(priceRate, chargePatch(sheet));
    skipped.pincodes += sheet.service?.length || 0;
    sheet.zoneLabels.forEach((from, i) => sheet.zoneLabels.forEach((to, j) => {
      const v = sheet.zoneMatrix[i]?.[j] || 0;
      if (!(v > 0)) return;
      if (!known.has(from) || !known.has(to)) {
        for (const z of [from, to]) if (!known.has(z) && !skipped.newZones.includes(z)) skipped.newZones.push(z);
        return;
      }
      if (v > ZONE_RATE_MAX) { skipped.overLimit += 1; return; }
      zoneRates[from] = { ...(zoneRates[from] || {}), [to]: v };
    }));
  }

  // A pincode + price sheet: its zones arrive WITH their pincodes, so they are part of the update; its prices fill one row of the table.
  const service: PincodePriceSheet['service'] = [];
  const serviceZones = new Set<string>();
  for (const ps of options.pincodePrices || []) {
    const origin = options.originZone && ps.zones.includes(options.originZone) ? options.originZone : ps.originGuess;
    service.push(...ps.service);
    ps.zones.forEach((z) => serviceZones.add(z));
    for (const zone of ps.zones) {
      const v = ps.destinationPrices[zone];
      if (!(v > 0)) continue;
      if (v > ZONE_RATE_MAX) { skipped.overLimit += 1; continue; }
      zoneRates[origin] = { ...(zoneRates[origin] || {}), [zone]: v };
    }
  }

  const diff: DiffItem[] = [];
  for (const key of Object.keys(priceRate)) {
    const before = current.priceRate?.[key];
    const after = priceRate[key];
    if (after && typeof after === 'object') {
      for (const sub of new Set([...Object.keys(before || {}), ...Object.keys(after)])) {
        if (!same(before?.[sub], after[sub])) diff.push({ path: `priceRate.${key}.${sub}`, label: chargeLabel(key, sub), from: Number(before?.[sub]) || 0, to: Number(after[sub]) || 0 });
      }
    } else if (!same(before, after)) diff.push({ path: `priceRate.${key}`, label: chargeLabel(key), from: Number(before) || 0, to: Number(after) || 0 });
  }
  for (const from of Object.keys(zoneRates)) {
    for (const to of Object.keys(zoneRates[from] || {})) {
      const before = current.zoneRates?.[from]?.[to];
      if (!same(before, zoneRates[from][to])) diff.push({ path: `zoneRates.${from}.${to}`, label: `Rate from ${from} to ${to} (₹ per kg)`, from: Number(before) || 0, to: zoneRates[from][to] });
    }
  }
  // Stable order for the preview: charges first, then lanes.
  diff.sort((a, b) => Number(a.path.startsWith('zoneRates')) - Number(b.path.startsWith('zoneRates')));
  const coverage = { pincodes: service.length, zones: serviceZones.size };
  return { priceRate, zoneRates, diff, skipped, service, coverage, changed: diff.length > 0 || service.length > 0 };
}
