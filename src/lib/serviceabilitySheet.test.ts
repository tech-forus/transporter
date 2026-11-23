import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseServiceabilitySheet } from './serviceabilitySheet';

const book = (aoa: unknown[][]) => XLSX.write(XLSX.utils.book_append_sheet(XLSX.utils.book_new(), XLSX.utils.aoa_to_sheet(aoa), 'S') as never, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
const make = (aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
};

describe('parseServiceabilitySheet', () => {
  it('reads pincode, zone and ODA whatever the header spelling', () => {
    const r = parseServiceabilitySheet(make([['Pincode', 'ZONE', 'ODA'], [110020, 'N1', 'No'], ['201301', 'N1', 'Yes'], [411001, 'W1', '']]));
    expect(r).toEqual({ rows: [{ pincode: '110020', zone: 'N1', isOda: false }, { pincode: '201301', zone: 'N1', isOda: true }, { pincode: '411001', zone: 'W1', isOda: false }] });
  });
  it('accepts "Pin Code" / "isOda" headers and skips blank rows', () => {
    const r = parseServiceabilitySheet(make([['Pin Code', 'Zone', 'isOda'], [560001, 'S1', true], [], [null, null, null]]));
    expect(r).toEqual({ rows: [{ pincode: '560001', zone: 'S1', isOda: true }] });
  });
  it('says what is missing instead of guessing', () => {
    expect(parseServiceabilitySheet(make([['Name', 'City'], ['a', 'b']]))).toEqual({ error: 'The sheet needs a "Pincode" column and a "Zone" column.' });
    expect(parseServiceabilitySheet(make([['Pincode', 'Zone']]))).toEqual({ error: 'No pincodes found in the sheet.' });
  });
  it('does not throw on a file that is not a spreadsheet', () => {
    expect(parseServiceabilitySheet(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toHaveProperty('error');
  });
});
void book;
