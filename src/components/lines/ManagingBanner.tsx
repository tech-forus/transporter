// Shown while the organisation owner is working on a courier line's rates ("Manage rates", a 30-minute session as that
// courier). One tap returns to the owner's own session.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../../config/apiConfig';
import { useAuth } from '../../hooks/useAuth';

export default function ManagingBanner() {
  const { user, loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!user?.actingFor) return null;

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
    <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-xs font-bold text-white">
      <span>You are managing rates for {user.companyName} on behalf of your organisation. This session ends in 30 minutes.</span>
      <button type="button" disabled={busy} onClick={back} className="rounded-lg bg-white/90 px-3 py-1 text-amber-800 disabled:opacity-60">Back to organisation</button>
    </div>
  );
}
