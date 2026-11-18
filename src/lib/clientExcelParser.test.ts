import { describe, it, expect } from 'vitest';
import { tryParsePerZonePriceList } from './clientExcelParser';

const labels = ['N1', 'N2', 'S1'];
const head = ['PINCODE', 'Facility City', 'Facility State', 'Zone', 'ODA', 'Unit Price_Shipshopsy'];

describe('tryParsePerZonePriceList', () => {
  it('fills every origin row with the per-destination-zone price', () => {
    const rows = [head, [110001, 'Delhi', 'Delhi', 'N1', 'No', 7.5], [110002, 'Delhi', 'Delhi', 'N1', 'Yes', 7.5],
      [201001, 'X', 'UP', 'N2', 'No', 8.6], [600001, 'Chennai', 'TN', 'S1', 'No', 13]];
    const r = tryParsePerZonePriceList(rows, labels)!;
    expect(r.zoneMatrix).toEqual([[7.5, 8.6, 13], [7.5, 8.6, 13], [7.5, 8.6, 13]]);
  });
  it('returns null when a zone has two different prices', () => {
    const rows = [head, [1, 'a', 'b', 'N1', 'No', 7.5], [2, 'a', 'b', 'N1', 'No', 9], [3, 'a', 'b', 'N2', 'No', 8], [4, 'a', 'b', 'S1', 'No', 9]];
    expect(tryParsePerZonePriceList(rows, labels)).toBeNull();
  });
  it('returns null when there is an origin/from column', () => {
    const rows = [['From Zone', 'Zone', 'Rate'], ['N1', 'N2', 8], ['N1', 'S1', 9]];
    expect(tryParsePerZonePriceList(rows, labels)).toBeNull();
  });
  it('returns null with no price column, too few known zones, or <2 labels', () => {
    expect(tryParsePerZonePriceList([['PINCODE', 'Zone'], [1, 'N1']], labels)).toBeNull();
    expect(tryParsePerZonePriceList([head, [1, 'a', 'b', 'N1', 'No', 7.5]], labels)).toBeNull();
    expect(tryParsePerZonePriceList([head, [1, 'a', 'b', 'N1', 'No', 7.5]], ['N1'])).toBeNull();
  });
});
