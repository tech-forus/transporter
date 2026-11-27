// Shown while the organisation owner is working on a courier line's rates ("Manage rates": a timed session as that courier,
// token `exp`). Warns only in the last 10 minutes; one tap returns to the owner's own session. Unpublished rate edits are kept as a draft.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../../config/apiConfig';
import { useAuth } from '../../hooks/useAuth';

export const timeLeft = (ms: number) => {
  if (ms <= 0) return 'ended';
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export default function ManagingBanner() {
  const { user, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(t); }, []);
  if (!user?.actingFor) return null;

  const left = user.exp ? user.exp * 1000 - now : null;
  const ending = left !== null && left < 10 * 60000;

  const back = async () => {
    setBusy(true);
    try {
      const r = await axios.post(`${API_BASE_URL}/api/transporter/lines/manage-exit`);
      loginWithToken(r.data.token);
      navigate('/lines');
    } catch {
      toast.error('Could not go back. Please sign in again.');
    } finally { setBusy(false); }
  };

  return (
    <div role="status" className={`sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-bold text-white ${ending ? 'bg-red-600' : 'bg-violet-500'}`}>
      <span>
        You are managing rates for {user.companyName} on behalf of your organisation.
        {/* No running countdown (noise). Only the last 10 minutes warn, so an expiry never surprises someone mid-edit. */}
        {left !== null && left <= 0 && <> Session ended. Sign in again; your unpublished changes are kept as a draft.</>}
        {left !== null && left > 0 && ending && <> Session ends in {timeLeft(left)}. Publish your changes soon.</>}
      </span>
      <button type="button" disabled={busy} onClick={back} className="rounded-lg bg-white/90 px-3 py-1 text-violet-800 disabled:opacity-60">Back to organisation</button>
    </div>
  );
}
