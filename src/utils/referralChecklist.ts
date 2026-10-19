// "Keep these ready" checklist shown to a transporter who lands on a shipper's invite link.
// Content mirrors what the signup flow (SignUpPage.tsx, IndividualLaneRatesStep.tsx) and the
// post-signup KycGate/KycWizardCard actually ask for — update it when those change.

export type AccountTab = 'business' | 'individual';

export interface ChecklistItem { id: string; label: string; hint?: string; optional?: boolean }
export interface ChecklistSection { id: string; title: string; subtitle: string; items: ChecklistItem[] }

const KYC_SECTION: ChecklistSection = {
  id: 'kyc',
  title: 'Right after sign-up: KYC',
  subtitle: 'You may be asked for these before you can use your dashboard. JPG, PNG or PDF, up to 5 MB each.',
  items: [
    { id: 'kyc.aadhaar', label: 'Aadhaar card', hint: 'Of the company representative (or yourself, if you are an individual).' },
    { id: 'kyc.selfie', label: 'A live selfie', hint: 'Taken with your camera on the spot to match your Aadhaar. It cannot be uploaded from the gallery.' },
    { id: 'kyc.photos', label: 'Photos of your office or warehouse', hint: 'At least 3, from different angles.' },
    { id: 'kyc.rc', label: 'Vehicle RC', hint: 'Registration certificate of one vehicle. More can be added later.' },
    { id: 'kyc.dl', label: "Driver's licence", hint: "One driver's licence. More can be added later." },
  ],
};

export const CHECKLIST: Record<AccountTab, ChecklistSection[]> = {
  business: [
    {
      id: 'business.details',
      title: 'Step 1: Company details',
      subtitle: 'Fill in your GST number first. It autofills the rest.',
      items: [
        { id: 'business.gst', label: 'GST number', hint: 'Your company name is fetched from it.' },
        { id: 'business.network', label: 'Logistics network', hint: 'Which network you belong to, or independent.' },
        { id: 'business.pincodes', label: 'About how many pincodes you serve' },
        { id: 'business.fleet', label: 'Total fleet size', hint: 'Number of trucks you run.' },
      ],
    },
    {
      id: 'business.rates',
      title: 'Step 2: Rates',
      subtitle: 'Upload your rate card and we read the charges out of it. Up to 3 files, 10 MB each: PDF, Excel, Word, photo or JSON.',
      items: [
        { id: 'business.ratecard', label: 'Your rate card or price list', hint: 'The file you already send to customers is fine.' },
        { id: 'business.charges', label: 'Your charges', hint: 'Docket, fuel surcharge, GST %, ROV/FOV and handling.' },
        { id: 'business.zones', label: 'Zone-to-zone rates', hint: 'Your per-kg rate between each pair of zones.' },
        { id: 'business.serviceable', label: 'Pincodes you serve', hint: 'A list or sheet of serviceable pincodes.' },
      ],
    },
    KYC_SECTION,
  ],
  individual: [
    {
      id: 'individual.details',
      title: 'Step 1: Your details',
      subtitle: 'No GST needed for individual and owner-operator accounts.',
      items: [
        { id: 'individual.name', label: 'Your first name', hint: 'Last name is optional.' },
        { id: 'individual.transporterName', label: 'A name for your operation', hint: 'Letters and spaces only, up to 30 characters.' },
        { id: 'individual.phones', label: 'Mobile and WhatsApp numbers', hint: '10 digits each. They can be the same number.' },
        { id: 'individual.email', label: 'Email address', optional: true },
        { id: 'individual.password', label: 'A password you will remember' },
      ],
    },
    {
      id: 'individual.lanes',
      title: 'Step 2: Your lanes and prices',
      subtitle: 'Add lanes one by one, upload an Excel or CSV sheet, or drop a pin on the map to add nearby pincodes at once.',
      items: [
        { id: 'individual.routes', label: 'Each route you run', hint: 'The pickup and drop pincode for every lane.' },
        { id: 'individual.vehicle', label: 'Vehicle type and capacity for each lane', hint: 'For a custom vehicle, also the bed length, width and height.' },
        { id: 'individual.prices', label: 'Your price for each lane' },
      ],
    },
    KYC_SECTION,
  ],
};

export function allItems(tab: AccountTab): ChecklistItem[] {
  return CHECKLIST[tab].flatMap((s) => s.items);
}

// Optional items don't count toward "ready" — a transporter without a logo is still ready.
export function progress(tab: AccountTab, checked: Record<string, boolean>): { done: number; total: number } {
  const required = allItems(tab).filter((i) => !i.optional);
  return { done: required.filter((i) => checked[i.id]).length, total: required.length };
}

// Only a fresh landing on the invite link (?ref=) opens the modal. The stored referral code also
// survives the Google redirect and OTP pages, and re-opening a dialog on those would interrupt signup.
export function hasRefInUrl(search: string): boolean {
  try { return !!(new URLSearchParams(search).get('ref') || '').trim(); } catch { return false; }
}

const KEY = 'fc_referral_checklist_v1';

export function loadChecked(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function saveChecked(checked: Record<string, boolean>) {
  try { localStorage.setItem(KEY, JSON.stringify(checked)); } catch { /* storage unavailable */ }
}
