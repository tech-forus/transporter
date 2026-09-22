// src/components/layout/MainLayout.tsx
import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer'; // NEW: Import Footer
import IframeNav from './IframeNav';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  // Detect if the app is currently embedded inside an iframe
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;

  if (isIframe) {
    return (
      <div className="min-h-screen bg-transparent w-full">
        {/* pb-14 clears IframeNav's own height (fixed position, so it's
            otherwise not accounted for in document flow / scrollHeight) —
            without it the nav bar sits on top of whatever content happened
            to be at the bottom of the page. */}
        <main className="w-full pb-14">
          {children}
        </main>
        <IframeNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header />
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
      <Footer /> {/* NEW: Add Footer component here */}
    </div>
  );
};

export default MainLayout;