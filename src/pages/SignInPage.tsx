// src/pages/SignInPage.tsx — transporter login (embedded in the main app's
// /transporter/login via iframe). Same layout and flow as the shipper
// SignInPage in the main app: OTP first (mobile or email, SMS or email code
// works), password as the fallback. Orange stays the transporter accent.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import http from '../lib/http';
import loginImg from "../assets/login-illustration-amber.svg"

type SentTo = { phone: string | null; email: string | null };

const fieldCls = "w-full h-14 flex items-center rounded-xl border border-slate-300 dark:border-[#1d3f5c] bg-white dark:bg-[#0d2438] focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/30 transition";
const inputCls = "h-full w-full min-w-0 bg-transparent px-4 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#5c7c9a] outline-none";

export default function SignInPage() {
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [sentTo, setSentTo] = useState<SentTo | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, loginWithToken } = useAuth();
  const navigate = useNavigate();

  useReportIframeHeight();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const codeStep = mode === 'otp' && !!sentTo;
  const looksLikePhone = /^[\d\s+-]+$/.test(identifier);
  const sentToText = sentTo ? [sentTo.phone, sentTo.email].filter(Boolean).join(' and ') : '';

  const afterLogin = () => {
    toast.success("Login Successful!");
    navigate('/dashboard');
  };

  const goToSignup = () => {
    if (window !== window.parent) {
      window.parent.postMessage({ type: 'navigate_to_signup' }, '*');
    } else {
      navigate('/transporter-signup');
    }
  };

  const goToShipperLogin = () => {
    if (window !== window.parent) {
      window.parent.postMessage({ type: 'navigate_to_shipper_login' }, '*');
    } else {
      navigate('/signin');
    }
  };

  const sendOtp = async () => {
    if (!identifier.trim()) {
      toast.error('Enter your mobile number or email.');
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await http.post('/api/transporter/auth/otp/send', { identifier: identifier.trim() });
      setSentTo(data.sentTo);
      setResendIn(data.resendIn || 30);
      setOtp('');
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'ACCOUNT_NOT_FOUND') {
        toast(data.message || "No account yet. Let's create one.");
        goToSignup();
      } else {
        if (data?.retryAfter) setResendIn(data.retryAfter);
        toast.error(data?.message || "Couldn't reach the server. Check your connection.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (code = otp) => {
    if (code.length < 4 || isLoading) return;
    setIsLoading(true);
    try {
      const { data } = await http.post('/api/transporter/auth/otp/verify', { identifier: identifier.trim(), otp: code });
      if (data?.token) {
        loginWithToken(data.token);
        afterLogin();
      } else {
        toast.error(data?.message || 'Login failed.');
      }
    } catch (err: any) {
      const data = err?.response?.data;
      toast.error(data?.message || "Couldn't reach the server. Check your connection.");
      if (data?.code === 'OTP_EXPIRED' || data?.code === 'OTP_TOO_MANY_ATTEMPTS') {
        setSentTo(null);
        setResendIn(0);
      }
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'otp') {
      if (sentTo) await verifyOtp();
      else await sendOtp();
      return;
    }
    setIsLoading(true);
    try {
      const response = await login(identifier.trim(), password);
      if (response.success) {
        afterLogin();
      } else {
        toast.error(response.error ?? "Something went wrong during login.");
      }
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === 'otp' ? 'password' : 'otp'));
    setSentTo(null);
    setOtp('');
  };

  return (
    // min-h-screen + the bg color here matters because this renders inside
    // an iframe sized by the HOST to the viewport, not to this page's own
    // (shorter) content height — otherwise the leftover area falls through
    // to the browser's plain white default.
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

      {/* Right Column: Sign In Form */}
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

          <h1 className="mt-8 text-2xl font-bold text-slate-900 dark:text-white">
            {codeStep ? 'Enter the code' : 'Log in'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">
            {codeStep ? (
              <>
                Sent to {sentToText}.{' '}
                <button type="button" onClick={() => { setSentTo(null); setOtp(''); }} className="font-semibold text-orange-600 dark:text-orange-400">
                  Change
                </button>
              </>
            ) : mode === 'otp' ? "We'll send you a one-time code." : 'Log in with your password.'}
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleSubmit} noValidate>
            {codeStep ? (
              <input id="otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                aria-label="One-time code"
                disabled={isLoading}
                className={`${fieldCls} px-4 text-center text-2xl font-semibold tracking-[0.5em] placeholder:tracking-[0.5em] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none`}
                placeholder="------" value={otp}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(v);
                  if (v.length === 6) verifyOtp(v);
                }}
              />
            ) : (
              <div className={fieldCls}>
                {looksLikePhone && identifier.trim() && (
                  <span className="pl-4 text-base font-medium text-slate-500 dark:text-[#8fb0cf]">+91</span>
                )}
                <input id="identifier" name="username" type="text" autoComplete="username" required disabled={isLoading}
                  aria-label="Mobile number or email"
                  className={inputCls}
                  placeholder="Mobile number or email" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
            )}

            {mode === 'password' && (
              <div className={fieldCls}>
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required disabled={isLoading}
                  aria-label="Password"
                  className={inputCls}
                  placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(!showPassword)} disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="px-4 text-slate-400 dark:text-[#5c7c9a]">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            )}

            <button type="submit" disabled={isLoading || (codeStep && otp.length < 6)}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-base font-semibold text-white bg-orange-500 active:bg-orange-600 disabled:bg-orange-300"
            >
              {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
              {mode === 'password' ? 'Log in' : codeStep ? 'Verify' : 'Get OTP'}
            </button>
          </form>

          {codeStep ? (
            <p className="mt-4 text-center text-sm">
              {resendIn > 0 ? (
                <span className="text-slate-400 dark:text-[#6f93b8]">Resend code in {resendIn}s</span>
              ) : (
                <button type="button" onClick={sendOtp} disabled={isLoading} className="font-semibold text-orange-600 dark:text-orange-400">
                  Resend code
                </button>
              )}
            </p>
          ) : (
            <p className="mt-4 text-center text-sm font-medium">
              <button type="button" onClick={switchMode} disabled={isLoading} className="text-orange-600 dark:text-orange-400">
                {mode === 'otp' ? 'Use password' : 'Use OTP instead'}
              </button>
            </p>
          )}

          <p className="mt-10 text-center text-sm text-slate-500 dark:text-[#8fb0cf]">
            New here?{' '}
            <button
              type="button"
              onClick={goToSignup}
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
