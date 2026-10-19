import { describe, it, expect, beforeEach } from 'vitest';
import { CHECKLIST, allItems, progress, hasRefInUrl, loadChecked, saveChecked } from './referralChecklist';

describe('referral checklist content', () => {
  it('has unique item ids per account type', () => {
    for (const tab of ['business', 'individual'] as const) {
      const ids = allItems(tab).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('shares the KYC section between both account types, so ticks carry across tabs', () => {
    const kyc = (tab: 'business' | 'individual') => CHECKLIST[tab].find((s) => s.id === 'kyc');
    expect(kyc('business')).toBeDefined();
    expect(kyc('business')).toBe(kyc('individual'));
  });
});

describe('progress', () => {
  it('counts only required items', () => {
    const required = allItems('business').filter((i) => !i.optional);
    expect(progress('business', {})).toEqual({ done: 0, total: required.length });
    expect(progress('business', { 'business.gst': true })).toEqual({ done: 1, total: required.length });
  });
  it('does not count optional items', () => {
    const required = allItems('individual').filter((i) => !i.optional);
    expect(progress('individual', { 'individual.name': true, 'individual.email': true })).toEqual({ done: 1, total: required.length });
  });
  it('reaches total when every required item is ticked', () => {
    const all = Object.fromEntries(allItems('individual').map((i) => [i.id, true]));
    const p = progress('individual', all);
    expect(p.done).toBe(p.total);
  });
});

describe('hasRefInUrl', () => {
  it('is true only when ?ref= has a value', () => {
    expect(hasRefInUrl('?ref=USVDA9XG')).toBe(true);
    expect(hasRefInUrl('?ref=%20%20')).toBe(false);
    expect(hasRefInUrl('?ref=')).toBe(false);
    expect(hasRefInUrl('')).toBe(false);
  });
});

describe('checked-state storage', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips ticks', () => {
    saveChecked({ 'kyc.aadhaar': true });
    expect(loadChecked()).toEqual({ 'kyc.aadhaar': true });
  });
  it('recovers from corrupt or wrong-shaped storage', () => {
    localStorage.setItem('fc_referral_checklist_v1', '{not json');
    expect(loadChecked()).toEqual({});
    localStorage.setItem('fc_referral_checklist_v1', '[1,2]');
    expect(loadChecked()).toEqual({});
  });
});
