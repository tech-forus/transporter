import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import { useAuth } from '../hooks/useAuth';

axios.defaults.withCredentials = true;

// Soft nudge for pre-existing ('exempt') accounts — never blocks, just
// reminds. Dismissed for the current browser tab session only (sessionStorage),
// reappears next visit, per the "soft nudge, not blocking" decision in
// docs/superpowers/specs/2026-09-22-transporter-kyc-design.md.
const DISMISS_KEY = 'kyc_nudge_dismissed';

const KycNudgeBanner: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

    let cancelled = false;
    axios
      .get(`${API_BASE_URL}/api/transporter/kyc/status`)
      .then(({ data }) => {
        if (!cancelled && data?.kycStatus === 'exempt') setVisible(true);
      })
      .catch(() => {
        // Non-fatal — a failed fetch here just means no banner this load.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!visible) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
      <span>
        Please complete your KYC (Aadhaar, business photo, vehicle RC, driver DL) to keep full access to your account.{' '}
        <Link to="/transporter-kyc" className="font-semibold underline underline-offset-2">
          Complete now
        </Link>
      </span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, '1');
          setVisible(false);
        }}
        className="text-amber-500 hover:text-amber-700 flex-none"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default KycNudgeBanner;
