// transporter-main/src/components/AddressAutosuggest.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Search, Loader2, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';
import { reverseGeocode, type ResolvedPlace } from '../services/geoApi';
import LocationPermissionModal, { type LocationPermissionPhase } from './LocationPermissionModal';

interface Suggestion {
  placeId: string;
  description: string;
  place: any;
}

export interface AddressAutosuggestProps {
  value: string;
  onChange: (text: string) => void;
  onResolve: (place: ResolvedPlace) => void;
  onBlur?: () => void;
  placeholder?: string;
  className: string;
  maxLength?: number;
  disabled?: boolean;
  // Hides the "use my current location" button — pass false for a
  // destination/drop field, where "use my current location" has no sense
  // (you aren't at the drop point). Also means LocationPermissionModal
  // never opens for that field. Default true preserves every existing
  // caller's behavior unchanged.
  showCurrentLocation?: boolean;
}

// Flattens Places JS (New) address components into the same shape
// geoApi.ts's ResolvedPlace uses server-side — mirrors
// AddressLocationPicker.tsx's own extractComponentsFromPlace exactly (kept
// as a separate local copy rather than a shared import, per this plan's
// Global Constraints: AddressLocationPicker.tsx is not touched).
function extractComponentsFromPlace(components: any[] | undefined) {
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
  };
}

