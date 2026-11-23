import { describe, it, expect } from 'vitest';
import { planRatesUpdate } from './ratesUpdate';
import type { PincodePriceSheet } from '../lib/pincodePriceSheet';
import type { ParsedUtsfResult } from '../lib/standaloneUtsfExtraction';

const charge = { variable: 0, fixed: 0 };
const pricing = (over: Record<string, unknown> = {}) => ({
  minWeight: 0, docketCharges: 0, fuel: 0, rovCharges: { ...charge }, insuranceCharges: { ...charge }, odaCharges: { ...charge }, codCharges: { ...charge },
  prepaidCharges: { ...charge }, topayCharges: { ...charge }, handlingCharges: { ...charge, thresholdWeight: 0 }, fmCharges: { ...charge }, appointmentCharges: { ...charge },
  minCharges: 0, greenTax: 0, daccCharges: 0, miscellanousCharges: 0, ...over,
});
const sheet = (over: Partial<ParsedUtsfResult> = {}): ParsedUtsfResult => ({
  pricing: pricing() as never, sourcedFields: [], hasPricingData: true, zoneLabels: [], zoneMatrix: [], service: [], zoneCount: 0, totalPincodes: 0, companyName: '', ...over,
});

const current = {
  priceRate: { minWeight: 10, docketCharges: { variable: 0, fixed: 50 }, fuel: { variable: 10, fixed: 0 }, rovCharges: { variable: 0, fixed: 18 }, divisor: 5000 },
  zoneRates: { N1: { N1: 12, W1: 18 }, W1: { N1: 18, W1: 12 } } as Record<string, Record<string, number>>,
};

describe('plain-language labels for the preview', () => {
  it('names every change the way a transporter would say it', () => {
    const plan = planRatesUpdate(current, [sheet({ pricing: pricing({ docketCharges: 60, fuel: 12, minWeight: 15, handlingCharges: { variable: 0, fixed: 9, thresholdWeight: 100 } }) as never, zoneLabels: ['N1', 'W1'], zoneMatrix: [[12, 20], [18, 12]] })]);
    const label = (p: string) => plan.diff.find((d) => d.path === p)?.label;
    expect(label('priceRate.docketCharges.fixed')).toBe('Docket charges (₹)');
    expect(label('priceRate.fuel.variable')).toBe('Fuel surcharge (% of freight)');
    expect(label('priceRate.minWeight')).toBe('Minimum chargeable weight (kg)');
    expect(label('priceRate.handlingCharges.fixed')).toBe('Handling charges (₹)');
    expect(label('priceRate.handlingCharges.threshholdweight')).toBe('Handling charges: weight limit (kg)');
    expect(label('zoneRates.N1.W1')).toBe('Rate from N1 to W1 (₹ per kg)');
  });
});

describe('planRatesUpdate: an updated rate sheet becomes a preview of what changes', () => {
  it('changes only the lanes whose rate differs, and lists old -> new', () => {
    const plan = planRatesUpdate(current, [sheet({ zoneLabels: ['N1', 'W1'], zoneMatrix: [[12, 20], [18, 15]] })]);
    expect(plan.diff.map((d) => [d.path, d.from, d.to])).toEqual([['zoneRates.N1.W1', 18, 20], ['zoneRates.W1.W1', 12, 15]]);
    expect(plan.zoneRates.N1.W1).toBe(20);
    expect(plan.zoneRates.N1.N1).toBe(12); // untouched
    expect(plan.changed).toBe(true);
  });

  it('updates charges the sheet states, leaves the rest as they were', () => {
    const plan = planRatesUpdate(current, [sheet({ pricing: pricing({ docketCharges: 60, fuel: 12, rovCharges: { variable: 0, fixed: 18 } }) as never })]);
    expect(plan.diff.map((d) => [d.path, d.from, d.to])).toEqual([['priceRate.docketCharges.fixed', 50, 60], ['priceRate.fuel.variable', 10, 12]]);
    expect(plan.priceRate.docketCharges).toEqual({ variable: 0, fixed: 60 });
    expect(plan.priceRate.rovCharges).toEqual({ variable: 0, fixed: 18 });
    expect(plan.priceRate.divisor).toBe(5000);
    expect(plan.priceRate.minWeight).toBe(10);
  });

  it('a blank in the sheet never erases a value you have', () => {
    const plan = planRatesUpdate(current, [sheet({ zoneLabels: ['N1', 'W1'], zoneMatrix: [[0, 0], [0, 0]] })]);
    expect(plan.changed).toBe(false);
    expect(plan.diff).toEqual([]);
    expect(plan.zoneRates).toEqual(current.zoneRates);
  });

  it('does not add zones the account does not serve (their pincodes are not part of this update) and says so', () => {
    const plan = planRatesUpdate(current, [sheet({ zoneLabels: ['N1', 'S1'], zoneMatrix: [[12, 30], [25, 40]], service: [{ pincode: 560001, isOda: false, zone: 'S1' }] })]);
    expect(plan.diff).toEqual([]);
    expect(plan.zoneRates.S1).toBeUndefined();
    expect(plan.skipped.newZones).toEqual(['S1']);
    expect(plan.skipped.pincodes).toBe(1);
  });

  it('keeps the editor\'s own limit: a rate above Rs 100 per kg is skipped, not saved', () => {
    const plan = planRatesUpdate(current, [sheet({ zoneLabels: ['N1', 'W1'], zoneMatrix: [[12, 450], [18, 12]] })]);
    expect(plan.zoneRates.N1.W1).toBe(18);
    expect(plan.skipped.overLimit).toBe(1);
  });

  it('reads the GST the client parser found, and merges several sheets (the last one wins)', () => {
    const a = { ...sheet({ zoneLabels: ['N1', 'W1'], zoneMatrix: [[13, 0], [0, 0]] }), _gstPct: 18 } as ParsedUtsfResult;
    const b = sheet({ zoneLabels: ['N1', 'W1'], zoneMatrix: [[14, 0], [0, 0]] });
    const plan = planRatesUpdate(current, [a, b]);
    expect(plan.zoneRates.N1.N1).toBe(14);
    expect(plan.priceRate.gstPct).toEqual({ variable: 18, fixed: 0 });
    expect(plan.diff.map((d) => d.path)).toEqual(expect.arrayContaining(['priceRate.gstPct.variable', 'zoneRates.N1.N1']));
  });

  it('never mutates what you pass in', () => {
    const before = JSON.stringify(current);
    planRatesUpdate(current, [sheet({ zoneLabels: ['N1', 'W1'], zoneMatrix: [[99, 99], [99, 99]] })]);
    expect(JSON.stringify(current)).toBe(before);
  });
});

