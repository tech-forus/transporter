// Shared transporter logo resolution — MIRROR of
// freight-compare-frontend/src/utils/transporterLogo.ts. The two apps are
// separate builds and can't share a module; keep them in sync.
//
// Fallback priority (display-only, per product decision):
//   1. transporter's own uploaded logo (logoUrl)
//   2. logo of the selected logistics network, if a known one with a brand asset
//      (inferred from `network`, best-effort also from company name)
//   3. null → caller renders the initials-circle fallback

import { API_BASE_URL } from '../config/apiConfig';

import bluedartLogo from '../assets/logos/bluedart.svg';
import delhiveryLogo from '../assets/logos/delhivery.svg';
import dtdcLogo from '../assets/logos/dtdc.svg';
import dpworldLogo from '../assets/logos/dpworld.svg';
import ekartLogo from '../assets/logos/ekart.svg';
import rivigoLogo from '../assets/logos/rivigo.svg';

// Only networks with a brand asset on disk are mapped. Others fall through to
// initials — we do not source new art.
const NETWORK_LOGO_MAP: Record<string, string> = {
  bluedart: bluedartLogo,
  delhivery: delhiveryLogo,
  dtdc: dtdcLogo,
  dpworld: dpworldLogo,
  ekart: ekartLogo,
  rivigo: rivigoLogo,
};

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const resolveOwnLogo = (logoUrl?: string | null): string | null => {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const trimmed = logoUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) return trimmed;
  return `${API_BASE_URL}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

// A transporter can now belong to several networks at once (ticked via
// checkboxes on signup) — use the first one in the list that has a known
// brand asset, so display stays a single logo rather than trying to render
// several badges at once.
const resolveNetworkLogo = (networks?: string[] | null, companyName?: string | null): string | null => {
  if (Array.isArray(networks)) {
    for (const network of networks) {
      if (network && typeof network === 'string') {
        const key = normalize(network);
        if (key && key !== 'independent' && key !== 'other' && NETWORK_LOGO_MAP[key]) {
          return NETWORK_LOGO_MAP[key];
        }
      }
    }
  }
  if (companyName && typeof companyName === 'string') {
    const cn = normalize(companyName);
    for (const key of Object.keys(NETWORK_LOGO_MAP)) {
      if (cn.includes(key)) return NETWORK_LOGO_MAP[key];
    }
  }
  return null;
};

export interface TransporterLogoInput {
  logoUrl?: string | null;
  networks?: string[] | null;
  companyName?: string | null;
}

/**
 * Returns an <img src> string for the transporter's logo, or null when the
 * caller should render the initials-circle fallback.
 */
export function resolveTransporterLogo(input: TransporterLogoInput): string | null {
  return (
    resolveOwnLogo(input.logoUrl) ||
    resolveNetworkLogo(input.networks, input.companyName) ||
    null
  );
}

// The canonical network dropdown options (label + stored value). Shared by the
// signup form. Value matches the backend `network` enum.
export const NETWORK_OPTIONS: { value: string; label: string }[] = [
  { value: 'independent', label: 'Independent / Not part of a network' },
  { value: 'Delhivery', label: 'Delhivery' },
  { value: 'DTDC', label: 'DTDC' },
  { value: 'Ecom Express', label: 'Ecom Express' },
  { value: 'XpressBees', label: 'XpressBees' },
  { value: 'Shadowfax', label: 'Shadowfax' },
  { value: 'Blue Dart', label: 'Blue Dart' },
  { value: 'Safexpress', label: 'Safexpress' },
  { value: 'Gati', label: 'Gati' },
  { value: 'TCI', label: 'TCI (Transport Corporation of India)' },
  { value: 'Rivigo', label: 'Rivigo' },
  { value: 'DP World', label: 'DP World' },
  { value: 'Ekart', label: 'Ekart' },
  { value: 'other', label: 'Other (specify)' },
];
