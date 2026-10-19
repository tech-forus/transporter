// src/components/KycGate.tsx
import { useCallback, useEffect, useState, PropsWithChildren } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';
import KycWizardCard from './KycWizardCard';

type KycCheck = 'loading' | 'pass' | 'block';

// Wraps just the page content of the private routes that require completed
// KYC (Header/Footer live outside, in MainLayout, so they stay visible and
// usable — only the page itself blurs). Always re-checks the backend rather
// than trusting the JWT's kycStatus hint, since admin review can flip status
// without the transporter logging in again. Fails closed: a network/auth
// error blocks access rather than silently letting the user through — see
// docs/superpowers/specs/2026-09-22-transporter-kyc-design.md "Error Handling".
axios.defaults.withCredentials = true;

const KycGate: React.FC<PropsWithChildren> = ({ children }) => {
  const [check, setCheck] = useState<KycCheck>('loading');

  // `cancelled` guards only the mount-time call below (its cleanup can fire
  // mid-request on unmount); the re-check triggered from onComplete has no
  // such cleanup path since it's a user-initiated one-off, so it skips the
  // guard entirely rather than threading a ref through for no benefit.
  const checkStatus = useCallback((isCancelled?: () => boolean) => {
    return axios
      .get(`${API_BASE_URL}/api/transporter/kyc/status`)
      .then(({ data }) => {
        if (isCancelled?.()) return;
        const passable = data?.kycStatus === 'submitted' || data?.kycStatus === 'verified' || data?.kycStatus === 'exempt';
        setCheck(passable ? 'pass' : 'block');
      })
      .catch(() => {
        if (!isCancelled?.()) setCheck('block');
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

  if (check === 'block') {
    // The page renders normally underneath (data still loads), but is
    // blurred and inert — the wizard overlay is what the transporter can
    // actually interact with until they clear the gate.
    return (
      <div className="relative min-h-[60vh]">
        <div className="pointer-events-none select-none blur-sm" aria-hidden="true">
          {children}
        </div>
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-40">
          <KycWizardCard onComplete={() => { setCheck('loading'); checkStatus(); }} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default KycGate;
