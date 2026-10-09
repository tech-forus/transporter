import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

interface LinkRow { linkId: string; shipperName: string; rateMode: 'shared' | 'custom' }

const LinkedShippersCard: React.FC = () => {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const load = useCallback(async () => {
    try { setRows((await axios.get(`${API_BASE_URL}/api/vendor-referral/my-links`)).data.data); }
    catch { /* card stays hidden */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (rows.length === 0) return null;

  const useShared = async (linkId: string) => {
    if (!window.confirm('Switch back to your shared rates? Your custom rates for this shipper will be replaced.')) return;
    try {
      await axios.put(`${API_BASE_URL}/api/vendor-referral/links/${linkId}/mode`, { mode: 'shared' });
      toast.success('Now using your shared rates'); load();
    } catch { toast.error('Could not switch.'); }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-black text-slate-800">Shippers you're linked with</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.linkId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="truncate font-semibold text-slate-700">{r.shipperName}</span>
            <span className="flex items-center gap-2 text-xs">
              <span className={r.rateMode === 'custom' ? 'text-amber-600' : 'text-slate-400'}>{r.rateMode === 'custom' ? 'Custom rates' : 'Shared rates'}</span>
              {r.rateMode === 'custom' ? (
                <>
                  <Link className="font-bold text-blue-600" to={`/profile/rates/edit?linkId=${r.linkId}`}>Edit</Link>
                  <button className="font-bold text-slate-500" onClick={() => useShared(r.linkId)}>Use shared</button>
                </>
              ) : (
                <Link className="font-bold text-blue-600" to={`/profile/rates/edit?linkId=${r.linkId}`}>Customize</Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LinkedShippersCard;
