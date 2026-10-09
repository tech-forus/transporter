import { describe, it, expect } from 'vitest';
import { prettyDiffPath } from './ReconfirmModal';

describe('prettyDiffPath', () => {
  it('labels business charges and zone rates', () => {
    expect(prettyDiffPath('priceRate.fuel')).toBe('Charge: fuel');
    expect(prettyDiffPath('priceRate.rovCharges.variable')).toBe('Charge: rovCharges · variable');
    expect(prettyDiffPath('zoneRates.N1.S1')).toBe('Zone rate: N1 → S1');
  });
  it('labels owner-operator lane changes with route and vehicle', () => {
    expect(prettyDiffPath('lanes.110020-400001-tata ace.price')).toBe('Lane 110020 → 400001 (tata ace): price');
    expect(prettyDiffPath('lanes.110020-400001-tata ace.maxCapacityKg')).toBe('Lane 110020 → 400001 (tata ace): capacity');
  });
  it('labels a change to a lane\'s nearby-pincode reach, per end', () => {
    expect(prettyDiffPath('lanes.110020-400001-tata ace.originReach')).toBe('Lane 110020 → 400001 (tata ace): pickup nearby pincodes');
    expect(prettyDiffPath('lanes.110020-400001-tata ace.destinationReach')).toBe('Lane 110020 → 400001 (tata ace): drop nearby pincodes');
  });
  it('falls back to the raw path', () => {
    expect(prettyDiffPath('something.else')).toBe('something.else');
  });
});
