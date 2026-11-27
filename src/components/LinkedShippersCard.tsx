import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/apiConfig';
import SectionCard from './SectionCard';

axios.defaults.withCredentials = true;

interface LinkRow { linkId: string; shipperName: string; rateMode: 'shared' | 'custom'; bookingCount?: number; lastBookingAt?: string | null }

const GRID = 'grid grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-x-3';
const shortDate =(d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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
    <SectionCard title="Shippers you're linked with">
      {/* Shipper · bookings · rates — one plain line each; names wrap instead of being cut off. */}
      <ul className="divide-y divide-slate-100 text-sm dark:divide-[#1d3f5c]">
        {rows.map((r) => (
          <li key={r.linkId} className={`${GRID} items-center py-1.5`}>
            <span className="min-w-0 break-words font-semibold text-slate-700 dark:text-white">{r.shipperName}</span>
            <span className="text-xs text-slate-500 dark:text-[#8fb0cf]">
              {r.bookingCount ? `${r.bookingCount} booking${r.bookingCount === 1 ? '' : 's'}` : 'No bookings'}
              {r.lastBookingAt && <span className="block text-slate-400">last {shortDate(r.lastBookingAt)}</span>}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-x-2 text-xs">
              <span className={r.rateMode === 'custom' ? 'text-amber-600' : 'text-slate-400'}>{r.rateMode === 'custom' ? 'Custom rates' : 'Shared rates'}</span>
              {r.rateMode === 'custom' ? (
                <>
                  <Link className="font-semibold text-slate-500 hover:text-blue-600 dark:text-[#8fb0cf]" to={`/profile/rates/edit?linkId=${r.linkId}`}>Edit</Link>
                  <button className="font-bold text-slate-500" onClick={() => useShared(r.linkId)}>Use shared</button>
                </>
              ) : (
                <Link className="font-semibold text-slate-500 hover:text-blue-600 dark:text-[#8fb0cf]" to={`/profile/rates/edit?linkId=${r.linkId}`}>Customize</Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

export default LinkedShippersCard;
