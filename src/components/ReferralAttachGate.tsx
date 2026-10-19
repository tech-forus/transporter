import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/apiConfig';
import { useAuth } from '../hooks/useAuth';
import { getStoredReferral, clearStoredReferral } from '../utils/referral';

axios.defaults.withCredentials = true;

// After any login: if an invite code is stored, link this account to that shipper.
// New signups are already linked server-side (alreadyLinked=true -> silent). Accounts that
// already existed get the share-or-customize choice.
const ReferralAttachGate: React.FC = () => {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ linkId: string; shipperName: string } | null>(null);

  // A Google signup that hasn't finished its mandatory profile isn't a completed signup yet: wait
  // (the code stays stored) so no link/count/placeholder vendor is created and the choice modal
  // doesn't stack on top of the profile-completion modal. Completing the profile re-issues the JWT,
  // which re-runs this effect.
  const profileIncomplete = (user as any)?.profileComplete === false;

  useEffect(() => {
    const code = getStoredReferral();
    if (!user?._id || !code || profileIncomplete) return;
    axios.post(`${API_BASE_URL}/api/vendor-referral/attach`, { code })
      .then((r) => {
        clearStoredReferral();
        if (!r.data.data.alreadyLinked) setPending({ linkId: r.data.data.linkId, shipperName: r.data.data.shipperName });
      })
      .catch((e) => { if (e?.response?.status === 400) clearStoredReferral(); }); // 409 (profile incomplete) keeps the code
  }, [user?._id, profileIncomplete]);

  if (!pending) return null;

  const choose = async (mode: 'shared' | 'custom') => {
    try {
      await axios.put(`${API_BASE_URL}/api/vendor-referral/links/${pending.linkId}/mode`, { mode });
      const { linkId, shipperName } = pending;
      setPending(null);
      if (mode === 'custom') navigate(`/profile/rates/edit?linkId=${linkId}`);
      else toast.success(`${shipperName} can now see your current rates`);
    } catch { toast.error('Could not save your choice. Try again.'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-black text-slate-900">{pending.shipperName} invited you</h3>
        <p className="mt-1 text-sm text-slate-500">Share the rates you already have on FreightCompare, or set special rates just for them?</p>
        <div className="mt-4 flex flex-col gap-2">
          <button onClick={() => choose('shared')} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Share my current rates</button>
          <button onClick={() => choose('custom')} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Customize rates for {pending.shipperName}</button>
        </div>
      </div>
    </div>
  );
};

export default ReferralAttachGate;
