// src/pages/TransporterLoginPage.tsx

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';
import { Truck, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import loginImg from "../assets/login-illustration-amber.svg"

// Mirrors the shipper SignInPage's BrandLogo, in the transporter's amber theme.
const BrandLogo = () => (
  <div className="flex items-center gap-3 text-2xl font-bold text-slate-800">
    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
      <Truck className="w-6 h-6 text-white" />
    </div>
    <span>Freight Compare</span>
  </div>
);

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  useReportIframeHeight();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await login(email, password);
      if (response.success) {
        toast.success("Login Successful!");
        navigate('/dashboard');
      } else {
        toast.error(response.error ?? "Something went wrong during login.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const goToShipperLogin = () => {
    if (window !== window.parent) {
      window.parent.postMessage({ type: 'navigate_to_shipper_login' }, '*');
    } else {
      navigate('/signin');
    }
  };

  return (
    <div className="w-full lg:grid lg:grid-cols-2 font-sans">
      {/* Left Column: Branding & Image */}
      <div className="relative hidden lg:flex flex-col items-center justify-center bg-slate-100 p-12">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
          <img
            src={loginImg}
            alt="Login branding illustration"
            className="w-full max-w-lg object-contain"
          />
          <div className="text-center mt-8">
            <h2 className="text-3xl font-bold text-slate-800">
              Welcome to Your Fleet Hub
            </h2>
            <p className="mt-2 text-slate-600">
              Manage your fleet, track bookings, and grow your business—all in one place.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Right Column: Sign In Form */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-100">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden mb-8 flex justify-center">
            <BrandLogo />
          </div>

          {/* flex-col on mobile — the nowrap heading + toggle pill together are
              wider than a narrow phone viewport, and since "Transporter" is one
              unbreakable word the pill can't shrink to fit, so it ran off the
              right edge of the screen entirely. Stacked there instead; sm+ keeps
              the original single-row layout where there's room for both. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
            <h1 className="text-2xl font-bold text-slate-900 whitespace-nowrap">Transporter Login</h1>
            {/* Shipper/Transporter switch — faded so it doesn't compete with the
                heading, but still reachable for a shipper who landed here by mistake. */}
            <div className="inline-flex self-start sm:self-auto rounded-lg border border-slate-200 bg-slate-100/70 p-0.5 opacity-70 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={goToShipperLogin}
                className="px-3 py-1 text-xs font-semibold rounded-md text-slate-500 hover:text-slate-700 transition-colors"
              >
                Shipper
              </button>
              <button
                type="button"
                className="px-3 py-1 text-xs font-semibold rounded-md bg-white text-orange-600 shadow-sm"
              >
                Transporter
              </button>
            </div>
          </div>

          {/* Main Form */}
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input id="email-address" name="email" type="email" autoComplete="email" required disabled={isLoading}
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition disabled:bg-slate-200"
                  placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              {/* No /forgot-password route or backend reset-password endpoint
                  exists for transporter accounts yet -- a link here would
                  point at a dead page. Removed rather than shipping a broken
                  promise; add back once a real reset flow exists. */}
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={isLoading}
                  className="w-full pl-10 pr-12 py-2.5 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition disabled:bg-slate-200"
                  placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <motion.button type="submit" disabled={isLoading}
                whileHover={{ scale: isLoading ? 1 : 1.02 }}
                whileTap={{ scale: isLoading ? 1 : 0.98 }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 border border-transparent text-base font-semibold rounded-lg text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:bg-orange-300 disabled:cursor-not-allowed shadow-lg shadow-orange-500/50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Logging In...
                  </>
                ) : 'Login'}
              </motion.button>
            </div>

            <p className="text-center text-sm text-slate-600">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  if (window !== window.parent) {
                    window.parent.postMessage({ type: 'navigate_to_signup' }, '*');
                  } else {
                    navigate('/transporter-signup');
                  }
                }}
                className="font-semibold text-orange-600 hover:text-orange-500 transition-colors bg-transparent border-none cursor-pointer p-0 inline"
              >
                Create one now
              </button>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
