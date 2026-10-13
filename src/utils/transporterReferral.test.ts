import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureTransporterReferralFromUrl, getStoredTransporterReferral, clearStoredTransporterReferral,
  captureReferralFromUrl, getStoredReferral,
} from './referral';

beforeEach(() => { localStorage.clear(); window.history.pushState({}, '', '/'); });

describe('transporter invite (?tref=) capture', () => {
  it('stores a cleaned tref code and returns it on later pages without the param', () => {
    window.history.pushState({}, '', '/transporter-signup?tref=ab-cd12 34');
    expect(captureTransporterReferralFromUrl()).toBe('ABCD1234');
    window.history.pushState({}, '', '/transporter-verify-otp');
    expect(captureTransporterReferralFromUrl()).toBe('ABCD1234');
    clearStoredTransporterReferral();
    expect(getStoredTransporterReferral()).toBeNull();
  });

  it('never mixes with the shipper invite (?ref=)', () => {
    window.history.pushState({}, '', '/transporter-signup?tref=TTTT1111&ref=SSSS2222');
    captureTransporterReferralFromUrl(); captureReferralFromUrl();
    expect(getStoredTransporterReferral()).toBe('TTTT1111');
    expect(getStoredReferral()).toBe('SSSS2222');
  });

  it('a ?ref= link alone does not set a transporter invite', () => {
    window.history.pushState({}, '', '/transporter-signup?ref=SSSS2222');
    expect(captureTransporterReferralFromUrl()).toBeNull();
  });
});
