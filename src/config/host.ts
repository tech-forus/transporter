// Which page is hosting this portal. One portal build is served to both the FreightCompare website and the
// Android app (both embed it in an iframe), so every web-vs-app difference must branch on HOST, nowhere else.
//   'app'        embedded in the Android app: the app passes ?host=app (preferred, kept for the session);
//                until the app ships that, its host origin (Capacitor serves from https://localhost) identifies it
//   'web'        embedded in freightcompare.ai (or the local website)
//   'standalone' opened directly, not embedded
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
