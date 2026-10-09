import { describe, it, expect } from 'vitest';
import {
  readEnd, patchPincodeTyped, patchPlaceResolved, patchRadius, patchCoverage, patchRemoveChip, needsPreview,
} from './laneEnd';

const lane = {
  originPincode: '110020', destinationPincode: '400001', price: 15000, vehicleType: 'Tata Ace',
  originAddress: 'Okhla Phase 2, New Delhi', originLat: 28.53, originLng: 77.27, originRadiusKm: 3,
  originCoverage: ['110020', '110017', '110044'],
};

describe('readEnd', () => {
  it('reads one end of a lane, with safe defaults for a lane that has no address or radius', () => {
    expect(readEnd(lane, 'origin')).toEqual({
      pincode: '110020', address: 'Okhla Phase 2, New Delhi', lat: 28.53, lng: 77.27, radiusKm: 3,
      coverage: ['110020', '110017', '110044'],
    });
    expect(readEnd(lane, 'destination')).toEqual({ pincode: '400001', address: '', lat: null, lng: null, radiusKm: 0, coverage: [] });
  });
});

describe('patchPincodeTyped', () => {
  it('keeps only digits (max 6) and drops the picked point, address and coverage', () => {
    const p = patchPincodeTyped('origin', '11-00a44 99');
    expect(p).toMatchObject({ originPincode: '110044', originAddress: '', originCoverage: [] });
    expect(p.originLat).toBeUndefined();
    expect(p.originLng).toBeUndefined();
  });
  it('leaves the radius alone, so the tick stays on and the list can be refreshed', () => {
    expect('originRadiusKm' in patchPincodeTyped('origin', '110044')).toBe(false);
  });
});

describe('patchPlaceResolved', () => {
  const place = { formattedAddress: 'Saket, New Delhi 110017', lat: 28.52, lng: 77.21, pincode: '110017', placeId: 'x', area: '', city: '', state: '', flatNumber: '', buildingName: '' };
  it('fills the address, point and pincode, and clears stale coverage', () => {
    expect(patchPlaceResolved('destination', place)).toEqual({
      destinationAddress: 'Saket, New Delhi 110017', destinationLat: 28.52, destinationLng: 77.21,
      destinationPincode: '110017', destinationCoverage: [],
    });
  });
  it('returns null when Google gave no usable pincode, so the caller can ask the user to type it', () => {
    expect(patchPlaceResolved('origin', { ...place, pincode: '' })).toBeNull();
    expect(patchPlaceResolved('origin', { ...place, pincode: '1100' })).toBeNull();
  });
});

describe('patchRadius / patchCoverage / patchRemoveChip', () => {
  it('setting a radius clears the old list (it belongs to the old radius)', () => {
    expect(patchRadius('origin', 1)).toEqual({ originRadiusKm: 1, originCoverage: [] });
    expect(patchRadius('origin', 0)).toEqual({ originRadiusKm: 0, originCoverage: [] });
  });
  it('puts the own pincode first and removes duplicates', () => {
    expect(patchCoverage('origin', ['110017', '110020', '110017', '110044'], '110020')).toEqual({
      originCoverage: ['110020', '110017', '110044'],
    });
  });
  it('removes a chip but never the lane\'s own pincode', () => {
    expect(patchRemoveChip(lane, 'origin', '110017')).toEqual({ originCoverage: ['110020', '110044'] });
    expect(patchRemoveChip(lane, 'origin', '110020')).toEqual({ originCoverage: ['110020', '110017', '110044'] });
  });
});

describe('needsPreview', () => {
  it('is true when a radius is on, the pincode is complete, and there is no list yet', () => {
    expect(needsPreview({ pincode: '110020', address: '', lat: null, lng: null, radiusKm: 3, coverage: [] })).toBe(true);
  });
  it('is false with no radius, an incomplete pincode, or a list already loaded', () => {
    expect(needsPreview({ pincode: '110020', address: '', lat: null, lng: null, radiusKm: 0, coverage: [] })).toBe(false);
    expect(needsPreview({ pincode: '1100', address: '', lat: null, lng: null, radiusKm: 3, coverage: [] })).toBe(false);
    expect(needsPreview({ pincode: '110020', address: '', lat: null, lng: null, radiusKm: 3, coverage: ['110020'] })).toBe(false);
  });
});
