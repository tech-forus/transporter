// The organisation owner's dashboard: every courier's bookings by stage, what is stuck, and with whom.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/apiConfig';

type Stage = 'pendingAccept' | 'awaitingLr' | 'inTransit' | 'awaitingPod' | 'done' | 'closed';
interface Data {
  counts: Record<Stage, number>;
  stuck: { bookingId: string; bookingCode: string; line: string; stage: Stage; sinceMs: number; operator: string }[];
  byLine: { lineId: string; courier: string; counts: Record<Stage, number> }[];
  byPerson: { phone: string; name: string }[];
}

export const STAGE_LABEL: Record<Stage, string> = {
  pendingAccept: 'Waiting to accept', awaitingLr: 'Waiting for AWB', inTransit: 'In transit', awaitingPod: 'Waiting for POD', done: 'Done', closed: 'Declined / cancelled',
};
const TILES: Stage[] = ['pendingAccept', 'awaitingLr', 'inTransit', 'awaitingPod', 'done'];
const TONE: Record<Stage, string> = { pendingAccept: 'text-amber-700', awaitingLr: 'text-amber-700', inTransit: 'text-blue-700', awaitingPod: 'text-amber-700', done: 'text-emerald-700', closed: 'text-slate-500' };
const hours = (ms: number) => { const h = Math.round(ms / 3600000); return h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`; };
const sel = 'px-3 py-1.5 text-xs border border-slate-200 dark:border-[#1d3f5c] rounded-lg bg-white dark:bg-[#0b1b2b]';

// `onOpenByLine`: bookings still open (not done / declined) per courier, reported whenever the unfiltered view loads.
// `silent`: only report the counts, show nothing (the Courier lines screen needs the numbers, the Dashboard shows the tiles).
export default function OrgDashboard({ onOpenByLine, silent = false }: { onOpenByLine?: (open: Record<string, number>) => void; silent?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [line, setLine] = useState('');
  const [person, setPerson] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams();
    if (line) q.set('line', line);
    if (person) q.set('person', person);
    axios.get(`${API_BASE_URL}/api/transporter/lines/dashboard${q.toString() ? `?${q}` : ''}`)
      .then((r) => {
        setData(r.data); setFailed(false);
        if (!line && !person && onOpenByLine) {
          onOpenByLine(Object.fromEntries((r.data.byLine || []).map((l: Data['byLine'][number]) =>
            [l.lineId, (['pendingAccept', 'awaitingLr', 'inTransit', 'awaitingPod'] as Stage[]).reduce((n, s) => n + (l.counts?.[s] || 0), 0)])));
        }
      })
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, person]);

  if (silent) return null;
  if (failed) return <p className="text-xs text-red-600">Could not load the dashboard.</p>;
  if (!data) return null;
  // Only what has something to show: a stage with no bookings gets no tile, and nothing stuck means no "stuck" box.
  // With no bookings at all (and no filter chosen) the whole section is left out.
  const tiles = TILES.filter((s) => (data.counts[s] ?? 0) > 0);
  const filtered = !!(line || person);
  if (!filtered && tiles.length === 0 && data.stuck.length === 0) return null;
  return (
    <section aria-label="Organisation dashboard" className="space-y-2 min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        {tiles.map((s) => (
          <div key={s} data-tile className="flex items-baseline gap-2 rounded-lg border border-slate-200 border-t-2 border-t-violet-600 bg-white px-3 py-1.5 dark:border-[#1d3f5c] dark:bg-[#0d2438]">
            <span className="text-[11px] font-bold text-slate-500">{STAGE_LABEL[s]}</span>
            <span className={`text-base font-extrabold ${TONE[s]}`}>{data.counts[s] ?? 0}</span>
          </div>
        ))}
        {tiles.length === 0 && <span className="text-xs text-slate-500">No bookings for this selection.</span>}
        <span className="mr-auto" />
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
      {data.stuck.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-[#1d3f5c]">
          <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-widest text-amber-700">Stuck</p>
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
        </div>
      )}
    </section>
  );
}
