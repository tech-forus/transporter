// Which page is hosting this portal. One portal build is served to both the FreightCompare website and the
// Android app (both embed it in an iframe), so every web-vs-app difference must branch on HOST, nowhere else.
//   'app'        embedded in the Android app: the app passes ?host=app (preferred, kept for the session);
//                until the app ships that, its host origin (Capacitor serves from https://localhost) identifies it
//   'web'        embedded in freightcompare.ai (or the local website)
//   'standalone' opened directly, not embedded
//
// ── ANDROID APP (freight-compare-frontend, branch android-app) ─────────────────────────────────────────────
// DONE in Fleet vc8 / android-app db47571 (2026-11-18): the login/dashboard iframe (TransporterFrameContext) loads
// ?host=app&frame=viewport, is named 'fc-portal-viewport', is sized to the screen and scrolls itself, and both
// portal iframes have allow="clipboard-write; camera; geolocation". The signup iframe (TransporterSignupPage) is
// still content-height (no frame=viewport). CAMERA is in the merged manifest (from a plugin).
// Older app builds have none of this: they are detected by the https://localhost referrer and get the
// content-height fallbacks (root-height reporting with a boot-height floor, on-screen popups via useModalIframePin).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Rule: this portal is shared by the website and the app; any web-vs-app difference uses HOST / IS_WEB below,
// never a new check elsewhere. Tag PRs web-only / app-only / shared.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Host = 'app' | 'web' | 'standalone';

const detectHost = (): Host => {
  if (typeof window === 'undefined' || window.self === window.top) return 'standalone';
  try {
    const param = new URLSearchParams(window.location.search).get('host');
    if (param) sessionStorage.setItem('fc_portal_host', param);
    if ((param || sessionStorage.getItem('fc_portal_host')) === 'app') return 'app';
  } catch { /* storage unavailable: fall through to the origin check */ }
  try {
    const origin = document.referrer ? new URL(document.referrer).origin : '';
    if (origin === 'https://localhost' || origin === 'capacitor://localhost') {
      // Remember it: a later full reload inside the iframe would have the portal itself as referrer.
      try { sessionStorage.setItem('fc_portal_host', 'app'); } catch { /* storage unavailable */ }
      return 'app';
    }
  } catch { /* unparsable referrer: treat as web */ }
  return 'web';
};

export const HOST: Host = detectHost();
// Web-only behaviour: the website and the standalone portal. The app keeps its existing behaviour.
export const IS_WEB = HOST !== 'app';

// App only (Fleet vc8+, 2026-11-18): the host sizes this iframe to the visible screen and lets it scroll inside,
// instead of growing it to the page height. Then position:fixed (bottom bar, popups) is relative to the screen, as
// on a normal page. Older app builds grow the iframe to the content, so a fixed popup could open off-screen behind
// its blurred backdrop and the iframe never shrank after a tall page (blank Dashboard after Profile).
// The host opts in with ?frame=viewport and names the iframe 'fc-portal-viewport'. window.name survives full
// reloads inside that iframe and is NOT shared with the app's other (signup) iframe, unlike sessionStorage.
const detectViewportFrame = (): boolean => {
  if (HOST !== 'app') return false;
  try {
    if (new URLSearchParams(window.location.search).get('frame') === 'viewport') return true;
  } catch { /* ignore */ }
  return window.name === 'fc-portal-viewport';
};
export const IS_VIEWPORT_FRAME = detectViewportFrame();
