// Reads a courier's serviceability sheet (which pincodes it serves) in the browser: columns "Pincode", "Zone" and, optionally,
// "ODA" / "isOda", in any spelling or order. Never throws: a file it cannot read comes back as { error }.
import * as XLSX from 'xlsx';

export interface ServiceRow { pincode: string; zone: string; isOda: boolean }
export type ParsedService = { rows: ServiceRow[] } | { error: string };

const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z]/g, '');
const col = (header: string[], ...names: string[]) => header.findIndex((h) => names.includes(h));

export function parseServiceabilitySheet(data: ArrayBuffer): ParsedService {
  try {
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    const header = (grid[0] || []).map(norm);
    const p = col(header, 'pincode', 'pin', 'pincodes');
    const z = col(header, 'zone', 'zones');
    const o = col(header, 'oda', 'isoda');
    if (p < 0 || z < 0) return { error: 'The sheet needs a "Pincode" column and a "Zone" column.' };
    const rows: ServiceRow[] = [];
    for (const r of grid.slice(1)) {
      const pincode = String(r[p] ?? '').trim();
      const zone = String(r[z] ?? '').trim();
      if (!pincode && !zone) continue;
      rows.push({ pincode, zone, isOda: o >= 0 && /^(true|yes|y|1)$/i.test(String(r[o] ?? '').trim()) });
    }
    return rows.length ? { rows } : { error: 'No pincodes found in the sheet.' };
  } catch {
    return { error: 'We could not read that file. Upload an Excel (.xlsx) or CSV file.' };
  }
}
