// The Business signup's hand-entered pricing draft (AddPrice's charges table and zone matrix) is kept
// in localStorage so a Back -> re-upload round trip doesn't lose it. Two problems this solves:
//  1. Starting a new AI read used to delete the draft outright, so a document that then failed to
//     parse left the user with an empty table after they had already filled it in.
//  2. The saved charges mix typed values with values merged in from an earlier AI read, and only the
//     typed ones should survive — so edits are tracked per field.
// Leftovers from a different company are still wiped: the draft records which GSTIN owns it.

export const PRICE_KEY = 'transporter_price_rate';
export const ZONE_KEY = 'transporter_zone_rates';
export const EXTRACTED_KEY = 'transporter_extracted_price_rate';
export const TOUCHED_KEY = 'transporter_price_touched';
export const OWNER_KEY = 'transporter_pricing_owner_gst';

// Matches the schema defaults (model/priceModel.js) — kFactor/divisor drive volumetric-weight
// calculations elsewhere, so 0 would be actively wrong.
export const DEFAULT_PRICE_RATE = {
  minWeight: 0,
  docketCharges: { variable: 0, fixed: 0 },
  fuel: { variable: 0, fixed: 0 },
  gstPct: { variable: 0, fixed: 0 },
  minCharges: { variable: 0, fixed: 0 },
  rovCharges: { variable: 0, fixed: 0 },
  odaCharges: { variable: 0, fixed: 0 },
  handlingCharges: { variable: 0, fixed: 0, threshholdweight: 0 },
  greenTax: { variable: 0, fixed: 0 },
  hamaliCharges: { variable: 0, fixed: 0 },
  miscellanousCharges: { variable: 0, fixed: 0 },
  topayCharges: { variable: 0, fixed: 0 },
  codCharges: { variable: 0, fixed: 0 },
  daccCharges: { variable: 0, fixed: 0 },
  insuaranceCharges: { variable: 0, fixed: 0 },
  prepaidCharges: { variable: 0, fixed: 0 },
  fmCharges: { variable: 0, fixed: 0 },
  appointmentCharges: { variable: 0, fixed: 0 },
  divisor: 5000,
  kFactor: 5000,
  chequeHandlingCharges: 0,
};

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } };
const remove = (key: string) => { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } };

const readTouched = (): string[] => {
  try {
    const parsed = JSON.parse(read(TOUCHED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
};

/** Call when the user (not an AI merge) edits a charge, so it can be told apart later. */
export function markPriceFieldTouched(field: string) {
  const touched = readTouched();
  if (!touched.includes(field)) write(TOUCHED_KEY, JSON.stringify([...touched, field]));
}

/** Record which company's draft is in storage. */
export function rememberPricingOwner(gstNo: string) {
  write(OWNER_KEY, (gstNo || '').trim().toUpperCase());
}

/** Removes the draft and all of its bookkeeping. */
export function clearPricingDraft() {
  for (const key of [PRICE_KEY, ZONE_KEY, EXTRACTED_KEY, TOUCHED_KEY, OWNER_KEY]) remove(key);
}

/**
 * Call right before a new AI read starts. The previous read's output is always dropped. The draft is
 * kept only when it belongs to the same company (same non-empty GSTIN): the zone matrix as-is, and the
 * charges the user actually typed — everything else goes back to its default so the new file can fill it.
 * Anything else (another company, unknown owner) is wiped, as it always was.
 */
export function preparePricingForNewExtraction(gstNo: string) {
  remove(EXTRACTED_KEY);
  const current = (gstNo || '').trim().toUpperCase();
  const owner = (read(OWNER_KEY) || '').trim().toUpperCase();

  if (!current || owner !== current) {
    clearPricingDraft();
    return;
  }

  const touched = readTouched();
  const savedRaw = read(PRICE_KEY);
  if (!savedRaw || touched.length === 0) {
    remove(PRICE_KEY); // nothing was typed by hand, so nothing to protect
    return;
  }
  try {
    const saved = JSON.parse(savedRaw);
    const next: Record<string, unknown> = { ...DEFAULT_PRICE_RATE };
    for (const key of touched) if (key in saved) next[key] = saved[key];
    write(PRICE_KEY, JSON.stringify(next));
  } catch {
    remove(PRICE_KEY);
    remove(TOUCHED_KEY);
  }
}
