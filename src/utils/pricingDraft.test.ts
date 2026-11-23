import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PRICE_RATE, PRICE_KEY, ZONE_KEY, EXTRACTED_KEY, TOUCHED_KEY, OWNER_KEY,
  markPriceFieldTouched, rememberPricingOwner, preparePricingForNewExtraction, clearPricingDraft, saveZonePincodes, loadZonePincodes, hasUnsavedPricingDraft,
} from './pricingDraft';

const GST = '29ABCDE1234F1Z5';
const matrix = JSON.stringify({ labels: ['N1', 'S1'], matrix: [[0, 12], [9, 0]] });

// The saved charges hold typed AND AI-merged values together; only `touched` tells them apart.
const savedCharges = () => JSON.stringify({
  ...DEFAULT_PRICE_RATE,
  docketCharges: { variable: 0, fixed: 50 },   // typed by the user
  fuel: { variable: 8, fixed: 0 },             // merged in from an earlier AI read
});

describe('preparePricingForNewExtraction', () => {
  beforeEach(() => localStorage.clear());

  it('keeps what the user typed and the zone matrix when re-uploading for the same company', () => {
    localStorage.setItem(PRICE_KEY, savedCharges());
    localStorage.setItem(ZONE_KEY, matrix);
    localStorage.setItem(EXTRACTED_KEY, '{"old":1}');
    rememberPricingOwner(GST);
    markPriceFieldTouched('docketCharges');

    preparePricingForNewExtraction(GST);

    const price = JSON.parse(localStorage.getItem(PRICE_KEY)!);
    expect(price.docketCharges).toEqual({ variable: 0, fixed: 50 });          // typed value survives
    expect(price.fuel).toEqual(DEFAULT_PRICE_RATE.fuel);                       // AI leftover freed for the new file
    expect(localStorage.getItem(ZONE_KEY)).toBe(matrix);                       // hand-filled matrix survives
    expect(localStorage.getItem(EXTRACTED_KEY)).toBeNull();                    // stale AI read is cleared
  });

  it('wipes everything when the GSTIN differs (a different company)', () => {
    localStorage.setItem(PRICE_KEY, savedCharges());
    localStorage.setItem(ZONE_KEY, matrix);
    rememberPricingOwner('27ZZZZZ9999Z1Z1');
    markPriceFieldTouched('docketCharges');

    preparePricingForNewExtraction(GST);

    expect(localStorage.getItem(PRICE_KEY)).toBeNull();
    expect(localStorage.getItem(ZONE_KEY)).toBeNull();
    expect(localStorage.getItem(TOUCHED_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it('wipes everything when the leftovers have no known owner', () => {
    localStorage.setItem(PRICE_KEY, savedCharges());
    localStorage.setItem(ZONE_KEY, matrix);
    preparePricingForNewExtraction(GST);
    expect(localStorage.getItem(PRICE_KEY)).toBeNull();
    expect(localStorage.getItem(ZONE_KEY)).toBeNull();
  });

  it('wipes everything when no GSTIN is entered', () => {
    localStorage.setItem(PRICE_KEY, savedCharges());
    rememberPricingOwner('');
    markPriceFieldTouched('docketCharges');
    preparePricingForNewExtraction('');
    expect(localStorage.getItem(PRICE_KEY)).toBeNull();
  });

  it('drops the saved charges (as before) when the same company typed nothing, but keeps the matrix', () => {
    localStorage.setItem(PRICE_KEY, savedCharges());
    localStorage.setItem(ZONE_KEY, matrix);
    rememberPricingOwner(GST);

    preparePricingForNewExtraction(GST);

    expect(localStorage.getItem(PRICE_KEY)).toBeNull();
    expect(localStorage.getItem(ZONE_KEY)).toBe(matrix);
  });

  it('keeps a typed volumetric divisor together with its k-factor', () => {
    localStorage.setItem(PRICE_KEY, JSON.stringify({ ...DEFAULT_PRICE_RATE, divisor: 4000, kFactor: 4000 }));
    rememberPricingOwner(GST);
    markPriceFieldTouched('divisor');
    markPriceFieldTouched('kFactor');

    preparePricingForNewExtraction(GST);

    const price = JSON.parse(localStorage.getItem(PRICE_KEY)!);
    expect(price.divisor).toBe(4000);
    expect(price.kFactor).toBe(4000);
  });

  it('survives corrupt saved data by clearing it instead of throwing', () => {
    localStorage.setItem(PRICE_KEY, '{not json');
    rememberPricingOwner(GST);
    markPriceFieldTouched('docketCharges');
    expect(() => preparePricingForNewExtraction(GST)).not.toThrow();
    expect(localStorage.getItem(PRICE_KEY)).toBeNull();
  });
});

describe('markPriceFieldTouched / clearPricingDraft', () => {
  beforeEach(() => localStorage.clear());

  it('records each field once', () => {
    markPriceFieldTouched('fuel'); markPriceFieldTouched('fuel'); markPriceFieldTouched('docketCharges');
    expect(JSON.parse(localStorage.getItem(TOUCHED_KEY)!)).toEqual(['fuel', 'docketCharges']);
  });

  it('clearPricingDraft removes the draft and its bookkeeping', () => {
    localStorage.setItem(PRICE_KEY, '{}'); localStorage.setItem(ZONE_KEY, '{}'); localStorage.setItem(EXTRACTED_KEY, '{}');
    rememberPricingOwner(GST); markPriceFieldTouched('fuel');
    clearPricingDraft();
    for (const k of [PRICE_KEY, ZONE_KEY, EXTRACTED_KEY, TOUCHED_KEY, OWNER_KEY]) expect(localStorage.getItem(k)).toBeNull();
  });
});

describe('the picked service area survives leaving and coming back (review: manual rates "not saved")', () => {
  beforeEach(() => localStorage.clear());
  const pins = [{ pincode: 110020, zone: 'N1', isOda: false }, { pincode: 411001, zone: 'W1', isOda: true }];

  it('round-trips the zone pincodes, and clearing the draft clears them too', () => {
    saveZonePincodes(pins);
    expect(loadZonePincodes()).toEqual(pins);
    clearPricingDraft();
    expect(loadZonePincodes()).toEqual([]);
  });

  it('ignores junk in storage and keeps only well-formed rows', () => {
    localStorage.setItem('transporter_zone_pincodes', 'not json');
    expect(loadZonePincodes()).toEqual([]);
    localStorage.setItem('transporter_zone_pincodes', JSON.stringify([{ pincode: 110020, zone: 'N1', isOda: false }, { pincode: 'x', zone: '' }, null]));
    expect(loadZonePincodes()).toEqual([{ pincode: 110020, zone: 'N1', isOda: false }]);
  });

  it('knows there is unsaved work: typed charges, a zone matrix or picked pincodes; nothing once cleared', () => {
    expect(hasUnsavedPricingDraft()).toBe(false);
    markPriceFieldTouched('docketCharges');
    expect(hasUnsavedPricingDraft()).toBe(true);
    clearPricingDraft();
    localStorage.setItem('transporter_zone_rates', matrix);
    expect(hasUnsavedPricingDraft()).toBe(true);
    clearPricingDraft();
    saveZonePincodes(pins);
    expect(hasUnsavedPricingDraft()).toBe(true);
    clearPricingDraft();
    expect(hasUnsavedPricingDraft()).toBe(false);
  });
});
