// transporter-main/src/utils/loadGoogleMaps.ts

// Singleton loader for the Google Maps JavaScript API — used to run Places
// Autocomplete client-side in AddressAutosuggest.tsx. Ported verbatim from
// freight-compare-frontend/src/utils/loadGoogleMaps.ts (both apps are Vite,
// same import.meta.env access pattern). No @types/google.maps installed —
// the resolved value is the `google` global object, typed loosely as `any`.
let loadPromise: Promise<any> | null = null;

export function loadGoogleMaps(): Promise<any> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("loadGoogleMaps called outside a browser environment"));
      return;
    }
    if ((window as any).google?.maps?.places) {
      resolve((window as any).google);
      return;
    }

    const apiKey = (import.meta as any).env?.VITE_MAPS_PLATFORM_API_KEY;
    if (!apiKey) {
      reject(new Error("VITE_MAPS_PLATFORM_API_KEY is not set"));
      return;
    }

    const callbackName = "__fc_loadGoogleMapsCallback";
    (window as any)[callbackName] = () => {
      resolve((window as any).google);
      delete (window as any)[callbackName];
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
