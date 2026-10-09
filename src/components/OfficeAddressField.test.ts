import { describe, it, expect } from 'vitest';
import { isLocationConfirmed } from './OfficeAddressField';
import type { AddressLocationValue } from './AddressLocationPicker';

const base: AddressLocationValue = {
  flatNumber: '12', buildingName: '', area: '', landmark: '', city: '',
  lat: 28.5, lng: 77.2, placeId: null, formattedAddress: '',
};

// Must match SignUpPage's requireAddressThenSubmit, which skips the final gate on exactly this bar.
describe('isLocationConfirmed', () => {
  it('needs a pin and a flat/unit number', () => {
    expect(isLocationConfirmed(base)).toBe(true);
    expect(isLocationConfirmed({ ...base, lat: null })).toBe(false);
    expect(isLocationConfirmed({ ...base, lng: null })).toBe(false);
    expect(isLocationConfirmed({ ...base, flatNumber: '   ' })).toBe(false);
  });
  it('accepts a pin at 0 as a real coordinate (not falsy-checked)', () => {
    expect(isLocationConfirmed({ ...base, lat: 0, lng: 0 })).toBe(true);
  });
});
