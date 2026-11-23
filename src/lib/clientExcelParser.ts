// src/lib/clientExcelParser.ts
//
// "if the files are plain excel it doesnt need backend at all if its
// properly readable and fits in places just make the app smart enough to
// carry out excel readin, if its complex send it back [for the backend AI
// pipeline], same like pics and pdfs" — asked live 2026-09-22.
//
// Every .xlsx/.xls/.csv upload gets tried here FIRST, entirely in the
// browser (SheetJS), before ever touching the UTSF backend pipeline. This
// is deliberately NOT the shipper-side AddVendor pricingParser.ts's
// approach — that parser matches against a FIXED, global canonical zone
// taxonomy (N1-N4, S1-S4, ...) baked into a large dictionary, which doesn't
// apply here: a transporter's own zoneLabels are arbitrary strings
// discovered per-transporter (from a prior extraction or manual entry —
// "West", "N1", "Gujarat Belt", whatever their own documents called them).
// This parser matches a sheet against the labels THIS transporter already
// has, not a global dictionary.
//
// Returns null (never throws for a bad/unmatched file) when it isn't
// confident it read the file correctly — the caller sends anything this
// returns null for to the backend AI pipeline instead, same treatment as
// photos and PDFs, which never attempt a client-side parse at all.
import * as XLSX from 'xlsx';
import type { ParsedUtsfResult, ParsedPricing, ServiceEntry } from './standaloneUtsfExtraction';

const EMPTY_CHARGE = { variable: 0, fixed: 0 };
const EMPTY_PRICING = (): ParsedPricing => ({
  minWeight: 0, docketCharges: 0, fuel: 0,
  rovCharges: { ...EMPTY_CHARGE }, insuranceCharges: { ...EMPTY_CHARGE }, odaCharges: { ...EMPTY_CHARGE },
  codCharges: { ...EMPTY_CHARGE }, prepaidCharges: { ...EMPTY_CHARGE }, topayCharges: { ...EMPTY_CHARGE },
  handlingCharges: { ...EMPTY_CHARGE, thresholdWeight: 0 },
  fmCharges: { ...EMPTY_CHARGE }, appointmentCharges: { ...EMPTY_CHARGE },
  minCharges: 0, greenTax: 0, daccCharges: 0, miscellanousCharges: 0,
});

export async function readWorkbookRows(file: File): Promise<unknown[][][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames.map(name => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as unknown[][]);
}

function parseNumericCell(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[₹,%\s]/g, ''));
  return isNaN(num) ? null : num;
}

// A plain-value charge scanner — deliberately only handles the simple case
// (a label cell + an adjacent numeric cell on the same row). A real rate
// card with FLAT/%-ON-BASE dual-mode columns, merged cells, or anything
// else non-trivial doesn't confidently match here and falls through to the
// backend, which already handles that complexity.
const CHARGE_PATTERNS: Array<{ key: keyof ParsedPricing; simple: boolean; patterns: RegExp[] }> = [
  { key: 'docketCharges', simple: true, patterns: [/docket/i] },
  { key: 'fuel', simple: true, patterns: [/fuel/i] },
  { key: 'minCharges', simple: true, patterns: [/minimum\s*charge/i, /\bmin\.?\s*charge/i] },
  { key: 'greenTax', simple: true, patterns: [/green\s*tax/i, /\bngt\b/i] },
  { key: 'daccCharges', simple: true, patterns: [/\bdacc\b/i] },
  { key: 'miscellanousCharges', simple: true, patterns: [/misc/i, /\baoc\b/i] },
  { key: 'rovCharges', simple: false, patterns: [/\brov\b/i, /\bfov\b/i] },
  { key: 'odaCharges', simple: false, patterns: [/\boda\b/i] },
  { key: 'handlingCharges', simple: false, patterns: [/handling/i] },
];
// GST reads as a percentage into the {variable,fixed} shape, handled
// separately since it's stored under `.fuel`-style variable rate, not a
// plain number, in the real PriceRate — the caller's own merge step already
// expects fuel/gstPct-equivalent handling; here we just detect it as a
// simple percentage and store on rovCharges-shaped variable via the pricing
// object's own field so the existing merge code (which reads pricing.fuel/
// pricing.docketCharges/etc, not a raw gstPct) picks it up the same way.

