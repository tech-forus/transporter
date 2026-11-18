import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { tryParsePerZonePriceList, tryReadZoneMatrixFromFile, resolveOriginPincode } from './clientExcelParser';

const labels = ['N1', 'N2', 'S1'];
const head = ['PINCODE', 'Facility City', 'Facility State', 'Zone', 'ODA', 'Unit Price_Shipshopsy'];
const list = [head, [122017, 'Gurgaon', 'Haryana', 'N1', 'No', 7.5], [110002, 'Delhi', 'Delhi', 'N1', 'Yes', 7.5],
  [201001, 'X', 'UP', 'N2', 'No', 8.6], [600001, 'Chennai', 'TN', 'S1', 'No', 13]];

describe('tryParsePerZonePriceList (single-origin list)', () => {
  it('fills ONLY the origin row (zone of the office pincode)', () => {
    expect(tryParsePerZonePriceList(list, labels, '122017')!.zoneMatrix).toEqual([[7.5, 8.6, 13], [0, 0, 0], [0, 0, 0]]);
  });
  it('uses the zone the office pincode sits in, not the first zone', () => {
    expect(tryParsePerZonePriceList(list, labels, '600001')!.zoneMatrix).toEqual([[0, 0, 0], [0, 0, 0], [7.5, 8.6, 13]]);
  });
  it('returns null (never guesses) when the origin pincode is missing or not in the sheet', () => {
    expect(tryParsePerZonePriceList(list, labels)).toBeNull();
    expect(tryParsePerZonePriceList(list, labels, '999999')).toBeNull();
  });
  it('returns null when a zone has two different prices', () => {
    const rows = [head, [1, 'a', 'b', 'N1', 'No', 7.5], [2, 'a', 'b', 'N1', 'No', 9], [3, 'a', 'b', 'N2', 'No', 8], [4, 'a', 'b', 'S1', 'No', 9]];
    expect(tryParsePerZonePriceList(rows, labels, '1')).toBeNull();
  });
  it('leaves multi-origin lists alone (from / origin / pickup columns)', () => {
    for (const h of ['From Zone', 'Origin Zone', 'Pickup Pincode', 'Origin Pincode', 'Pick up Zone']) {
      const rows = [['PINCODE', h, 'Zone', 'Rate'], [122017, 'N1', 'N1', 7], [201001, 'N1', 'N2', 8], [600001, 'N1', 'S1', 9]];
      expect(tryParsePerZonePriceList(rows, labels, '122017')).toBeNull();
    }
  });
  it('returns null with no price/pincode column, too few known zones, or <2 labels', () => {
    expect(tryParsePerZonePriceList([['PINCODE', 'Zone'], [1, 'N1']], labels, '1')).toBeNull();
    expect(tryParsePerZonePriceList([['Zone', 'Rate'], ['N1', 7], ['N2', 8]], labels, '1')).toBeNull();
    expect(tryParsePerZonePriceList([head, [122017, 'a', 'b', 'N1', 'No', 7.5]], labels, '122017')).toBeNull();
    expect(tryParsePerZonePriceList(list, ['N1'], '122017')).toBeNull();
  });
});

describe('resolveOriginPincode', () => {
  it('uses the company pincode, or the employee address pincode when it differs', () => {
    expect(resolveOriginPincode('122017', null)).toBe('122017');
    expect(resolveOriginPincode(122017, 'Plot 4, Sector 114, Gurugram 122017')).toBe('122017');
    expect(resolveOriginPincode('122017', 'Warehouse, Mumbai 400001')).toBe('400001');
    expect(resolveOriginPincode(null, 'Mumbai 400001')).toBe('400001');
    expect(resolveOriginPincode('', '')).toBeNull();
  });
});

describe('tryReadZoneMatrixFromFile', () => {
  const mk = (aoa: unknown[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    return new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'rates.xlsx');
  };
  it('reads a single-origin list from a real xlsx into the origin row only', async () => {
    expect(await tryReadZoneMatrixFromFile(mk(list), labels, '122017')).toEqual([[7.5, 8.6, 13], [0, 0, 0], [0, 0, 0]]);
  });
  it('still reads a real from x to grid (multi-origin) unchanged', async () => {
    const grid = [['From\\To', 'N1', 'N2', 'S1'], ['N1', 1, 2, 3], ['N2', 4, 5, 6], ['S1', 7, 8, 9]];
    expect(await tryReadZoneMatrixFromFile(mk(grid), labels, '122017')).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  });
  it('returns null for an unrelated sheet', async () => {
    expect(await tryReadZoneMatrixFromFile(mk([['a', 'b'], [1, 2]]), labels, '122017')).toBeNull();
  });
});
