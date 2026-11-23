import { useEffect, useState, type CSSProperties } from "react";
import { HOST, IS_VIEWPORT_FRAME } from "../config/host";

// Full-screen modals (fixed inset-0 + flex centering) size themselves against
// THIS document's own viewport. Inside the FreightCompare parent iframe that
// viewport is NOT the physically visible screen — TransporterFrameContext
// (freight-compare-frontend) auto-grows the iframe to match this page's full
// content height (see useReportIframeHeight), so a page taller than one
// screen makes `fixed`/`vh` centering land at the midpoint of the WHOLE page,
// which can be scrolled well out of view on the host. Tell the parent to pin
// the iframe to its real on-screen viewport size while the modal is open, so
// centering matches what the user can actually see; unpin on close so the
// iframe resumes auto-sizing to content.
//
// No app build ever handled pin_iframe_viewport, so in the app the popup opened off-screen behind its blurred
// backdrop (looked frozen; seen 2026-11-17). Older app builds (content-height iframe): the returned style places
// the overlay over the part of this iframe that is actually on screen, measured with an IntersectionObserver
// (for a cross-origin iframe it is clipped to the top-level screen). Spread it into the overlay's style.
// The screen-sized app iframe (IS_VIEWPORT_FRAME) and the website need nothing: {} is returned.
const NEEDS_VISIBLE_BAND = HOST === "app" && !IS_VIEWPORT_FRAME;

export function useModalIframePin(isOpen: boolean): CSSProperties {
  const [band, setBand] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "pin_iframe_viewport", pinned: isOpen }, "*");
    return () => {
      if (isOpen) window.parent.postMessage({ type: "pin_iframe_viewport", pinned: false }, "*");
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !NEEDS_VISIBLE_BAND || typeof IntersectionObserver === "undefined") {
      setBand(null);
      return;
    }
    const target = document.getElementById("root") || document.body;
    const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
    const io = new IntersectionObserver((entries) => {
      const r = entries[entries.length - 1]?.intersectionRect;
      if (r && r.height > 80) setBand({ top: Math.max(0, r.top), height: r.height });
    }, { threshold: thresholds });
    io.observe(target);
    return () => io.disconnect();
  }, [isOpen]);

  if (!band) return {};
  return { top: band.top, height: band.height, bottom: "auto" };
}