describe('a "delivery pincode + price" sheet: one price per destination zone, measured from your origin zone', () => {
  const sheetP = (over: Partial<PincodePriceSheet> = {}): PincodePriceSheet => ({
    service: [{ pincode: 110001, zone: 'N1', isOda: false }, { pincode: 400001, zone: 'W1', isOda: false }, { pincode: 560001, zone: 'S1', isOda: true }],
    destinationPrices: { N1: 7.5, W1: 11.3, S1: 13 }, zones: ['N1', 'W1', 'S1'], originGuess: 'N1', mixedZones: [], skipped: 0, ...over,
  });

  it('fills ONE row of the zone-rate table (origin -> every zone) and brings the new zones with their pincodes', () => {
    const plan = planRatesUpdate(current, [], { pincodePrices: [sheetP()] });
    expect(plan.zoneRates.N1).toEqual({ N1: 7.5, W1: 11.3, S1: 13 });
    expect(plan.zoneRates.W1).toEqual({ N1: 18, W1: 12 }); // other origins untouched
    expect(plan.diff.map((d) => [d.path, d.from, d.to])).toEqual([['zoneRates.N1.N1', 12, 7.5], ['zoneRates.N1.W1', 18, 11.3], ['zoneRates.N1.S1', 0, 13]]);
    expect(plan.diff[2].label).toBe('Rate from N1 to S1 (₹ per kg)');
    expect(plan.service).toHaveLength(3);
    expect(plan.coverage).toEqual({ pincodes: 3, zones: 3 });
    expect(plan.skipped.newZones).toEqual([]); // S1 comes with its pincodes, so it is not left out
  });

  it('uses the origin zone the user picks instead of the guess', () => {
    const plan = planRatesUpdate(current, [], { pincodePrices: [sheetP()], originZone: 'W1' });
    expect(plan.zoneRates.W1).toEqual({ N1: 7.5, W1: 11.3, S1: 13 });
    expect(plan.zoneRates.N1).toEqual({ N1: 12, W1: 18 });
  });

  it('keeps the editor limit (Rs 100 per kg) and says what was skipped', () => {
    const plan = planRatesUpdate(current, [], { pincodePrices: [sheetP({ destinationPrices: { N1: 7.5, W1: 11.3, S1: 450 } })] });
    expect(plan.zoneRates.N1.S1).toBeUndefined();
    expect(plan.skipped.overLimit).toBe(1);
  });

  it('a sheet that only repeats what you already have changes the rates not at all (coverage may still be new)', () => {
    const plan = planRatesUpdate({ priceRate: {}, zoneRates: { N1: { N1: 7.5, W1: 11.3, S1: 13 } } }, [], { pincodePrices: [sheetP()] });
    expect(plan.diff).toEqual([]);
    expect(plan.changed).toBe(true); // the service area still goes in
    expect(plan.service).toHaveLength(3);
  });

  it('works together with charges read from other sheets in the same upload', () => {
    const plan = planRatesUpdate(current, [sheet({ pricing: pricing({ docketCharges: 60 }) as never })], { pincodePrices: [sheetP()] });
    expect(plan.diff.map((d) => d.path)).toEqual(expect.arrayContaining(['priceRate.docketCharges.fixed', 'zoneRates.N1.W1']));
  });
});
