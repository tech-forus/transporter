// Track a shipment by pasting the AWB / LR number. Tracking is manual (no carrier API): this opens the courier's own tracking
// page. When the courier's page cannot take the number in its address, the number is copied first so it can be pasted there.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Copy, Search } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';

interface LineOpt { _id: string; courier: string }
interface Result { mode: 'deep' | 'home' | 'none'; url: string; courier: string; awb: string; copied?: boolean }

const input = 'w-full px-3 py-2 text-sm border border-slate-200 dark:border-[#1d3f5c] rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#0b1b2b]';

export default function TrackPage() {
  const [awb, setAwb] = useState('');
  const [lines, setLines] = useState<LineOpt[]>([]);
  const [line, setLine] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Only an organisation owner gets a list (and must say which courier); everyone else tracks on their own account.
  useEffect(() => { axios.get(`${API_BASE_URL}/api/transporter/lines`).then((r) => setLines(r.data?.lines || [])).catch(() => setLines([])); }, []);

  const track = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const q = new URLSearchParams({ awb: awb.trim(), ...(line ? { line } : {}) });
      const r = await axios.get(`${API_BASE_URL}/api/transporter/lines/track?${q}`);
      const res: Result = r.data;
      if (res.mode === 'home') {
        try { await navigator.clipboard.writeText(awb.trim()); res.copied = true; } catch { res.copied = false; }
      }
      if (res.url) window.open(res.url, '_blank', 'noopener');
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not look that up.');
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Search size={20} /> Track a shipment</h1>
        <p className="text-xs text-slate-500 dark:text-[#8fb0cf]">Paste the AWB / LR number. We open the courier's own tracking page.</p>
      </div>
      <form onSubmit={track} className="space-y-3">
        {lines.length > 0 && (
          <label className="block text-xs font-bold text-slate-600 dark:text-[#8fb0cf]">Courier
            <select className={input} value={line} onChange={(e) => setLine(e.target.value)} required>
              <option value="">Choose a courier</option>
              {lines.map((l) => <option key={l._id} value={l._id}>{l.courier}</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-bold text-slate-600 dark:text-[#8fb0cf]">AWB / LR number
          <input className={input} value={awb} onChange={(e) => setAwb(e.target.value)} placeholder="e.g. 12345678901" autoComplete="off" required />
        </label>
        <button disabled={busy || awb.trim().length < 3} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Track</button>
      </form>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {result?.mode === 'home' && (
        <p className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-900 flex items-start gap-2">
          <Copy size={16} className="mt-0.5 shrink-0" />
          <span>{result.copied ? `${result.awb} copied.` : `Copy ${result.awb}.`} {result.courier}'s page opened in a new tab: paste the number there.</span>
        </p>
      )}
      {result?.mode === 'none' && (
        <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          There is no tracking link for {result.courier} yet. {lines.length > 0 ? 'Add it on the courier\'s card in Courier lines (one time).' : 'Ask your organisation owner to add it.'}
        </p>
      )}
    </div>
  );
}
