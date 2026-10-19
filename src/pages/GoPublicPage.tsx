import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePublicStatus, requestGoPublic } from '../components/GoPublicCard';

const GoPublicPage: React.FC = () => {
  const { status } = usePublicStatus();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try { await requestGoPublic(); toast.success('Submitted for approval'); navigate('/dashboard', { replace: true }); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not submit.'); }
    finally { setBusy(false); }
  };
  const count = status?.shipperCount ?? 0;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-6 md:grid-cols-2">
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white">
        <h1 className="text-2xl font-black">Your account is ready 🎉</h1>
        <p className="mt-3 text-blue-100">
          {count > 0 ? `${count.toLocaleString()}+ shippers` : 'Shippers'} are looking for reliable transporters.
          Right now only the shipper who invited you can see your rates.
        </p>
      </div>
      <div className="flex flex-col justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-black text-slate-900">Want more customers?</h2>
        <p className="text-sm text-slate-500">
          Make your rates public so every shipper can find and book you. You can review or change anything first — changes save instantly.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link to="/profile/rates/edit" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Edit my info first</Link>
          <button onClick={go} disabled={busy || !status?.eligible} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">Go public</button>
          <Link to="/dashboard" className="px-2 py-2 text-sm font-semibold text-slate-400">Maybe later</Link>
        </div>
      </div>
    </div>
  );
};

export default GoPublicPage;
