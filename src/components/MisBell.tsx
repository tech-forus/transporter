import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/apiConfig';

type Notice = { caseId: string; title: string; line: string; mine: boolean; at: string };

/**
 * The bell at the top right: one line or two per month's bill saying where it stands and whose turn it is.
 * Hidden until there is a bill to talk about. Refreshes every minute. (The website shows the same bell for a transporter
 * signed in through the embedded portal.)
 */
const MisBell: React.FC = () => {
  const [data, setData] = useState<{ unread: number; notices: Notice[] }>({ unread: 0, notices: [] });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const load = () => axios.get(`${API_BASE_URL}/api/transporter/mis/notices`, { withCredentials: true })
      .then((r) => { if (alive && r.data?.success) setData({ unread: r.data.unread, notices: r.data.notices }); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (!data.notices.length) return null;

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label={`Bills${data.unread ? `, ${data.unread} waiting for you` : ''}`} className="relative p-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
        <Bell size={16} />
        {data.unread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">Monthly bills</div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {data.notices.map((n) => (
              <li key={n.caseId}>
                <button onClick={() => { setOpen(false); navigate(`/mis-bills?case=${n.caseId}`); }} className="w-full text-left px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    {n.mine && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Your turn" />}
                    <span className="text-sm font-bold text-slate-900">{n.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600">{n.line}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MisBell;
