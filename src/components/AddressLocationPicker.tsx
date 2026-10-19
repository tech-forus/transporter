// transporter-main/src/components/AddressLocationPicker.tsx
//
// Ported verbatim from freight-compare-frontend/src/components/
// AddressLocationPicker.tsx (the shipper signup's Google-Maps pin/drag/GPS
// "Confirm Your Location" picker) — same interface, same behavior, kept as
// an independent copy per this app's established pattern (AddressAutosuggest.tsx
// is already a separate copy for the same reason: no shared component
// package between the two deployables).
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Search, Loader2, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';
import { geocodeAddress, reverseGeocode, type ResolvedPlace } from '../services/geoApi';
import { haversineKm } from '../utils/mapProjection';
import LocationPermissionModal, { type LocationPermissionPhase } from './LocationPermissionModal';

export interface AddressLocationValue {
  flatNumber: string;
  buildingName: string;
  area: string;
  landmark: string;
  city: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  formattedAddress: string;
}

interface PlaceSuggestion {
  placeId: string;
  description: string;
  // Typed-search (Autocomplete) suggestions arrive without full details —
  // `place` holds the live google.maps.places.Place instance, resolved
  // lazily via fetchFields() only once the user actually selects it (saves
  // a details call per keystroke). "Use my current location"'s own entry
  // and its nearby-places list already have full details up front (Nearby
  // Search is requested with the fields we need), so those carry
  // `resolvedPlace` directly instead and skip the fetchFields round trip.
  place?: any;
  resolvedPlace?: ResolvedPlace;
  isCurrentLocation?: boolean;
}

interface AddressLocationPickerProps {
  value: AddressLocationValue;
  onChange: (v: AddressLocationValue) => void;
  initialSearchAddress?: string;
  onResolvedRegion?: (r: { state: string; pincode: string }) => void;
  // Default true preserves the signup Location step's existing behavior
  // exactly (arriving at a dedicated "confirm your location" step is a
  // reasonable moment to auto-prompt for GPS). Pass false when this picker
  // is mounted inside a smaller, incidental fallback block (e.g. a
  // profile-completion modal's "GST didn't resolve everything" card) where
  // an unprompted location request would be a surprising side effect of
  // just opening a form, not something the user asked for by arriving here.
  autoRequestLocation?: boolean;
}

const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 }; // New Delhi — generic India fallback

/** Flattens Places JS (New) address components — { longText, types } — into
 *  the same { area, city, state, pincode } shape the backend's geocode
 *  responses already use, so callers don't need two normalizers. */
function extractComponentsFromPlace(components: any[] | undefined): { area: string; city: string; state: string; pincode: string; flatNumber: string; buildingName: string } {
  const byType: Record<string, string> = {};
  for (const c of components || []) {
    for (const t of c.types || []) {
      if (!byType[t]) byType[t] = c.longText;
    }
  }
  return {
    area: byType.sublocality_level_1 || byType.sublocality || byType.locality || '',
    city: byType.locality || byType.administrative_area_level_2 || '',
    state: byType.administrative_area_level_1 || '',
    pincode: byType.postal_code || '',
    flatNumber: byType.subpremise || '',
    buildingName: byType.premise || '',
  };
}

