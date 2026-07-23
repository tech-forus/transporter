import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, Mail } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { useAuth } from '../hooks/useAuth';

// Only the Email OTP field is shown — no separate Phone OTP tab/column.
// Both channels still carry the SAME code under the hood (the page before
// this one sends it to email+phone together via one /send-otp call), so a
// transporter without email access can just use whatever arrived by phone
// call in the email field instead; the copy below tells them that.
export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [email] = useState(() => sessionStorage.getItem('transporter_signup_email') || '');
  const [phone] = useState(() => sessionStorage.getItem('transporter_signup_phone') || '');
  const [emailOtp, setEmailOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendTimer, setResendTimer] = useState(59);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!email && !phone) {
      // Nothing to verify — bounce back rather than show a dead-end screen.
      navigate('/transporter-signup', { replace: true });
      return;
    }
    startCountdown();
    // If only a phone number is on hand (no email — this screen still needs
    // to show *some* code, entered via the email-style field above), this is
    // the first send for this page, so it still needs to be fired here.
    if (!email && phone) sendOtp();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCountdown = () => {
    setResendTimer(59);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // Sends the same OTP to whichever of email/phone are available — used both
  // for the phone-only initial send and for the Resend button, so a resend
  // always refreshes the shared code on every channel at once rather than
  // letting one channel's code go stale while the other's is renewed.
  const sendOtp = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/transporter/auth/send-otp`, { email: email || undefined, phone: phone || undefined });
    } catch (err: any) {
      console.warn('[VerifyOtpPage] OTP send failed:', err?.response?.data?.message || err.message);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendOtp();
      toast.success(email && phone ? 'OTP resent — check your email or phone call.' : email ? 'OTP resent to your email.' : 'OTP resent — check your phone call.');
      startCountdown();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    const otp = emailOtp;
    if (!otp) { toast.error('Please enter the OTP.'); return; }
    setVerifying(true);
    try {
      const payload = email ? { email, otp } : { phone, otp };
      const { data } = await axios.post(`${API_BASE_URL}/api/transporter/auth/verify-otp`, payload);
      if (data.token) {
        loginWithToken(data.token);
        sessionStorage.removeItem('transporter_signup_email');
        sessionStorage.removeItem('transporter_signup_phone');
        toast.success(data.message || 'Verified! Welcome aboard.');
        navigate('/dashboard', { replace: true });
      } else {
        toast.error(data.message || 'Verification failed.');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const bothAvailable = !!email && !!phone;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full mx-auto p-6 bg-white rounded-2xl shadow-lg border border-slate-200/60 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Mail size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Verify Your Account</h2>
            <p className="text-sm text-slate-500">
              A one-time password has been sent to {email || 'your registered email'}.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Email OTP <span className="text-red-500">*</span>
          </label>
          <input
            value={emailOtp}
            onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Enter OTP"
            inputMode="numeric"
            maxLength={8}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {bothAvailable
              ? 'You will also receive a phone call reading out the same code — enter it above if that arrives first.'
              : 'Enter the code you received.'}
          </p>
        </div>

        <div className="text-center">
          {resendTimer > 0 ? (
            <p className="text-xs text-slate-400">Resend OTP in {resendTimer}s</p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 disabled:opacity-50"
            >
              {resending ? 'Resending...' : 'Resend OTP'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
        >
          {verifying ? <><Loader2 className="animate-spin" size={18} /> Verifying...</> : 'Verify & Continue'}
        </button>
      </div>
    </div>
  );
}
