import { useEffect } from "react";

// When embedded in the FreightCompare parent app's iframe, this app has no
// idea the host is in dark mode — it's a separate document/origin, so the
// host's `dark` class on its own <html> never reaches in here. Real bug
// (reported live, 2026-09-19): switching to Transporter Login while the
// host app was in night mode showed a fully light-mode form (and an equally
// light-mode "Loading transporter login…" screen on the host side, fixed
// separately in TransporterFrameContext.tsx).
//
// Mirrors useReportIframeHeight's handshake shape: announce readiness to the
// parent immediately (parent may have already applied its theme before this
// iframe finished loading, so we can't just wait passively for a change
// event — we ask), then listen for `fc_theme` messages for live toggles.
export function useEmbeddedTheme() {
  useEffect(() => {
    if (window.parent === window) return; // standalone (not embedded) — nothing to sync to

    const applyTheme = (theme: string) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    };

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'fc_theme' && typeof event.data.theme === 'string') {
        applyTheme(event.data.theme);
      }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: 'transporter_iframe_ready' }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);
}