const AddressLocationPicker: React.FC<AddressLocationPickerProps> = ({
  value,
  onChange,
  initialSearchAddress,
  onResolvedRegion,
  autoRequestLocation = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const placesLibRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permPhase, setPermPhase] = useState<LocationPermissionPhase>('primer');
  const debounceRef = useRef<number | null>(null);
  const autoRequestedRef = useRef(false);
  const geoInFlightRef = useRef(false);
  const hasLocation = value.lat != null && value.lng != null;

  const applyResolvedPlace = useCallback((place: ResolvedPlace) => {
    onChange({
      ...value,
      // Never overwrite something the user already typed themselves — only
      // fill these in when Google actually resolved a flat/unit number or
      // building name AND the field is still blank.
      flatNumber: value.flatNumber || place.flatNumber || '',
      buildingName: value.buildingName || place.buildingName || '',
      area: value.area || place.area,
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      placeId: place.placeId,
      formattedAddress: place.formattedAddress,
    });
    onResolvedRegion?.({ state: place.state, pincode: place.pincode });

    if (mapRef.current && markerRef.current) {
      const pos = { lat: place.lat, lng: place.lng };
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(17);
      markerRef.current.setPosition(pos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, onResolvedRegion]);

  // ---- Map + Places library init ----
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapContainerRef.current) return;
        placesLibRef.current = g.maps.places;
        sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();

        const center = value.lat && value.lng ? { lat: value.lat, lng: value.lng } : DEFAULT_CENTER;
        const map = new g.maps.Map(mapContainerRef.current, {
          center,
          zoom: value.lat && value.lng ? 17 : 5,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        const marker = new g.maps.Marker({
          position: center,
          map,
          draggable: true,
        });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (!pos) return;
          setIsResolving(true);
          reverseGeocode(pos.lat(), pos.lng())
            .then((place) => { if (place) applyResolvedPlace(place); })
            .finally(() => setIsResolving(false));
        });
        map.addListener('click', (e: any) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          setIsResolving(true);
          reverseGeocode(e.latLng.lat(), e.latLng.lng())
            .then((place) => { if (place) applyResolvedPlace(place); })
            .finally(() => setIsResolving(false));
        });
        mapRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      })
      .catch((err) => setMapError(err.message || 'Could not load the map'));
    return () => { cancelled = true; };
    // Map is created once; applyResolvedPlace's identity changes with `value`
    // but re-creating the map on every keystroke would fight the user's own
    // pan/zoom, so this intentionally only runs on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- GST-address pre-fill (Business accounts) — still via the backend
  // geocode proxy: low-frequency (once per step entry), no session-token
  // mechanic to preserve, and it's already built/verified server-side. ----
  useEffect(() => {
    if (!initialSearchAddress?.trim() || value.lat) return; // never override an already-resolved location
    setIsResolving(true);
    geocodeAddress(initialSearchAddress)
      .then((place) => { if (place) applyResolvedPlace(place); })
      .catch(() => { /* non-fatal — user can still search/drop a pin manually */ })
      .finally(() => setIsResolving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearchAddress]);

  // ---- Search-as-you-type (client-side Places Autocomplete) ----
  const runSearch = useCallback((query: string) => {
    if (query.trim().length < 3 || !placesLibRef.current) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    setIsSearching(true);
    placesLibRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: ['in'],
    })
      .then(({ suggestions: raw }: any) => {
        const mapped: PlaceSuggestion[] = (raw || [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            placeId: s.placePrediction.placeId,
            description: s.placePrediction.text?.text || '',
            place: s.placePrediction.toPlace(),
          }));
        setSuggestions(mapped);
        setSuggestionsOpen(true);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setIsSearching(false));
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchInput(q);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(q), 300);
  };

  const handleSelectSuggestion = (s: PlaceSuggestion) => {
    setSearchInput(s.description);
    setSuggestionsOpen(false);

    // Current-location entry + nearby-places entries already carry full
    // details — apply directly, no network round trip.
    if (s.resolvedPlace) {
      applyResolvedPlace(s.resolvedPlace);
      return;
    }

    setIsResolving(true);
    s.place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents', 'id'] })
      .then(() => {
        const { area, city, state, pincode, flatNumber, buildingName } = extractComponentsFromPlace(s.place.addressComponents);
        applyResolvedPlace({
          formattedAddress: s.place.formattedAddress || s.description,
          lat: s.place.location.lat(),
          lng: s.place.location.lng(),
          placeId: s.place.id || s.placeId,
          area,
          city,
          state,
          pincode,
          flatNumber,
          buildingName,
        });
      })
      .finally(() => {
        setIsResolving(false);
        // New billing session for the next independent search, matching
        // Google's session-token guidance (one session per search+selection).
        if (placesLibRef.current) {
          sessionTokenRef.current = new placesLibRef.current.AutocompleteSessionToken();
        }
      });
  };

  // ---- Snap the pin to a precise match once flat/building is typed (a
  // vague area search can leave the pin >1km from a specific flat/building
  // typed afterward). Runs on blur (not per-keystroke) to keep this cheap.
  // Deliberately never writes flatNumber/buildingName — those are exactly
  // what the user just typed; only lat/lng/placeId/area/formattedAddress may
  // move, and only when a confident match is within 1km of the current pin. ----
  const trySnapNearby = useCallback(async () => {
    if (!hasLocation || value.lat == null || value.lng == null) return;
    const flat = value.flatNumber?.trim();
    const building = value.buildingName?.trim();
    if (!flat && !building) return;
    const placesLib = placesLibRef.current;
    if (!placesLib?.Place?.searchByText) return;

    const center = { lat: value.lat, lng: value.lng };
    const query = [flat, building, value.area].filter(Boolean).join(', ');

    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: query,
        fields: ['location', 'id', 'formattedAddress', 'addressComponents'],
        locationBias: { center, radius: 1000 },
        maxResultCount: 1,
      });
      const top = places?.[0];
      if (!top?.location) return;

      const found = { lat: top.location.lat(), lng: top.location.lng() };
      if (haversineKm(center, found) > 1) return; // farther than 1km — don't jump the pin on a weak match

      const { area, city, state, pincode } = extractComponentsFromPlace(top.addressComponents);
      onChange({
        ...value,
        area: value.area || area,
        city: city || value.city,
        lat: found.lat,
        lng: found.lng,
        placeId: top.id || value.placeId,
        formattedAddress: top.formattedAddress || value.formattedAddress,
      });
      onResolvedRegion?.({ state, pincode });
      setSearchInput(top.formattedAddress || query);

      if (mapRef.current && markerRef.current) {
        mapRef.current.setCenter(found);
        mapRef.current.setZoom(17);
        markerRef.current.setPosition(found);
      }
    } catch {
      // best-effort — leave the pin where it was
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, onResolvedRegion, hasLocation]);

  // ---- Use my current location ----
  // requestLocation() is the SINGLE entry point for getting GPS location —
  // used both for the auto-trigger on arriving at this step and for the
  // manual "Use my current location" button below. Sharing one function
  // means retry semantics can never silently diverge between "arriving
  // fresh" and "clicking again after a failure": both always show the
  // primer modal and always call getCurrentPosition fresh.
  //
  // Resolves GPS coordinates to an address (backend reverse-geocode, as
  // before) AND fetches a handful of real nearby places (client-side Places
  // Nearby Search, same key as Autocomplete) so the user can pick the
  // actual building/landmark instead of trusting raw GPS precision.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Your browser doesn't support location access — search or drop a pin manually instead.");
      return;
    }
    // Re-entrancy guard: ignore a call that comes in while a previous one is
    // still waiting on the browser's answer (rapid re-clicks, or the
    // StrictMode double-mount the effect above already guards against) —
    // two concurrent getCurrentPosition() calls each drive the same modal
    // state independently, so whichever settles first yanks the modal away
    // while the other's native prompt is still open. Cleared in every
    // terminal branch below (success and every error code).
    if (geoInFlightRef.current) return;
    geoInFlightRef.current = true;
    setLocatingMe(true);

    // Check the SITE's own permission state before ever calling
    // getCurrentPosition or touching the OS-settings guide. This is the
    // one thing getCurrentPosition's error codes can't tell us reliably
    // (see the comment on the error callback below) but
    // navigator.permissions.query CAN: 'denied' here means the browser
    // itself has this origin blocked — no Windows toggle fixes that, and
    // routing it into the "turn on Windows Location Services" guide just
    // has the user flip switches that are already on, with no visible
    // effect and the modal reopening the same guide every retry (looks
    // exactly like "the popup won't go away"). Not all browsers implement
    // this query for 'geolocation' (Safari, older browsers) — fall through
    // to the normal getCurrentPosition flow on any rejection so behavior
    // there is unchanged.
    const proceedToGeolocation = () => {
      setPermPhase('primer');
      setPermModalOpen(true);
      runGetCurrentPosition();
    };

    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (status.state === 'denied') {
            geoInFlightRef.current = false;
            setLocatingMe(false);
            setPermPhase('site-blocked');
            setPermModalOpen(true);
          } else if (status.state === 'granted') {
            // Already granted (a prior "Allow" on this browser/profile) —
            // the browser won't show its own native popup at all this time,
            // so our "click Allow in the popup" primer would just flash on
            // screen and vanish the instant getCurrentPosition resolves.
            // Skip straight to it; the primer is only useful when a real
            // popup is about to appear (the 'prompt' branch below).
            runGetCurrentPosition();
          } else {
            proceedToGeolocation();
          }
        })
        .catch(proceedToGeolocation);
    } else {
      proceedToGeolocation();
    }

    function runGetCurrentPosition() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoInFlightRef.current = false;
        setPermModalOpen(false);
        const { latitude, longitude } = pos.coords;
        reverseGeocode(latitude, longitude)
          .then(async (place) => {
            if (!place) return;
            applyResolvedPlace(place);
            setSearchInput(place.formattedAddress);

            const currentOption: PlaceSuggestion = {
              placeId: place.placeId || 'current-location',
              description: place.formattedAddress,
              resolvedPlace: place,
              isCurrentLocation: true,
            };

            let nearbyOptions: PlaceSuggestion[] = [];
            try {
              const placesLib = placesLibRef.current;
              if (placesLib?.Place?.searchNearby) {
                const { places } = await placesLib.Place.searchNearby({
                  fields: ['displayName', 'location', 'id', 'formattedAddress', 'addressComponents'],
                  locationRestriction: { center: { lat: latitude, lng: longitude }, radius: 150 },
                  rankPreference: placesLib.SearchNearbyRankPreference?.DISTANCE,
                  maxResultCount: 5,
                });
                nearbyOptions = (places || [])
                  .filter((p: any) => p.id !== place.placeId)
                  .map((p: any) => {
                    const { area, city, state, pincode, flatNumber, buildingName } = extractComponentsFromPlace(p.addressComponents);
                    const resolved: ResolvedPlace = {
                      formattedAddress: p.formattedAddress || p.displayName || '',
                      lat: p.location.lat(),
                      lng: p.location.lng(),
                      placeId: p.id,
                      area,
                      city,
                      state,
                      pincode,
                      flatNumber,
                      buildingName,
                    };
                    return {
                      placeId: p.id,
                      description: p.displayName || p.formattedAddress || 'Nearby place',
                      resolvedPlace: resolved,
                    };
                  });
              }
            } catch {
              // best-effort — the current-location option alone is still useful
            }

            setSuggestions([currentOption, ...nearbyOptions]);
            setSuggestionsOpen(true);
          })
          .finally(() => setLocatingMe(false));
      },
      () => {
        geoInFlightRef.current = false;
        setLocatingMe(false);
        // Robust single fallback for every failure mode, on purpose — do
        // NOT silently close the modal on any error path. The three
        // getCurrentPosition error codes (PERMISSION_DENIED,
        // POSITION_UNAVAILABLE, TIMEOUT) are not reliably distinguishable
        // from real-world causes — every failure routes to the same
        // actionable 5-step Windows Settings guide.
        setPermPhase('os-settings-guide');
      },
      // No `timeout` — deliberately omitted (defaults to Infinity). Never
      // time-box a wait on a human's own permission decision.
      { enableHighAccuracy: true }
    );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyResolvedPlace]);

  const handleUseMyLocation = () => requestLocation();

  // ---- Auto-request location on arriving at this step ----
  // Only if no location is resolved yet — a user who goes Back and returns
  // to this step with an already-confirmed pin should not be re-prompted.
  // Runs once on mount only — the component remounts fresh every time the
  // parent switches back to this step, so "on mount" already means "on
  // arriving at this page".
  //
  // The autoRequestedRef guard is load-bearing, not decorative: React 18
  // StrictMode deliberately mount→cleanup→remounts every component once in
  // dev, which without this guard fired TWO concurrent getCurrentPosition()
  // calls on every arrival — see AddressLocationPicker.tsx's original
  // comment in freight-compare-frontend for the full symptom trace.
  useEffect(() => {
    if (autoRequestedRef.current) return;
    autoRequestedRef.current = true;
    if (!hasLocation && autoRequestLocation) requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            value={searchInput}
            onChange={handleSearchChange}
            onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
            placeholder="Search for your address"
            className="w-full h-[38px] pl-9 pr-9 border border-slate-200 rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 size={16} className="animate-spin text-slate-400" />
            </span>
          )}
        </div>
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.placeId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion(s)}
                className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-amber-50 flex items-start gap-2"
              >
                {s.isCurrentLocation ? (
                  <Navigation size={14} className="mt-0.5 text-amber-500 flex-shrink-0" />
                ) : (
                  <MapPin size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
                )}
                <span>
                  {s.description}
                  {s.isCurrentLocation && (
                    <span className="block text-[10px] text-amber-500 font-semibold">Your current location</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={locatingMe}
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-amber-600 hover:text-amber-800 disabled:opacity-50"
      >
        {locatingMe ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
        Use my current location
      </button>

      <div className="relative w-full h-56 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full" />
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600 bg-white/90 px-3 text-center">
            {mapError}
          </div>
        )}
        {isResolving && (
          <div className="absolute top-2 right-2 bg-white rounded-full shadow px-2 py-1 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Resolving…
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">Tap or drag the pin to fine-tune the exact location.</p>

      {hasLocation && (
        <div className="space-y-2 pt-1 border-t border-slate-100">
          {value.formattedAddress && (
            <p className="text-xs text-slate-500">{value.formattedAddress}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Flat / House No. <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={value.flatNumber}
                onChange={(e) => onChange({ ...value, flatNumber: e.target.value })}
                onBlur={trySnapNearby}
                maxLength={50}
                placeholder="e.g. A-101"
                className="w-full h-[38px] px-3 border border-slate-200 rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Building / Apartment Name
              </label>
              <input
                type="text"
                value={value.buildingName}
                onChange={(e) => onChange({ ...value, buildingName: e.target.value })}
                onBlur={trySnapNearby}
                maxLength={80}
                placeholder="Optional"
                className="w-full h-[38px] px-3 border border-slate-200 rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Area / Locality
              </label>
              <input
                type="text"
                value={value.area}
                onChange={(e) => onChange({ ...value, area: e.target.value })}
                maxLength={80}
                className="w-full h-[38px] px-3 border border-slate-200 rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Landmark
              </label>
              <input
                type="text"
                value={value.landmark}
                onChange={(e) => onChange({ ...value, landmark: e.target.value })}
                maxLength={80}
                placeholder="Optional"
                className="w-full h-[38px] px-3 border border-slate-200 rounded-lg text-[13px] bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
              />
            </div>
          </div>
        </div>
      )}

      <LocationPermissionModal
        open={permModalOpen}
        phase={permPhase}
        onClose={() => setPermModalOpen(false)}
        onRetry={requestLocation}
      />
    </div>
  );
};

export default AddressLocationPicker;
