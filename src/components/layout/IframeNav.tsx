// src/components/layout/IframeNav.tsx
//
// MainLayout renders NO Header/Footer at all when this app is embedded in
// the FreightCompare host's iframe (to avoid a double header) — which left
// zero way to navigate between Dashboard/Profile or sign out once inside,
// since every other nav path (Header's avatar dropdown, hamburger menu)
// only exists in the non-iframe branch. Reported live 2026-09-22 as "no
// bottom navigation... no settings/profile". This is the minimal iframe-safe
// replacement: Dashboard, Profile, and a "More" sheet instead of a
// header (there's no room for one — the host's own header already sits
// above this iframe).
//
// The third tab is deliberately NOT a direct Sign Out button — explicit
// ask (2026-09-22): a single tap next to two navigation tabs is too easy to
// hit by accident, and it's the only place in the app for anything else
// that isn't Dashboard/Profile. Same pattern as Instagram's own bottom-bar
// "More" sheet: a few real destinations, Sign Out last and visually
// separated, not the first/only thing offered.
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, User as UserIcon, MoreHorizontal, ShieldCheck, LogOut, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const IframeNav: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isAuthenticated) return null;

  const handleSignOut = () => {
    setMoreOpen(false);
    logout();
    navigate('/transporter-signin');
  };

  const goTo = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  // Same shape as the native app's own MobileTabBar.tsx — amber active
  // color, filled pill behind the active icon — so this reads as the same
  // app, not a visually distinct sub-product bolted on the side.
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors ${
      isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-[#6f93b8]'
    }`;

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-[#0d2438] border-t border-slate-100 dark:border-[#1d3f5c] flex items-stretch shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
        <NavLink to="/dashboard" className={linkCls}>
          {({ isActive }) => (
            <>
              <span className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors ${isActive ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                <LayoutDashboard size={20} strokeWidth={isActive ? 2.5 : 2} />
              </span>
              Dashboard
            </>
          )}
        </NavLink>
        <NavLink to="/profile" className={linkCls}>
          {({ isActive }) => (
            <>
              <span className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors ${isActive ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                <UserIcon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </span>
              Profile
            </>
          )}
        </NavLink>
        <button onClick={() => setMoreOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-slate-400 dark:text-[#6f93b8]">
          <span className="flex items-center justify-center w-9 h-7 rounded-full">
            <MoreHorizontal size={20} />
          </span>
          More
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 inset-x-0 bg-white dark:bg-[#0d2438] rounded-t-2xl p-4 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-[#1d3f5c]" />
              </div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">More</h3>
                <button onClick={() => setMoreOpen(false)} className="p-1 text-slate-400 dark:text-[#6f93b8]" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <button
                onClick={() => goTo('/addprice')}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl"
              >
                <ShieldCheck size={18} className="text-amber-600" /> Price & zone config
              </button>
              <hr className="my-2 border-slate-100 dark:border-[#1d3f5c]" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl"
              >
                <LogOut size={18} /> Sign Out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default IframeNav;
