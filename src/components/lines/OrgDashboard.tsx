// The organisation owner's dashboard: every courier's bookings by stage, what is stuck, and with whom.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/apiConfig';

type Stage = 'pendingAccept' | 'awaitingLr' | 'inTransit' | 'awaitingPod' | 'done' | 'closed';
interface Data {
  counts: Record<Stage, number>;
  stuck: { bookingId: string; bookingCode: string; line: string; stage: Stage; sinceMs: number; operator: string }[];
  byLine: { lineId: string; courier: string }[];
  byPerson: { phone: string; name: string }[];
}

export const STAGE_LABEL: Record<Stage, string> = {
  pendingAccept: 'Waiting to accept', awaitingLr: 'Waiting for AWB', inTransit: 'In transit', awaitingPod: 'Waiting for POD', done: 'Done', closed: 'Declined / cancelled',
};
const TILES: Stage[] = ['pendingAccept', 'awaitingLr', 'inTransit', 'awaitingPod', 'done'];
const TONE: Record<Stage, string> = { pendingAccept: 'text-amber-700', awaitingLr: 'text-amber-700', inTransit: 'text-blue-700', awaitingPod: 'text-amber-700', done: 'text-emerald-700', closed: 'text-slate-500' };
const hours = (ms: number) => { const h = Math.round(ms / 3600000); return h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`; };
const sel = 'px-3 py-1.5 text-xs border border-slate-200 dark:border-[#1d3f5c] rounded-lg bg-white dark:bg-[#0b1b2b]';

export default function OrgDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [line, setLine] = useState('');
  const [person, setPerson] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (line) q.set('line', line);
    if (person) q.set('person', person);
    axios.get(`${API_BASE_URL}/api/transporter/lines/dashboard${q.toString() ? `?${q}` : ''}`)
      .then((r) => { setData(r.data); setFailed(false); })
      .catch(() => setFailed(true));
  }, [line, person]);

  if (failed) return <p className="text-xs text-red-600">Could not load the dashboard.</p>;
  if (!data) return null;
  return (
    <section aria-label="Organisation dashboard" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white mr-auto">Bookings at a glance</h2>
        <label className="text-[11px] font-bold text-slate-500">Courier{' '}
          <select className={sel} value={line} onChange={(e) => setLine(e.target.value)}>
            <option value="">All couriers</option>
            {data.byLine.map((l) => <option key={l.lineId} value={l.lineId}>{l.courier}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold text-slate-500">Person{' '}
          <select className={sel} value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            {data.byPerson.map((p) => <option key={p.phone} value={p.phone}>{p.name || p.phone}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {TILES.map((s) => (
          <div key={s} data-tile className="rounded-xl border border-slate-200 dark:border-[#1d3f5c] p-3">
            <p className="text-[11px] font-bold text-slate-500">{STAGE_LABEL[s]}</p>
            <p className={`text-2xl font-extrabold ${TONE[s]}`}>{data.counts[s] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-[#1d3f5c]">
        <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Stuck</p>
        {data.stuck.length === 0 ? <p className="px-3 pb-3 pt-1 text-xs text-slate-500">Nothing is stuck.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-[#1d3f5c] text-xs">
            {data.stuck.map((s) => (
              <li key={s.bookingId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-mono font-bold">{s.bookingCode}</span>
                <span>{s.line}</span>
                <span className="text-amber-700 font-semibold">{STAGE_LABEL[s.stage]}</span>
                <span className="text-slate-500">{hours(s.sinceMs)}</span>
                {s.operator && <span className="text-slate-500">· {s.operator}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
