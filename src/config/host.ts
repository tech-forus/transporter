// Which page is hosting this portal. One portal build is served to both the FreightCompare website and the
// Android app (both embed it in an iframe), so every web-vs-app difference must branch on HOST, nowhere else.
//   'app'        embedded in the Android app: the app passes ?host=app (preferred, kept for the session);
//                until the app ships that, its host origin (Capacitor serves from https://localhost) identifies it
//   'web'        embedded in freightcompare.ai (or the local website)
//   'standalone' opened directly, not embedded
//
// ── FOR THE ANDROID APP (freight-compare-frontend, branch android-app) ─────────────────────────────────────
// Today the app is recognised only by its host origin (Capacitor serves the app from https://localhost, so that is
// the referrer of these iframes). That breaks if the app's Capacitor server config ever changes (server.hostname,
// androidScheme 'http', live-reload server.url) or a no-referrer policy is added: the app would then get website
// behaviour, e.g. no bottom nav bar. To make it explicit, in the next app release:
//   1. src/context/TransporterFrameContext.tsx: append ?host=app to both URLs in TRANSPORTER_SIGNIN_URL, and set the
//      <iframe> allow="clipboard-write; camera; geolocation" (camera = KYC live selfie, geolocation = office location).
//   2. src/pages/TransporterSignupPage.tsx: `?new_session=1` -> `?new_session=1&host=app` and
//      `?resume=${Date.now()}` -> `?resume=${Date.now()}&host=app`; same allow= change on its <iframe>.
//   3. android/app/src/main/AndroidManifest.xml: add <uses-permission android:name="android.permission.CAMERA" />.
// Check on a phone: bottom bar shows (also after killing and reopening the app), KYC selfie opens the camera.
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
