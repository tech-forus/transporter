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
    const postHeight = () => {
      window.parent.postMessage({ type: "resize_iframe", height: document.documentElement.scrollHeight }, "*");
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
