import { useEffect } from "react";

// When embedded in the FreightCompare parent iframe, report our actual content
// height so the parent can size the iframe to fit it exactly. Without this, the
// iframe keeps whatever height it last had (e.g. from a shorter previous step/page),
// and taller content gets clipped — which shows up as the parent site's own footer
// appearing to overlap/cut off the bottom of the page. Call this once per page
// component, with deps covering anything that changes that page's rendered height
// (step index, loaded data, etc).
export function useReportIframeHeight(deps: React.DependencyList = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (window.parent === window) return;
    // Safety cap: a page whose root uses min-h-screen (100vh) can enter a
    // runaway feedback loop with the parent's resize handling — the iframe's
    // OWN rendered height IS its internal 100vh, so any reported height that
    // exceeds the page's real content clears more vh next layout, which
    // grows scrollHeight again, indefinitely. Confirmed live 2026-09-22:
    // Dashboard.tsx hit 350,000+px within ~90 seconds before this cap
    // existed. No real page here is anywhere near this tall — this is a
    // circuit breaker, not a normal operating value.
    const MAX_REPORTABLE_HEIGHT = 4000;
    const postHeight = () => {
      const height = Math.min(document.documentElement.scrollHeight, MAX_REPORTABLE_HEIGHT);
      window.parent.postMessage({ type: "resize_iframe", height }, "*");
    };
    postHeight();
    const observer = new ResizeObserver(postHeight);
    observer.observe(document.documentElement);
    window.addEventListener("resize", postHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", postHeight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
