import { useEffect } from "react";
import { IS_VIEWPORT_FRAME, IS_WEB } from "../config/host";

// App only: the iframe's height when the portal first booted inside this app session. Older app builds start the
// iframe at the visible area under their header (innerHeight - 64), so it is the smallest height that still keeps
// the fixed bottom bar at the bottom of the screen.
const APP_BASE_KEY = "fc_portal_base_vh";
const appBaseHeight = (): number => {
  try {
    const saved = Number(sessionStorage.getItem(APP_BASE_KEY));
    if (saved > 0) return saved;
    const h = window.innerHeight;
    sessionStorage.setItem(APP_BASE_KEY, String(h));
    return h;
  } catch {
    return window.innerHeight;
  }
};
if (typeof window !== "undefined" && window.parent !== window && !IS_WEB && !IS_VIEWPORT_FRAME) appBaseHeight();

// When embedded in the FreightCompare parent iframe, report our actual content
// height so the parent can size the iframe to fit it exactly. Without this, the
// iframe keeps whatever height it last had (e.g. from a shorter previous step/page),
// and taller content gets clipped — which shows up as the parent site's own footer
// appearing to overlap/cut off the bottom of the page. Call this once per page
// component, with deps covering anything that changes that page's rendered height
// (step index, loaded data, etc).
export function useReportIframeHeight(deps: React.DependencyList = [], enabled = true) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Screen-sized app iframe: it scrolls itself, so its height must never follow the content.
    if (window.parent === window || !enabled || IS_VIEWPORT_FRAME) return;
    // Safety cap: a page whose root uses min-h-screen (100vh) can enter a
    // runaway feedback loop with the parent's resize handling — the iframe's
    // OWN rendered height IS its internal 100vh, so any reported height that
    // exceeds the page's real content clears more vh next layout, which
    // grows scrollHeight again, indefinitely. Confirmed live 2026-09-22:
    // Dashboard.tsx hit 350,000+px within ~90 seconds before this cap
    // existed. No real page here is anywhere near this tall — this is a
    // circuit breaker, not a normal operating value.
    // Embedded web pages can't scroll themselves (index.css), so this must stay above any real page or the
    // bottom gets cut off; a runaway loop still stops here.
    const MAX_REPORTABLE_HEIGHT = 20000;
    // Measure the app root, not <html>: <html>'s scrollHeight is never less than the iframe's current height,
    // so after a taller page the iframe could only grow, leaving a big empty gap above the host footer.
    // Older app builds (no viewport frame) measure the root too, so the iframe shrinks back after a tall page
    // (Profile -> Dashboard showed a blank screen), but never below the boot height, which keeps the fixed
    // bottom bar at the bottom of the screen on short pages.
    const root = document.getElementById("root") || document.documentElement;
    const floor = IS_WEB ? 0 : appBaseHeight();
    const postHeight = () => {
      const height = Math.min(Math.max(root.scrollHeight, floor), MAX_REPORTABLE_HEIGHT);
      window.parent.postMessage({ type: "resize_iframe", height }, "*");
    };
    postHeight();
    const observer = new ResizeObserver(postHeight);
    observer.observe(root);
    window.addEventListener("resize", postHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", postHeight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
}
