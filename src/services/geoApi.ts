// transporter-main/src/services/geoApi.ts
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';

export interface ResolvedPlace {
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string | null;
  area: string;
  city: string;
  state: string;
  pincode: string;
  flatNumber: string;
  buildingName: string;
}

// Public, rate-limited backend endpoint (routes/geoRoute.js in
// freight-compare-backend) — no auth needed, same backend this app already
// calls for everything else. Deliberately does NOT catch errors here — lets
// a failed/rejected request propagate to the caller, matching
// freight-compare-frontend's identical geoApi.ts contract that
// AddressAutosuggest.tsx is written to expect (it has its own .catch() for
// this).
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const { data } = await axios.post(`${API_BASE_URL}/api/geo/reverse-geocode`, { lat, lng });
  return data?.data || null;
}

// Forward geocode — used by AddressLocationPicker.tsx to pre-fill the map
// from a GST-resolved company address (Business accounts), same low-frequency
// backend-proxied call freight-compare-frontend's geoApi.ts makes.
export async function geocodeAddress(address: string): Promise<ResolvedPlace | null> {
  const { data } = await axios.get(`${API_BASE_URL}/api/geo/geocode`, {
    params: { address },
  });
  return data?.data || null;
}
