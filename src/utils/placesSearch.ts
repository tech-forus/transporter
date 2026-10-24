// transporter-main/src/utils/placesSearch.ts (mirror of freight-compare-frontend/src/utils/placesSearch.ts)
//
// Shared client-side address search for every Google Places search box
// (AddressAutosuggest, AddressLocationPicker). Same order the WhatsApp bot
// already uses server-side (freight-compare-backend services/whatsapp/chatbot/addressFlow.js):
//   1. Autocomplete, biased to a known point when the caller has one;
//   2. only if that returns nothing, Text Search.
// Why: Autocomplete returns ZERO results for unit-number-first queries like
// "b313 forus electric" without location context (verified 2026-10-22),
// while Text Search returns the exact "B-313, Pocket B, Okhla Phase I..."
// with no bias at all. Text Search costs more per call, so it runs only on
// the empty-result path, after the caller's debounce.

export interface PlaceSearchSuggestion {
  placeId: string;
  description: string;
  place: any; // google.maps.places.Place — callers fetchFields() it on pick
}

export interface LatLng { lat: number; lng: number }

const BIAS_RADIUS_M = 30000;
const inIndia = (lat: number, lng: number) => lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.6;

export async function searchPlaces(
  places: any,
  { input, sessionToken, bias }: { input: string; sessionToken?: any; bias?: LatLng | null },
): Promise<PlaceSearchSuggestion[]> {
  const locationBias = bias ? { center: bias, radius: BIAS_RADIUS_M } : undefined;

  const { suggestions: raw } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    includedRegionCodes: ['in'],
    ...(locationBias && { locationBias }),
  });
  const auto: PlaceSearchSuggestion[] = (raw || [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      description: s.placePrediction.text?.text || '',
      place: s.placePrediction.toPlace(),
    }));
  if (auto.length > 0) return auto;

  try {
    const { places: found } = await places.Place.searchByText({
      textQuery: input,
      fields: ['id', 'displayName', 'formattedAddress', 'location'],
      region: 'in',
      maxResultCount: 5,
      ...(locationBias && { locationBias }),
    });
    return (found || [])
      .filter((p: any) => p.id && p.location && inIndia(p.location.lat(), p.location.lng()))
      .map((p: any) => {
        const name = p.displayName || '';
        const addr = p.formattedAddress || '';
        return {
          placeId: p.id,
          description: name && !addr.startsWith(name) ? `${name}, ${addr}` : addr,
          place: p,
        };
      });
  } catch {
    return []; // fallback is best-effort; never turn an empty result into an error
  }
}
