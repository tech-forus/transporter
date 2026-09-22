// src/lib/standaloneUtsfExtraction.ts
//
// A returning, already-signed-up transporter opening "Add your routes &
// rates" from the Dashboard had no document-upload option at all — straight
// into a large manual charges table. SignUpPage.tsx already has this exact
// AI-extraction pipeline (startAiExtraction, ~line 1026) for the live signup
// session, but it's woven tightly into that page's own signup-draft state
// (formData, aiFiles, pending-account-creation flags) and is NOT reused here
// verbatim — that function is 470 lines of hand-tuned, live production code
// and copying its call sites in is safer than refactoring it. This module is
// the same pipeline (same endpoints, same UTSF parsing rules) built as a
// standalone, authenticated-session version for AddPrice.tsx's own use.
//
// Asked for live 2026-09-22: "give them option to upload files docs... and
// if data insufficient ask them to enter whatever is missing or upload more
// docs... tell them which space they lack in."
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';

export const ACCEPTED_EXTENSIONS = new Set([
  '.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg',
  '.docx', '.doc', '.pptx', '.ppt', '.json', '.tiff', '.bmp', '.webp',
]);
export const MAX_UPLOAD_FILES = 5;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export type DocCategory = 'company_details' | 'charges' | 'zone_data';

export function guessCategory(filename: string): DocCategory {
  const n = filename.toLowerCase().replace(/[_\-. ]/g, ' ');
  const companyKw = ['company', 'vendor', 'transporter', 'profile', 'info', 'details', 'contact', 'gst', 'pan', 'kyc', 'overview', 'about'];
  const chargeKw = ['rate', 'rates', 'charge', 'charges', 'price', 'pricing', 'tariff', 'fuel', 'docket', 'oda', 'rov', 'insurance', 'surcharge', 'fee', 'cost', 'billing'];
  const zoneKw = ['zone', 'zones', 'pincode', 'pincodes', 'serviceability', 'service', 'coverage', 'matrix', 'area', 'delivery', 'served', 'network'];
  const score = (kws: string[]) => kws.filter(k => n.includes(k)).length;
  const s = { company_details: score(companyKw), charges: score(chargeKw), zone_data: score(zoneKw) };
  const best = (Object.keys(s) as DocCategory[]).sort((a, b) => s[b] - s[a]);
  return s[best[0]] > 0 ? best[0] : 'charges';
}

export interface UploadItem {
  file: File;
  id: string;
  category: DocCategory;
}

// Runs the workspace-create -> upload -> SSE-stream -> fetch-output sequence
// against the same /api/utsf-generator endpoints SignUpPage.tsx uses, using
// withCredentials instead of a Bearer header — this only ever runs for an
// already-logged-in transporter (see AddPrice.tsx's isReturningTransporter
// gate), whose session lives in the httpOnly transporterAuthToken cookie,
// not a readable js-cookie value.
export async function runUtsfExtraction(
  files: UploadItem[],
  workspaceNameHint: string,
  onLog: (line: string) => void,
): Promise<any> {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const suffix = id.replace(/-/g, '');
  const baseName = (workspaceNameHint || 'transporter').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32) || 'transporter';
  const safeName = `${baseName}_${suffix}`;

  onLog('[INFO] Setting up processing workspace...');
  const createRes = await axios.post(`${API_BASE_URL}/api/utsf-generator/transporter`, { name: safeName }, { withCredentials: true });
  if (!createRes.data?.success) throw new Error('Could not allocate a processing workspace.');
  onLog('[OK] Workspace ready.');

  onLog(`[INFO] Uploading ${files.length} document${files.length === 1 ? '' : 's'}...`);
  for (const item of files) {
    const fd = new FormData();
    fd.append('files', item.file);
    fd.append('subfolder', item.category);
    await axios.post(`${API_BASE_URL}/api/utsf-generator/transporter/${safeName}/upload`, fd, { withCredentials: true });
    onLog(`[OK] Uploaded "${item.file.name}" as [${item.category.replace('_', ' ')}]`);
  }
  onLog('[AI] Reading your documents...');

  const streamRes = await fetch(`${API_BASE_URL}/api/utsf-generator/transporter/${safeName}/stream`, { credentials: 'include' });
  if (!streamRes.ok || !streamRes.body) throw new Error('Could not connect to the document processor.');

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let downloadToken: string | null = null;

  const TIMEOUT_MS = 8 * 60 * 1000;
  let timedOut = false;
  const timeoutId = setTimeout(() => { timedOut = true; reader.cancel(); }, TIMEOUT_MS);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (typeof data === 'string') {
            onLog(`> ${data}`);
          } else if (data.__done__) {
            if (data.exitCode === 0) {
              downloadToken = data.downloadToken || null;
              onLog('[DONE] Processing complete.');
            } else {
              throw new Error('The document processor hit an internal error.');
            }
          }
        } catch (e: any) {
          if (!(e instanceof SyntaxError)) throw e;
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (timedOut) throw new Error('This is taking too long (over 8 minutes) — try again with fewer/smaller files.');
  if (!downloadToken) throw new Error('Could not retrieve the extracted data.');

  onLog('[INFO] Fetching extracted details...');
  const outputRes = await axios.get(`${API_BASE_URL}/api/utsf-generator/output/file/${downloadToken}`, { withCredentials: true });
  onLog('[OK] Done.');
  return outputRes.data;
}

