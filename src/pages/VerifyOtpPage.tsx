import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, Mail } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { useAuth } from '../hooks/useAuth';

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [email] = useState(() => sessionStorage.getItem('transporter_signup_email') || '');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendTimer, setResendTimer] = useState(59);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!email) {
      // Nothing to verify — bounce back rather than show a dead-end screen.
      navigate('/transporter-signup', { replace: true });
      return;
    }
    startCountdown();
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

  const handleResend = async () => {
    setResending(true);
    try {
      await axios.post(`${API_BASE_URL}/api/transporter/auth/send-otp`, { email });
      toast.success('OTP resent to your email.');
      startCountdown();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    if (!otp) { toast.error('Please enter the OTP.'); return; }
    setVerifying(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/transporter/auth/verify-otp`, { email, otp });
      if (data.token) {
        loginWithToken(data.token);
        sessionStorage.removeItem('transporter_signup_email');
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full mx-auto p-6 bg-white rounded-2xl shadow-lg border border-slate-200/60 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Mail size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Verify Your Email</h2>
            <p className="text-sm text-slate-500">A one-time password has been sent to {email || 'your registered email'}.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Email OTP <span className="text-red-500">*</span>
          </label>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Enter OTP"
            inputMode="numeric"
            maxLength={8}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
