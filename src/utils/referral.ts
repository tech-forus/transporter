const KEY = 'fc_vendor_referral_code';

export function getStoredReferral(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function clearStoredReferral() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

// Call on any page load: stores ?ref= when present, otherwise returns what was stored earlier
// (the signup is multi-step and passes through a Google redirect and an OTP page).
export function captureReferralFromUrl(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('ref');
    const clean = (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
    if (clean) { localStorage.setItem(KEY, clean); return clean; }
  } catch { /* fall through */ }
  return getStoredReferral();
}
