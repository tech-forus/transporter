// src/components/layout/MainLayout.tsx
import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer'; // NEW: Import Footer
import KycNudgeBanner from '../KycNudgeBanner';
import TransporterAssistant from '../TransporterAssistant';
import { useAuth } from '../../hooks/useAuth';

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
    return (
      <div className="min-h-screen bg-transparent w-full">
        <main className="w-full">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <KycNudgeBanner />
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