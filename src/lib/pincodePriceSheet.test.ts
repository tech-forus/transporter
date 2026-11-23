import { describe, it, expect } from 'vitest';
import { parsePincodePriceRows } from './pincodePriceSheet';

const head = ['PINCODE', 'Facility City', 'Facility State', 'Zone', 'ODA', 'Unit Price_Shipshopsy'];
const grid = [
  head,
  [110001, 'Delhi', 'Delhi', 'N1', 'No', 7.5],
  [110002, 'Delhi', 'Delhi', 'N1', 'No', 7.5],
  [201301, 'Noida', 'Uttar Pradesh', 'N1', 'Yes', 7.5],
  [400001, 'Mumbai', 'Maharashtra', 'W1', 'No', 11.3],
  [411001, 'Pune', 'Maharashtra', 'W1', 'Yes', 11.3],
  [560001, 'Bengaluru', 'Karnataka', 'S1', 'No', 13],
];

describe('parsePincodePriceRows: a "delivery pincode + price" list (one price per destination zone)', () => {
  it('reads the pincodes with their zone and ODA, and one price per zone', () => {
    const r = parsePincodePriceRows(grid)!;
    expect(r.service).toEqual([
      { pincode: 110001, zone: 'N1', isOda: false }, { pincode: 110002, zone: 'N1', isOda: false }, { pincode: 201301, zone: 'N1', isOda: true },
      { pincode: 400001, zone: 'W1', isOda: false }, { pincode: 411001, zone: 'W1', isOda: true }, { pincode: 560001, zone: 'S1', isOda: false },
    ]);
    expect(r.destinationPrices).toEqual({ N1: 7.5, W1: 11.3, S1: 13 });
  });

  it('guesses the zone you ship from as the cheapest one (the local zone), and lists all zones to choose from', () => {
    const r = parsePincodePriceRows(grid)!;
    expect(r.originGuess).toBe('N1');
    expect(r.zones).toEqual(['N1', 'W1', 'S1']);
  });

  it('finds the header even with other columns, other spellings and a title row above it', () => {
    const r = parsePincodePriceRows([['Rate card 2026'], [], ['Pin Code', 'ZONE', 'Is ODA', 'Rate per kg'], [110001, 'N1', 'no', 8], [400001, 'W1', 'yes', 12]])!;
    expect(r.service.map((e) => [e.pincode, e.zone, e.isOda])).toEqual([[110001, 'N1', false], [400001, 'W1', true]]);
    expect(r.destinationPrices).toEqual({ N1: 8, W1: 12 });
  });

  it('works without an ODA column, and skips rows with a bad pincode, a missing zone or no price (and counts them)', () => {
    const r = parsePincodePriceRows([['pincode', 'zone', 'price'], [110001, 'N1', 8], [12345, 'N1', 8], [400001, '', 12], [560001, 'S1', ''], ['abc', 'S1', 5]])!;
    expect(r.service).toEqual([{ pincode: 110001, zone: 'N1', isOda: false }]);
    expect(r.skipped).toBe(4);
  });

  it('when a zone has different prices, uses the most common one and says which zone', () => {
    const r = parsePincodePriceRows([['pincode', 'zone', 'price'], [110001, 'N1', 8], [110002, 'N1', 8], [110003, 'N1', 9]])!;
    expect(r.destinationPrices.N1).toBe(8);
    expect(r.mixedZones).toEqual(['N1']);
  });

  it('is not fooled by other kinds of sheets: no pincode / zone / price column means "not mine"', () => {
    expect(parsePincodePriceRows([['Zone', 'N1', 'N2'], ['N1', 5, 6]])).toBeNull();
    expect(parsePincodePriceRows([['Charge', 'Value'], ['Docket', 50]])).toBeNull();
    expect(parsePincodePriceRows([['pincode', 'zone'], [110001, 'N1']])).toBeNull();
    expect(parsePincodePriceRows([])).toBeNull();
  });
});
