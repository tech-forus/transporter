// src/components/layout/IframeNav.tsx
//
// MainLayout renders NO Header/Footer at all when this app is embedded in
// the FreightCompare host's iframe (to avoid a double header) — which left
// zero way to navigate between Dashboard/Profile or sign out once inside,
// since every other nav path (Header's avatar dropdown, hamburger menu)
// only exists in the non-iframe branch. Reported live 2026-09-22 as "no
// bottom navigation... no settings/profile". This is the minimal iframe-safe
// replacement: same three destinations Header's own dropdown already has
// (Dashboard, Profile, Sign Out), as a small fixed bottom bar instead of a
// header (there's no room for one — the host's own header already sits
// above this iframe).
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, User as UserIcon, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const IframeNav: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) return null;

  const handleSignOut = () => {
    logout();
    navigate('/transporter-signin');
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition-colors ${
      isActive ? 'text-blue-600' : 'text-slate-400'
    }`;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex items-stretch shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
      <NavLink to="/dashboard" className={linkCls}>
        <LayoutDashboard size={20} />
        Dashboard
      </NavLink>
      <NavLink to="/profile" className={linkCls}>
        <UserIcon size={20} />
        Profile
      </NavLink>
      <button onClick={handleSignOut} className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-slate-400">
        <LogOut size={20} />
        Sign Out
      </button>
    </nav>
  );
};

export default IframeNav;
