// src/pages/TransporterLoginPage.tsx

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import loginImg from "../assets/login-illustration-amber.svg"

const fieldCls = "w-full h-14 flex items-center rounded-xl border border-slate-300 dark:border-[#1d3f5c] bg-white dark:bg-[#0d2438] focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/30 transition";

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
    // min-h-screen + the bg color here (not just on the inner column below)
    // matters because this is rendered inside an iframe sized by the HOST to
    // the viewport, not to this page's own (shorter) content height — the
    // leftover iframe area below the form had no background of its own at
    // all, so it fell through to the browser's plain white default.
    <div className="w-full min-h-screen lg:grid lg:grid-cols-2 font-sans bg-white lg:bg-slate-100 dark:bg-[#08141f]">
      {/* Left Column: Branding & Image */}
      <div className="relative hidden lg:flex flex-col items-center justify-center bg-slate-100 dark:bg-[#08141f] p-12">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
          <img
            src={loginImg}
            alt="Login branding illustration"
            className="w-full max-w-lg object-contain"
          />
          <div className="text-center mt-8">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-white">
              Welcome to Your Fleet Hub
            </h2>
            <p className="mt-2 text-slate-600 dark:text-[#8fb0cf]">
              Manage your fleet, track bookings, and grow your business—all in one place.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Right Column: Sign In Form — same layout as the shipper SignInPage
          (main app) so switching Shipper/Transporter doesn't jump: full-width
          switch at the top, one short title, tall rounded fields. Orange
          stays the transporter accent. */}
      <div className="min-h-screen flex justify-center px-6 pt-8 pb-28 sm:pt-16 bg-white lg:bg-slate-100 dark:bg-[#08141f]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 dark:bg-[#0d2438] p-1 text-sm font-semibold">
            <button type="button" onClick={goToShipperLogin} className="rounded-lg py-2 text-slate-500 dark:text-[#8fb0cf]">
              Shipper
            </button>
            <button type="button" className="rounded-lg py-2 bg-white dark:bg-[#1d3f5c] text-slate-900 dark:text-white shadow-sm">
              Transporter
            </button>
          </div>

          <h1 className="mt-8 text-2xl font-bold text-slate-900 dark:text-white">Log in</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">Your transporter account.</p>

          <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
            <div className={fieldCls}>
              <input id="email-address" name="email" type="email" autoComplete="email" required disabled={isLoading}
                aria-label="Email"
                className="h-full w-full min-w-0 bg-transparent px-4 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5c7c9a] outline-none"
                placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* No transporter password-reset flow exists yet, so no "Forgot?" link. */}
            <div className={fieldCls}>
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={isLoading}
                aria-label="Password"
                className="h-full w-full min-w-0 bg-transparent px-4 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5c7c9a] outline-none"
                placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" tabIndex={-1} onClick={() => setShowPassword(!showPassword)} disabled={isLoading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="px-4 text-slate-400 dark:text-[#5c7c9a]">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <button type="submit" disabled={isLoading}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-base font-semibold text-white bg-orange-500 active:bg-orange-600 disabled:bg-orange-300"
            >
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              Log in
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-slate-500 dark:text-[#8fb0cf]">
            New here?{' '}
            <button
              type="button"
              onClick={() => {
                if (window !== window.parent) {
                  window.parent.postMessage({ type: 'navigate_to_signup' }, '*');
                } else {
                  navigate('/transporter-signup');
                }
              }}
              className="font-semibold text-orange-600 dark:text-orange-400 bg-transparent border-none cursor-pointer p-0 inline"
            >
              Create an account
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
