import { describe, it, expect, beforeEach } from 'vitest';
import { captureReferralFromUrl, getStoredReferral, clearStoredReferral } from './referral';

describe('referral capture', () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/'); });

  it('stores a sanitised code from ?ref= and returns it', () => {
    window.history.replaceState({}, '', '/transporter-signup?ref=ab-cd2345%20');
    expect(captureReferralFromUrl()).toBe('ABCD2345');
    expect(getStoredReferral()).toBe('ABCD2345');
  });
  it('keeps the stored code when the URL no longer has ?ref= (multi-step signup)', () => {
    window.history.replaceState({}, '', '/?ref=ABCD2345'); captureReferralFromUrl();
    window.history.replaceState({}, '', '/transporter-verify-otp');
    expect(captureReferralFromUrl()).toBe('ABCD2345');
  });
  it('ignores empty/garbage refs and can be cleared', () => {
    window.history.replaceState({}, '', '/?ref=%20%20'); expect(captureReferralFromUrl()).toBeNull();
    localStorage.setItem('fc_vendor_referral_code', 'X'); clearStoredReferral();
    expect(getStoredReferral()).toBeNull();
  });
  it('a newer ?ref= replaces an older stored one', () => {
    window.history.replaceState({}, '', '/?ref=OLDCODE1'); captureReferralFromUrl();
    window.history.replaceState({}, '', '/?ref=NEWCODE2');
    expect(captureReferralFromUrl()).toBe('NEWCODE2');
  });
});