function tryParseChargesFromSheet(rows: unknown[][]): { pricing: ParsedPricing; sourcedFields: string[] } | null {
  const pricing = EMPTY_PRICING();
  const sourcedFields: string[] = [];
  let gstPct: number | null = null;

  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const label = String(row[0] ?? '');
    if (!label.trim()) continue;

    if (/\bgst\b/i.test(label) && gstPct == null) {
      for (let ci = 1; ci < row.length; ci++) {
        const n = parseNumericCell(row[ci]);
        if (n != null) { gstPct = n; break; }
      }
      continue;
    }

    for (const { key, simple, patterns } of CHARGE_PATTERNS) {
      if (sourcedFields.includes(key)) continue;
      if (!patterns.some(p => p.test(label))) continue;
      let value: number | null = null;
      for (let ci = 1; ci < row.length; ci++) {
        const n = parseNumericCell(row[ci]);
        if (n != null) { value = n; break; }
      }
      if (value == null) continue;
      if (simple) {
        (pricing as any)[key] = value;
      } else {
        (pricing as any)[key] = { variable: 0, fixed: value };
      }
      sourcedFields.push(key);
    }
  }

  // gstPct doesn't have its own ParsedPricing field (the real PriceRate
  // stores it as {variable,fixed} under a key the caller's merge code reads
  // directly from AddPrice's own priceRate.gstPct, not from ParsedPricing at
  // all — ParsedPricing has no gstPct field). Surface it via a synthetic
  // sourced-field name the caller checks for separately.
  if (gstPct != null) sourcedFields.push('gstPct');

  if (sourcedFields.length === 0) return null;
  return { pricing, sourcedFields, ...(gstPct != null ? { gstPct } : {}) } as any;
}

// Matches a sheet against zoneLabels THIS transporter already has (not a
// fixed dictionary). Requires an unambiguous header row (at least half the
// known zones present as column headers) and at least one origin row whose
// first cell is also a known zone label — a file that doesn't cleanly fit
// that shape (merged cells, multi-row headers, unfamiliar zone names, a
// completely different layout) returns null rather than guessing.
function tryParseZoneMatrixFromSheet(rows: unknown[][], zoneLabels: string[]): { zoneLabels: string[]; zoneMatrix: number[][] } | null {
  if (zoneLabels.length < 2) return null;
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const labelByNorm = new Map(zoneLabels.map(z => [norm(z), z]));

  let headerRowIdx = -1;
  let headerColLabel: (string | null)[] = [];
  const minHits = Math.max(2, Math.ceil(zoneLabels.length / 2));
  for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
    const row = rows[ri] || [];
    const matches = row.map(c => labelByNorm.get(norm(c)) ?? null);
    const hitCount = matches.filter(Boolean).length;
    if (hitCount >= minHits) {
      headerRowIdx = ri;
      headerColLabel = matches;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  const matrix: number[][] = zoneLabels.map(() => zoneLabels.map(() => 0));
  let filledCount = 0;
  let originRowsFound = 0;

  for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
    const originLabel = labelByNorm.get(norm(row[0]));
    if (!originLabel) continue;
    originRowsFound++;
    const originIdx = zoneLabels.indexOf(originLabel);
    for (let ci = 0; ci < row.length; ci++) {
      const destLabel = headerColLabel[ci];
      if (!destLabel) continue;
      const destIdx = zoneLabels.indexOf(destLabel);
      const val = parseNumericCell(row[ci]);
      if (val != null && val > 0) {
        matrix[originIdx][destIdx] = val;
        filledCount++;
      }
    }
  }

  // Confident only if we found real origin rows AND real rate cells — a
  // header-only match with nothing underneath it isn't a matrix we read
  // correctly, it's a coincidence.
  if (originRowsFound === 0 || filledCount === 0) return null;
  return { zoneLabels, zoneMatrix: matrix };
}

// A single-origin rate list: one row per pincode with a "Zone" column and a
// "Unit Price"/"Rate" column (e.g. PINCODE | City | State | Zone | ODA | Unit
// Price). It lists prices from ONE origin (the transporter's own office) to each
// destination zone, so only the ORIGIN row of the matrix is filled — the
// origin is the zone the office pincode sits in, looked up in the sheet's own
// PINCODE column. Other origin rows stay empty (the file doesn't price them).
// Deliberately strict: needs the office pincode, a Zone, a PINCODE and a price
// header, no origin/from/pickup column (that's a multi-origin list — left to
// the backend), at least half of the transporter's known zones present, and
// exactly ONE distinct price per zone. Anything else returns null and the file
// goes to the backend pipeline exactly as before.
export function tryParsePerZonePriceList(rows: unknown[][], zoneLabels: string[], originPincode?: string | null): { zoneLabels: string[]; zoneMatrix: number[][] } | null {
  if (zoneLabels.length < 2 || !originPincode) return null;
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const head = (v: unknown) => norm(v).replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
  const labelByNorm = new Map(zoneLabels.map(z => [norm(z), z]));

  let headerRowIdx = -1;
  let zoneCol = -1;
  let priceCol = -1;
  let pinCol = -1;
  for (let ri = 0; ri < Math.min(rows.length, 15); ri++) {
    const heads = (rows[ri] || []).map(head);
    if (heads.some(h => /^(from|origin|source|pick ?up)\b/.test(h) || /\b(from|origin|pick ?up)\s+(zone|pin ?code|pin)\b/.test(h))) continue;
    const z = heads.findIndex(h => /^((dest|destination|to|delivery)\s+)?zone$/.test(h));
    const p = heads.findIndex(h => /\b(price|rate)s?\b/.test(h));
    const pc = heads.findIndex(h => /^((dest|destination|to|delivery)\s+)?pin ?(code)?$/.test(h));
    if (z !== -1 && p !== -1 && pc !== -1) { headerRowIdx = ri; zoneCol = z; priceCol = p; pinCol = pc; break; }
  }
  if (headerRowIdx === -1) return null;

  const priceByZone = new Map<string, number>();
  let originLabel: string | null = null;
  for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row) continue;
    const label = labelByNorm.get(norm(row[zoneCol]));
    if (!label) continue;
    if (originLabel == null && String(row[pinCol] ?? '').replace(/\D/g, '') === originPincode) originLabel = label;
    const price = parseNumericCell(row[priceCol]);
    if (price == null || price <= 0) continue;
    const prev = priceByZone.get(label);
    if (prev == null) priceByZone.set(label, price);
    else if (Math.abs(prev - price) > 1e-9) return null; // two prices in one zone — not a flat zone list
  }

  if (priceByZone.size < Math.max(2, Math.ceil(zoneLabels.length / 2))) return null;
  if (originLabel == null) return null; // office pincode isn't in the sheet — never guess the origin

  const zoneMatrix = zoneLabels.map(from => zoneLabels.map(to => (from === originLabel ? priceByZone.get(to) ?? 0 : 0)));
  return { zoneLabels, zoneMatrix };
}

