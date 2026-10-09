import { useEffect } from "react";

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
export function useModalIframePin(isOpen: boolean) {
  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: "pin_iframe_viewport", pinned: isOpen }, "*");
    return () => {
      if (isOpen) window.parent.postMessage({ type: "pin_iframe_viewport", pinned: false }, "*");
    };
  }, [isOpen]);
}