const AddressAutosuggest: React.FC<AddressAutosuggestProps> = ({
  value,
  onChange,
  onResolve,
  onBlur,
  placeholder,
  className,
  maxLength,
  disabled,
  showCurrentLocation = true,
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permPhase, setPermPhase] = useState<LocationPermissionPhase>('primer');
  const placesLibRef = useRef<any>(null);
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);
  const geoInFlightRef = useRef(false);
  // Bumped on every keystroke and at the start of every async resolution
  // (suggestion pick, current-location fetch). A resolution only applies
  // its result if this still matches the id it captured at start — guards
  // against a slow fetchFields()/reverseGeocode() call landing AFTER the
  // user has already typed something newer, which would otherwise silently
  // overwrite their input with a stale address (and, per the design spec,
  // hand mismatched lat/lng to the Porter/Wheelseye booking automation).
  const requestIdRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grows the box to fit the address instead of truncating it — runs on
  // every value change, whether from typing, a suggestion pick, or
  // current-location resolving, since all three go through the same `value`
  // prop (a suggestion pick's onChange doesn't fire a native input event, so
  // this can't just live inside handleInputChange).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled) return;
        placesLibRef.current = g.maps.places;
        sessionTokenRef.current = new g.maps.places.AutocompleteSessionToken();
      })
      .catch(() => {
        // Autocomplete just won't offer suggestions — manual typing and
        // current-location (which doesn't need placesLibRef) still work.
      });
    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

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
        const mapped: Suggestion[] = (raw || [])
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    requestIdRef.current += 1; // invalidate any in-flight suggestion/current-location resolution
    onChange(e.target.value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(e.target.value), 300);
  };

  const handleSelectSuggestion = (s: Suggestion) => {
    const myRequestId = ++requestIdRef.current;
    if (debounceRef.current) window.clearTimeout(debounceRef.current); // a pending search must not reopen the dropdown after this pick
    setSuggestionsOpen(false);
    onChange(s.description);
    s.place
      .fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents', 'id'] })
      .then(() => {
        if (requestIdRef.current !== myRequestId) return; // user moved on before this resolved
        const { area, city, state, pincode } = extractComponentsFromPlace(s.place.addressComponents);
        onResolve({
          formattedAddress: s.place.formattedAddress || s.description,
          lat: s.place.location.lat(),
          lng: s.place.location.lng(),
          placeId: s.place.id || s.placeId,
          area,
          city,
          state,
          pincode,
          flatNumber: '',
          buildingName: '',
        });
      })
      .catch(() => {
        // Network blip resolving the picked suggestion's details — the typed
        // description text (set above via onChange) already reflects the
        // pick, so there's nothing left to roll back; just don't surface an
        // unhandled rejection.
      })
      .finally(() => {
        // New billing session for the next independent search, matching
        // Google's session-token guidance — same reasoning as
        // AddressLocationPicker.tsx's identical reset.
        if (placesLibRef.current) {
          sessionTokenRef.current = new placesLibRef.current.AutocompleteSessionToken();
        }
      });
  };

  // Single entry point for "use my current location" — auto-trigger is
  // deliberately NOT built here (unlike AddressLocationPicker's signup-step
  // auto-request): a booking modal popping a permission prompt the instant
  // it opens, before the user asked for it, would be intrusive. Only the
  // button below calls this.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Your browser doesn't support location access — type the address manually instead.");
      return;
    }
    if (geoInFlightRef.current) return;
    geoInFlightRef.current = true;
    setLocatingMe(true);
    const myRequestId = ++requestIdRef.current;

    const runGetCurrentPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geoInFlightRef.current = false;
          setPermModalOpen(false);
          const { latitude, longitude } = pos.coords;
          reverseGeocode(latitude, longitude)
            .then((place) => {
              if (requestIdRef.current !== myRequestId) return; // user typed something newer while this was resolving
              if (!place) {
                toast.error("Couldn't find an address for your location — please type it instead.");
                return;
              }
              onChange(place.formattedAddress);
              onResolve(place);
            })
            .catch(() => {
              if (requestIdRef.current !== myRequestId) return;
              toast.error("Couldn't find an address for your location — please type it instead.");
            })
            .finally(() => setLocatingMe(false));
        },
        () => {
          geoInFlightRef.current = false;
          setLocatingMe(false);
          setPermPhase('os-settings-guide');
          setPermModalOpen(true);
        },
        // No `timeout` — same reasoning as AddressLocationPicker.tsx: never
        // time-box a wait on a human's own permission decision.
        { enableHighAccuracy: true }
      );
    };

    const proceedToGeolocation = () => {
      setPermPhase('primer');
      setPermModalOpen(true);
      runGetCurrentPosition();
    };

    // Site-level-block pre-check (this session's fix to the signup picker,
    // applied here from the start rather than reintroducing the old bug):
    // a genuine site-level 'denied' gets its own message instead of looping
    // through the OS-settings guide.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (status.state === 'denied') {
            geoInFlightRef.current = false;
            setLocatingMe(false);
            setPermPhase('site-blocked');
            setPermModalOpen(true);
          } else if (status.state === 'granted') {
            // Already granted on this browser — no native popup will appear
            // this time, so the "click Allow" primer modal would just flash
            // and vanish for no reason. Skip it and resolve directly; the
            // primer is only useful when a real popup is about to appear
            // (the 'prompt' branch below).
            runGetCurrentPosition();
          } else {
            proceedToGeolocation();
          }
        })
        .catch(proceedToGeolocation);
    } else {
      proceedToGeolocation();
    }
  }, [onChange, onResolve]);

  return (
    <div className="relative">
      {/* Anchors the suggestions dropdown to the box itself (top-full) — kept
          as its own positioning context so the "Use my current location"
          link below can sit in normal document flow after it without
          shifting where the dropdown appears. */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            // A single-line field: Enter shouldn't insert a literal newline
            // (the box only grows because the wrapped TEXT is long, not
            // because the user is composing multiple lines).
            if (e.key === 'Enter') e.preventDefault();
          }}
          onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
          onBlur={() => {
            setTimeout(() => setSuggestionsOpen(false), 150);
            onBlur?.();
          }}
          placeholder={placeholder}
          className={`${className} pl-9 ${isSearching ? 'pr-9' : 'pr-3'} resize-none overflow-hidden leading-snug`}
        />
        {isSearching && (
          <Loader2 size={14} className="absolute right-3 top-2.5 animate-spin text-slate-400" />
        )}
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="absolute z-20 top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.placeId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion(s)}
                className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-indigo-50 flex items-start gap-2"
              >
                <MapPin size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
                <span>{s.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* A labeled link, not a bare icon overlaid on the box — mirrors
          AddressLocationPicker.tsx's already-proven "Use my current
          location" affordance (a plain icon-only button here was reported
          as unclear, and collided visually with wrapped multi-line text
          once the box could grow past one line). */}
      {showCurrentLocation && (
        <button
          type="button"
          onClick={requestLocation}
          disabled={locatingMe || disabled}
          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {locatingMe ? <Loader2 size={12} className="animate-spin" /> : <Navigation size={12} />}
          {locatingMe ? 'Getting your location…' : 'Use my current location'}
        </button>
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

export default AddressAutosuggest;
