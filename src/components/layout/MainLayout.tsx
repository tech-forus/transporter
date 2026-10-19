// src/components/layout/MainLayout.tsx
import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer'; // NEW: Import Footer
import TransporterAssistant from '../TransporterAssistant';
import { useAuth } from '../../hooks/useAuth';
import IframeNav from './IframeNav';

interface MainLayoutProps {
  children: ReactNode;
  // Tighter header + top padding for form-heavy pages that must fit one screen
  compact?: boolean;
  // Short pages: content stays at the top but the page fills the first screen, so the
  // footer sits below the fold instead of hugging the content.
  fillScreen?: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, compact, fillScreen }) => {
  const { isAuthenticated } = useAuth();
  // Detect if the app is currently embedded inside an iframe
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  if (isIframe) {
    // No min-h-screen and no extra bottom padding here, deliberately — both
    // were tried and caused a runaway resize loop with useReportIframeHeight
    // (found live 2026-09-22, iframe grew to 350,000+px within ~90s): a
    // page like Dashboard.tsx has its OWN min-h-screen root div, which
    // resolves against the IFRAME's current CSS height (iframes establish
    // their own viewport from their rendered size) — so any fixed height
    // added HERE, outside that div, gets included in the reported
    // scrollHeight, which grows the iframe, which grows 100vh inside
    // Dashboard's own min-h-screen div, which grows scrollHeight again, on
    // and on with no fixed point. Bare children + a plain wrapper is what
    // breaks that loop; IframeNav overlapping the last ~56px of scrollable
    // content in the rare case a page's content runs right to the bottom is
    // a far smaller problem than that.
    return (
      <div className="bg-transparent w-full">
        {children}
        <IframeNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* KycNudgeBanner is intentionally not rendered: KYC applies to NEW transporters only. Existing accounts are
          'exempt' and see no KYC prompt at all. The component is kept (unused) in case a soft nudge is wanted later. */}
      <Header compact={compact} />
      <main className={`flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${compact ? 'py-2' : 'py-8'} w-full ${fillScreen ? 'min-h-[calc(100vh-5rem)]' : ''}`}>
        {children}
      </main>
      {isAuthenticated && <TransporterAssistant />}
      <Footer /> {/* NEW: Add Footer component here */}
    </div>
  );
};

export default MainLayout;