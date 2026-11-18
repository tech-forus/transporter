// src/components/KycGate.tsx
import { useCallback, useEffect, useState, PropsWithChildren } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';
import KycWizardCard from './KycWizardCard';
import { useAuth } from '../hooks/useAuth';

type KycCheck = 'loading' | 'pass' | 'block' | 'error';

// Wraps just the page content of the private routes that require completed
// KYC (Header/Footer live outside, in MainLayout, so they stay visible and
// usable — only the page itself blurs). Always re-checks the backend rather
// than trusting the JWT's kycStatus hint, since admin review can flip status
// without the transporter logging in again. Fails closed: a network/auth
// error blocks access rather than silently letting the user through — see
// docs/superpowers/specs/2026-09-22-transporter-kyc-design.md "Error Handling".
axios.defaults.withCredentials = true;

const KycGateInner: React.FC<PropsWithChildren> = ({ children }) => {
  const [check, setCheck] = useState<KycCheck>('loading');

  // `cancelled` guards only the mount-time call below (its cleanup can fire
  // mid-request on unmount); the re-check triggered from onComplete has no
  // such cleanup path since it's a user-initiated one-off, so it skips the
  // guard entirely rather than threading a ref through for no benefit.
  const checkStatus = useCallback((isCancelled?: () => boolean) => {
    return axios
      .get(`${API_BASE_URL}/api/transporter/kyc/status`, { timeout: 20000 })
      .then(({ data }) => {
        if (isCancelled?.()) return;
        const passable = data?.kycStatus === 'submitted' || data?.kycStatus === 'verified' || data?.kycStatus === 'exempt';
        setCheck(passable ? 'pass' : 'block');
      })
      .catch((err) => {
        if (isCancelled?.()) return;
        // Still fails closed, but a dropped connection or timeout is not "your KYC is missing": show a retry
        // instead of the upload wizard over a blurred page (looked like a frozen app on weak mobile data).
        // An auth/server answer (any HTTP status) keeps the old behaviour.
        setCheck(err?.response ? 'block' : 'error');
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkStatus(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [checkStatus]);

  if (check === 'loading') {
    return <div className="text-center mt-20 text-gray-600">Loading...</div>;
  }

  if (check === 'error') {
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#1d3f5c] dark:bg-[#0d2438]">
        <p className="font-semibold text-slate-800 dark:text-white">Couldn't connect</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">Check your internet and try again.</p>
        <button
          type="button"
          onClick={() => { setCheck('loading'); checkStatus(); }}
          className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (check === 'block') {
    // The page renders normally underneath (data still loads), but is
    // blurred and inert — the wizard overlay is what the transporter can
    // actually interact with until they clear the gate.
    return (
      <div className="relative min-h-[60vh]">
        <div className="pointer-events-none select-none blur-sm" aria-hidden="true">
          {children}
        </div>
        {/* Website: pinned near the top and centered horizontally. Vertical centering over a tall dashboard put the
            card half a page down; top-aligned it is in view on arrival, and a taller card only grows downward, so the
            page (and the host iframe, which sizes to it) grows to fit instead of cutting off the top. The app keeps
            its original centering. */}
        {/* The app is top-aligned too since 2026-11-18: centred over a tall page, the card could sit off-screen,
            leaving only the blurred, untappable page in view. */}
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] flex p-4 z-40 items-start justify-center pt-6">
          <div className="flex justify-center w-full">
            <KycWizardCard onComplete={() => { setCheck('loading'); checkStatus(); }} />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// KYC is the owner's job (their documents stay hidden from a team member), so a team member goes straight through.
const KycGate: React.FC<PropsWithChildren> = ({ children }) => {
  const { user } = useAuth();
  return user?.role === 'employee' ? <>{children}</> : <KycGateInner>{children}</KycGateInner>;
};

export default KycGate;
