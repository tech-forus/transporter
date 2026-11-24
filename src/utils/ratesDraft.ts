// The rates editor's unsaved work, kept in localStorage like the sign-up's pricing draft (utils/pricingDraft.ts), so leaving the
// page (Done, "Back to organisation", an expired Manage-rates session, a refresh) does not lose what was typed or uploaded.
// One draft per signed-in account and per editor (own rates or one shipper's custom rates). It is removed once the server
// has accepted the rates (autosave success or "Publish"), or when the user discards it.

export interface RatesDraft {
  priceRate?: Record<string, any>;
  zoneRates?: Record<string, Record<string, number>>;
  lanes?: any[];
  service?: { pincode: number; zone: string; isOda: boolean }[] | null;
  savedAt: number;
}

export const ratesDraftKey = (accountId: string, linkId?: string | null) => `fc_rates_draft:${accountId}:${linkId || 'me'}`;

export function loadRatesDraft(key: string): RatesDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) || 'null');
    return d && typeof d === 'object' && typeof d.savedAt === 'number' ? d : null;
  } catch { return null; }
}

export function saveRatesDraft(key: string, draft: Omit<RatesDraft, 'savedAt'>) {
  const full = { ...draft, savedAt: Date.now() };
  try { localStorage.setItem(key, JSON.stringify(full)); return; } catch { /* quota: retry without the pincode list, the biggest part */ }
  try { localStorage.setItem(key, JSON.stringify({ ...full, service: null })); } catch { /* storage unavailable */ }
}

export function clearRatesDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

export const hasRatesDraft = (accountId: string) => {
  try { return !!localStorage.getItem(ratesDraftKey(accountId)); } catch { return false; }
};
