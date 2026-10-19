// transporter-main/src/utils/mapProjection.ts
//
// Minimal port of freight-compare-frontend's mapProjection.ts — only
// haversineKm, which AddressLocationPicker.tsx needs for its "snap the pin
// to a nearby precise match" logic. The shipper app's pincode-centroid
// nearest-lookup helpers aren't ported: transporter-main has no
// pincodes.json centroid table and no equivalent GPS-derived-pincode
// use case.
export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
