import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink as RouterNavLink } from 'react-router-dom';
import {
  LogIn,
  User as UserIcon,
  LogOut as LogOutIcon,
  Menu,
  X,
  ChevronDown,
  LayoutDashboard,
  Truck,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

// --- Reusable & Styled Components ---
const BrandLogo = () => (
    <Link to="/" className="flex items-center gap-2 flex-shrink-0">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
            <Truck className="w-5 h-5 text-white" />
        </div>
        <h1 className="hidden sm:block text-xl font-bold text-slate-800">Freight Compare</h1>
    </Link>
);

const NavLink: React.FC<{ to: string, children: React.ReactNode }> = ({ to, children }) => (
    <RouterNavLink
      to={to}
      className={({ isActive }) =>
        `text-sm font-medium transition-colors ${
          isActive ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'
        }`
      }
    >
      {children}
    </RouterNavLink>
);

const UserProfileDropdown: React.FC = () => {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    // Fallback if user data structure is unexpected
    const companyName = (user as any)?.companyName || 'Transporter';
    const userEmail = (user as any)?.email || 'email@example.com';
    const userInitial = companyName.charAt(0).toUpperCase();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors">
                <div className="w-9 h-9 bg-slate-200 text-slate-700 rounded-full flex items-center justify-center font-bold text-sm border-2 border-white shadow-sm">{userInitial}</div>
                <span className="hidden lg:inline text-sm font-medium text-slate-700">{companyName}</span>
                <ChevronDown size={16} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -10 }} 
                        transition={{ duration: 0.2, ease: "easeOut" }} 
                        className="absolute top-full right-0 mt-2 w-60 bg-white rounded-lg shadow-2xl border border-slate-100 z-20 overflow-hidden"
                    >
                        <div className="p-2">
                            <div className="px-3 py-2">
                                <p className="text-sm font-semibold text-slate-800">{companyName}</p>
                                <p className="text-xs text-slate-500 truncate">{userEmail}</p>
                            </div>
                            <hr className="my-1 border-slate-100" />
                            <Link to="/dashboard" onClick={() => setIsOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md">
                                <LayoutDashboard size={16} /> Dashboard
                            </Link>
                            <Link to="/profile" onClick={() => setIsOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md">
                                <UserIcon size={16} /> My Profile
                            </Link>
                            <hr className="my-1 border-slate-100" />
                            <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md font-medium">
                                <LogOutIcon size={16} /> Sign Out
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- MOBILE NAVIGATION ---
const MobileNav: React.FC<{ isOpen: boolean; closeMenu: () => void }> = ({ isOpen, closeMenu }) => {
    const { isAuthenticated, logout } = useAuth();
    const handleSignOut = () => { logout(); closeMenu(); };

    const MobileNavLink: React.FC<{ to: string, icon: React.ReactNode, children: React.ReactNode }> = ({ to, icon, children }) => (
      <Link to={to} onClick={closeMenu} className="flex items-center gap-4 p-3 -m-3 text-base font-medium text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">
        <span className="text-blue-600">{icon}</span>
        {children}
      </Link>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={closeMenu}>
                    <motion.div
                        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute top-0 right-0 h-full w-full max-w-xs bg-white p-6 shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                         <div className="flex justify-between items-center mb-10">
                             <BrandLogo/>
                             <button onClick={closeMenu} className="p-2 -m-2 rounded-full hover:bg-slate-100"><X size={24}/></button>
                         </div>
                         <div className="flex flex-col gap-2">
                           {isAuthenticated ? (
                             <>
                               <MobileNavLink to="/dashboard" icon={<LayoutDashboard size={20}/>}>Dashboard</MobileNavLink>
                               <MobileNavLink to="/profile" icon={<UserIcon size={20}/>}>My Profile</MobileNavLink>
                               <div className="pt-8 mt-auto">
                                <button onClick={handleSignOut} className="w-full text-center px-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium">
                                  Sign Out
                                </button>
                               </div>
                             </>
                           ) : (
                             <>
                              <MobileNavLink to="/#features" icon={<LayoutDashboard size={20}/>}>Features</MobileNavLink>
                              <MobileNavLink to="/#pricing" icon={<UserIcon size={20}/>}>Pricing</MobileNavLink>
                               <div className="pt-8 mt-auto border-t border-slate-200">
                                <Link to="/transporter-signin" onClick={closeMenu} className="block w-full text-center px-6 py-3 mb-3 bg-slate-100 text-slate-700 rounded-lg font-medium">Sign In</Link>
                                <Link to="/transporter-signup" onClick={closeMenu} className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium">Get Started</Link>
                               </div>
                             </>
                           )}
                         </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// --- MAIN HEADER COMPONENT ---
const Header: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <>
            <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200/80 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">
                        <BrandLogo />
                        <div className="flex items-center gap-4">
                            {isAuthenticated ? (
                                <UserProfileDropdown />
                            ) : (
                                <>
                                    <div className="hidden sm:flex items-center gap-4">
                                        <NavLink to="/transporter-signin">Sign In</NavLink>
                                        <Link to="/transporter-signup" className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                                            Get Started
                                        </Link>
                                    </div>
                                </>
                            )}
                            <div className="lg:hidden">
                                <button onClick={() => setMenuOpen(true)} className="p-2 -mr-2"><Menu className="h-6 w-6 text-slate-800" /></button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            <MobileNav isOpen={menuOpen} closeMenu={() => setMenuOpen(false)} />
        </>
    );
};

export default Header;