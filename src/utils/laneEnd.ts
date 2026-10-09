// Pure helpers for one end (From or To) of a lane in the rates editor: the picked address and point,
// the pincode, and the optional "include nearby" reach. Each returns a lane patch, so the editor page
// stays a thin wrapper and the rules are testable without a browser.
// Server-side counterpart: freight-compare-backend/controllers/transporterRatesController.js (cleanLanes).

export type Side = 'origin' | 'destination';
type Lane = Record<string, any>;

export interface EndFields {
  pincode: string;
  address: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  coverage: string[];
}

const PINCODE_RE = /^\d{6}$/;
const k = (side: Side, field: string) => `${side}${field}`;

export function readEnd(lane: Lane, side: Side): EndFields {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    pincode: String(lane[k(side, 'Pincode')] ?? ''),
    address: String(lane[k(side, 'Address')] ?? ''),
    lat: num(lane[k(side, 'Lat')]),
    lng: num(lane[k(side, 'Lng')]),
    radiusKm: Number(lane[k(side, 'RadiusKm')]) || 0,
    coverage: Array.isArray(lane[k(side, 'Coverage')]) ? lane[k(side, 'Coverage')] : [],
  };
}

// Typing a pincode by hand means the picked address/point no longer describes it, and the old list was
// for the old pincode. The radius choice is kept so the tick stays on and the list can be refreshed.
export function patchPincodeTyped(side: Side, raw: string): Lane {
  return {
    [k(side, 'Pincode')]: raw.replace(/\D/g, '').slice(0, 6),
    [k(side, 'Address')]: '',
    [k(side, 'Lat')]: undefined,
    [k(side, 'Lng')]: undefined,
    [k(side, 'Coverage')]: [],
  };
}

// Returns null when Google gave no usable 6-digit pincode for the pick (the caller asks the user to type it).
export function patchPlaceResolved(
  side: Side,
  place: { formattedAddress: string; lat: number; lng: number; pincode: string },
): Lane | null {
  if (!PINCODE_RE.test(place.pincode || '')) return null;
  return {
    [k(side, 'Address')]: place.formattedAddress,
    [k(side, 'Lat')]: place.lat,
    [k(side, 'Lng')]: place.lng,
    [k(side, 'Pincode')]: place.pincode,
    [k(side, 'Coverage')]: [],
  };
}

// A list belongs to one radius, so changing the radius (or turning it off) discards it.
export function patchRadius(side: Side, radiusKm: number): Lane {
  return { [k(side, 'RadiusKm')]: radiusKm, [k(side, 'Coverage')]: [] };
}

export function patchCoverage(side: Side, pincodes: string[], own: string): Lane {
  return { [k(side, 'Coverage')]: [...new Set([own, ...pincodes])] };
}

// The lane's own pincode can never be removed from its own list.
export function patchRemoveChip(lane: Lane, side: Side, pincode: string): Lane {
  const { pincode: own, coverage } = readEnd(lane, side);
  return { [k(side, 'Coverage')]: pincode === own ? coverage : coverage.filter((p) => p !== pincode) };
}

// A radius is on and the pincode is complete, but no list has been fetched for it yet.
export function needsPreview(end: EndFields): boolean {
  return end.radiusKm > 0 && PINCODE_RE.test(end.pincode) && end.coverage.length === 0;
}
