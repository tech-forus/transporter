import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, FileText, PackageCheck, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

interface EventRow { id: string; type: string; at: string; bookingId: string; bookingCode: string; text: string }

const ICON: Record<string, React.ReactNode> = {
  new: <PackageCheck size={16} />,
  cancelled: <XCircle size={16} />,
  pod_issue: <AlertTriangle size={16} />,
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Everything shippers did on this transporter's bookings in the last 14 days. A row opens that booking on the dashboard.
const NotificationsPage: React.FC = () => {
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/bookings/transporter-events`)
      .then((r) => setRows(r.data?.events || []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-4 pb-24 sm:px-6 lg:px-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white"><Bell size={22} className="text-blue-600" /> Notifications</h1>
      <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-[#8fb0cf]">What shippers did on your bookings in the last 14 days. Click a row to open that booking.</p>
      {rows === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 dark:border-[#1d3f5c] py-10 text-center text-sm text-slate-500">Nothing in the last 14 days. <Link to="/dashboard" className="font-semibold text-blue-600">Back to dashboard</Link></p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-white/5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#8fb0cf]">
                <th className="border border-slate-200 dark:border-[#1d3f5c] px-3 py-2">When</th>
                <th className="border border-slate-200 dark:border-[#1d3f5c] px-3 py-2">Booking</th>
                <th className="border border-slate-200 dark:border-[#1d3f5c] px-3 py-2">What happened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id} onClick={() => navigate(`/dashboard?booking=${e.bookingId}`)} className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-white/5 ${i % 2 ? 'bg-slate-50/60 dark:bg-white/[0.03]' : 'bg-white dark:bg-[#0d2438]'}`}>
                  <td className="border border-slate-200 dark:border-[#1d3f5c] px-3 py-2 whitespace-nowrap text-xs text-slate-500">{when(e.at)}</td>
                  <td className="border border-slate-200 dark:border-[#1d3f5c] px-3 py-2 whitespace-nowrap font-bold text-slate-900 dark:text-white">{e.bookingCode}</td>
                  <td className="border border-slate-200 dark:border-[#1d3f5c] px-3 py-2 text-slate-700 dark:text-[#c9dbec]"><span className="mr-2 inline-block align-middle text-blue-600">{ICON[e.type] || <FileText size={16} />}</span>{e.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