// Same rule the backend's addPrice uses to pick the dispatch pincode: the
// employee office address's pincode wins when it differs from the company
// pincode, else the company pincode.
export function resolveOriginPincode(companyPincode?: string | number | null, employeeAddress?: string | null): string | null {
  const company = companyPincode ? String(companyPincode).replace(/\D/g, '') : null;
  const employee = String(employeeAddress || '').match(/\b\d{6}\b/)?.[0] ?? null;
  const pick = employee && employee !== company ? employee : (company || employee);
  return pick && /^\d{6}$/.test(pick) ? pick : null;
}

export interface ClientParseOutcome {
  handled: boolean;
  result?: ParsedUtsfResult;
}

// Tries every sheet in the workbook for BOTH a charges match and a zone-
// matrix match (a real rate-card workbook often has one sheet of each, or
// both on one sheet) and combines whatever it confidently found. Returns
// handled:false (never throws) when nothing in the file confidently
// matched — the caller sends the raw file to the backend pipeline instead.
export async function tryParseExcelClientSide(
  file: File,
  zoneLabels: string[],
  originPincode?: string | null,
): Promise<ClientParseOutcome> {
  let sheets: unknown[][][];
  try {
    sheets = await readWorkbookRows(file);
  } catch {
    return { handled: false };
  }

  let pricing = EMPTY_PRICING();
  const sourcedFields: string[] = [];
  let gstPct: number | null = null;
  let matchedZoneMatrix: number[][] | null = null;
  let perZoneList = false;

  for (const rows of sheets) {
    const chargeResult = tryParseChargesFromSheet(rows);
    if (chargeResult) {
      for (const f of chargeResult.sourcedFields) {
        if (f === 'gstPct') { gstPct = (chargeResult as any).gstPct; continue; }
        if (!sourcedFields.includes(f)) {
          sourcedFields.push(f);
          (pricing as any)[f] = (chargeResult.pricing as any)[f];
        }
      }
    }
    if (!matchedZoneMatrix && zoneLabels.length >= 2) {
      const zm = tryParseZoneMatrixFromSheet(rows, zoneLabels);
      if (zm) matchedZoneMatrix = zm.zoneMatrix;
      else {
        const pl = tryParsePerZonePriceList(rows, zoneLabels, originPincode);
        if (pl) { matchedZoneMatrix = pl.zoneMatrix; perZoneList = true; }
      }
    }
  }

  if (sourcedFields.length === 0 && !matchedZoneMatrix) {
    return { handled: false };
  }

  const service: ServiceEntry[] = [];
  const zoneCount = matchedZoneMatrix ? zoneLabels.length : 0;

  const result: ParsedUtsfResult & { _gstPct?: number; _perZoneList?: boolean } = {
    pricing,
    sourcedFields,
    hasPricingData: sourcedFields.length > 0,
    zoneLabels: matchedZoneMatrix ? zoneLabels : [],
    zoneMatrix: matchedZoneMatrix ?? [],
    service,
    zoneCount,
    totalPincodes: 0,
    companyName: '',
    ...(gstPct != null ? { _gstPct: gstPct } : {}),
    ...(perZoneList ? { _perZoneList: true } : {}),
  };

  return { handled: true, result };
}

// Sign-up path: the UTSF backend returned zones but no zone rates. Try the
// uploaded Excel/CSV itself against the zone labels the backend just found.
// Returns the matrix, or null when the file isn't a readable grid / per-zone
// price list (never throws).
export async function tryReadZoneMatrixFromFile(file: File, zoneLabels: string[], originPincode?: string | null): Promise<number[][] | null> {
  try {
    const sheets = await readWorkbookRows(file);
    for (const rows of sheets) {
      const hit = tryParseZoneMatrixFromSheet(rows, zoneLabels) ?? tryParsePerZonePriceList(rows, zoneLabels, originPincode);
      if (hit) return hit.zoneMatrix;
    }
  } catch { /* unreadable file — caller keeps the backend result */ }
  return null;
}