export interface ParsedCharge { variable: number; fixed: number; }

export interface ParsedPricing {
  minWeight: number;
  docketCharges: number;
  fuel: number;
  rovCharges: ParsedCharge;
  insuranceCharges: ParsedCharge;
  odaCharges: ParsedCharge;
  codCharges: ParsedCharge;
  prepaidCharges: ParsedCharge;
  topayCharges: ParsedCharge;
  handlingCharges: ParsedCharge & { thresholdWeight: number };
  fmCharges: ParsedCharge;
  appointmentCharges: ParsedCharge;
  minCharges: number;
  greenTax: number;
  daccCharges: number;
  miscellanousCharges: number;
}

export interface ServiceEntry { pincode: number; isOda: boolean; zone: string; }

export interface ParsedUtsfResult {
  pricing: ParsedPricing;
  sourcedFields: string[];
  hasPricingData: boolean;
  zoneLabels: string[];
  zoneMatrix: number[][];
  service: ServiceEntry[];
  zoneCount: number;
  totalPincodes: number;
  companyName: string;
}

// Same parsing rules as SignUpPage.tsx's startAiExtraction (UTSF v2.1 shape,
// _chargeFieldsFromSource gating, servedRanges/odaRanges/crossZoneRanges
// expansion) — kept in sync by hand, not shared, per the file-header note.
export function parseUtsfOutput(utsf: any): ParsedUtsfResult {
  const meta = utsf.meta || {};
  const basics = utsf.basics || {};
  const companyName = String(meta.companyName || utsf.companyName || basics.companyName || '');

  const rawPR = utsf.pricing?.priceRate || utsf.prices?.priceRate || utsf.priceRate || {};
  const cv = (c: any, k: 'v' | 'variable') => Number(c?.[k] ?? c?.[k === 'v' ? 'variable' : 'v'] ?? 0);
  const cf = (c: any, k: 'f' | 'fixed') => Number(c?.[k] ?? c?.[k === 'f' ? 'fixed' : 'f'] ?? 0);
  const sourcedFields: string[] = Array.isArray(utsf._chargeFieldsFromSource) ? utsf._chargeFieldsFromSource : [];
  const fromSource = (key: string) => sourcedFields.includes(key);

  const pricing: ParsedPricing = {
    minWeight: fromSource('minWeight') ? Number(rawPR.minWeight || rawPR.minChargableWeight || 0) : 0,
    docketCharges: fromSource('docketCharges') ? Number(rawPR.docketCharges || 0) : 0,
    fuel: fromSource('fuel') ? Number(rawPR.fuel || rawPR.fuelSurcharge || rawPR.fuelCharge || 0) : 0,
    rovCharges: fromSource('rovCharges') ? { variable: cv(rawPR.rovCharges, 'v'), fixed: cf(rawPR.rovCharges, 'f') } : { variable: 0, fixed: 0 },
    insuranceCharges: fromSource('insuranceCharges') ? { variable: cv(rawPR.insuranceCharges, 'v'), fixed: cf(rawPR.insuranceCharges, 'f') } : { variable: 0, fixed: 0 },
    odaCharges: fromSource('odaCharges') ? { variable: cv(rawPR.odaCharges, 'v'), fixed: cf(rawPR.odaCharges, 'f') } : { variable: 0, fixed: 0 },
    codCharges: fromSource('codCharges') ? { variable: cv(rawPR.codCharges, 'v'), fixed: cf(rawPR.codCharges, 'f') } : { variable: 0, fixed: 0 },
    prepaidCharges: fromSource('prepaidCharges') ? { variable: cv(rawPR.prepaidCharges, 'v'), fixed: cf(rawPR.prepaidCharges, 'f') } : { variable: 0, fixed: 0 },
    topayCharges: fromSource('topayCharges') ? { variable: cv(rawPR.topayCharges, 'v'), fixed: cf(rawPR.topayCharges, 'f') } : { variable: 0, fixed: 0 },
    handlingCharges: fromSource('handlingCharges')
      ? { variable: cv(rawPR.handlingCharges, 'v'), fixed: cf(rawPR.handlingCharges, 'f'), thresholdWeight: Number(rawPR.handlingCharges?.thresholdWeight || 0) }
      : { variable: 0, fixed: 0, thresholdWeight: 0 },
    fmCharges: fromSource('fmCharges') ? { variable: cv(rawPR.fmCharges, 'v'), fixed: cf(rawPR.fmCharges, 'f') } : { variable: 0, fixed: 0 },
    appointmentCharges: fromSource('appointmentCharges') ? { variable: cv(rawPR.appointmentCharges, 'v'), fixed: cf(rawPR.appointmentCharges, 'f') } : { variable: 0, fixed: 0 },
    minCharges: fromSource('minCharges') ? Number(rawPR.minCharges || 0) : 0,
    greenTax: fromSource('greenTax') ? Number(rawPR.greenTax || 0) : 0,
    daccCharges: fromSource('daccCharges') ? Number(rawPR.daccCharges || 0) : 0,
    miscellanousCharges: fromSource('miscCharges') ? Number(rawPR.miscellanousCharges || rawPR.miscCharges || 0) : 0,
  };

  const PRICING_RELEVANT_FIELDS = [
    'minWeight', 'docketCharges', 'fuel', 'rovCharges', 'insuranceCharges',
    'odaCharges', 'codCharges', 'prepaidCharges', 'topayCharges',
    'handlingCharges', 'fmCharges', 'appointmentCharges', 'minCharges',
    'greenTax', 'daccCharges', 'miscCharges',
  ];
  const hasPricingData = sourcedFields.some(f => PRICING_RELEVANT_FIELDS.includes(f));

  const serviceability = utsf.serviceability || {};
  const zoneLabels = Object.keys(serviceability);
  const zoneCount = zoneLabels.length;
  const totalPincodes = utsf.stats?.totalPincodes
    || utsf.stats?.totalServedPincodes
    || zoneLabels.reduce((sum, z) => {
      const entry = serviceability[z];
      return sum + (entry.servedCount || 0) + (entry.odaCount || 0);
    }, 0);

  const expandRanges = (ranges: Array<{ s: number; e: number }> | undefined): number[] => {
    const out: number[] = [];
    for (const r of ranges || []) {
      if (r == null || r.s == null || r.e == null) continue;
      for (let p = r.s; p <= r.e; p++) out.push(p);
    }
    return out;
  };

  const service: ServiceEntry[] = [];
  for (const zone of zoneLabels) {
    const entry = serviceability[zone];
    const servedSingles = entry.servedSingles || entry.incl_singles || entry.includedSingles || [];
    const servedRangePins = expandRanges(entry.servedRanges);
    const crossZoneSingles = entry.crossZoneSingles || [];
    const crossZoneRangePins = expandRanges(entry.crossZoneRanges);
    const odaSingles = entry.odaSingles || [];
    const odaRangePins = expandRanges(entry.odaRanges);

    const zonePins: Record<string, boolean> = {};
    for (const pin of [...servedSingles, ...servedRangePins, ...crossZoneSingles, ...crossZoneRangePins]) {
      zonePins[String(pin)] = false;
    }
    for (const pin of [...odaSingles, ...odaRangePins]) {
      zonePins[String(pin)] = true;
    }
    for (const pincodeStr of Object.keys(zonePins)) {
      service.push({ pincode: Number(pincodeStr), isOda: zonePins[pincodeStr], zone });
    }
  }

  const utsfZoneRates = utsf.pricing?.zoneRates || {};
  const zoneMatrix = zoneLabels.length > 0 && Object.keys(utsfZoneRates).length > 0
    ? zoneLabels.map(from => zoneLabels.map(to => utsfZoneRates[from]?.[to] || 0))
    : [];

  return { pricing, sourcedFields, hasPricingData, zoneLabels, zoneMatrix, service, zoneCount, totalPincodes, companyName };
}
