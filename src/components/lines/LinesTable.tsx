// The organisation owner's courier list as one table: a row per courier with everything that decides whether shippers can see
// and book it (pincodes, rates, tracking link, people, open bookings). A row opens into the full LineCard for the details.
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react';
import { API_BASE_URL } from '../../config/apiConfig';
import { useAuth } from '../../hooks/useAuth';
import { hasRatesDraft } from '../../utils/ratesDraft';
import LineCard, { type Line } from './LineCard';
import SetupChecklist from './SetupChecklist';

interface Props {
  lines: Line[];
  openByLine: Record<string, number>;
  onChanged: () => void;
  onSecret: (s: { title: string; email: string; password: string }) => void;
  onReset: (l: Line) => void;
  /** A courier just added: open its row so the setup checklist is the first thing the owner sees. */
  autoOpenId?: string | null;
}

/** What still stops shippers from seeing this courier: they need its pincodes and its rates. */
export const missingFor = (l: Line) => [
  ...(l.coverage.pincodes === 0 ? ['pincodes'] : []),
  ...(l.ratesStatus === 'none' ? ['rates'] : []),
];

const th = 'px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const pill = (tone: string) => `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`;
const GREEN = 'border-emerald-200 bg-emerald-50 text-emerald-700';
const AMBER = 'border-amber-200 bg-amber-50 text-amber-800';
const RED = 'border-red-200 bg-red-50 text-red-700';
const GREY = 'border-slate-200 bg-slate-50 text-slate-500';

export default function LinesTable({ lines, openByLine, onChanged, onSecret, onReset, autoOpenId }: Props) {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(autoOpenId ?? null);
  useEffect(() => { if (autoOpenId) setOpen(autoOpenId); }, [autoOpenId]);
  const [busy, setBusy] = useState<string | null>(null);

  const manageRates = async (l: Line) => {
    setBusy(l._id);
    try {
      const r = await axios.post(`${API_BASE_URL}/api/transporter/lines/${l._id}/manage-token`);
      loginWithToken(r.data.token);
      navigate('/profile/rates');
    } catch (e: any) { toast.error(e?.response?.data?.message || "Could not open this courier's rates."); setBusy(null); }
  };

  if (lines.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No couriers added yet. Add the first one above.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#1d3f5c] bg-white dark:bg-[#0d2438]">
      <table className="w-full min-w-[880px] text-xs">
        <thead className="bg-slate-50 dark:bg-[#0b1b2b]">
          <tr>
            <th className={th} />
            <th className={th}>Courier</th>
            <th className={th}>Status</th>
            <th className={th}>Pincodes</th>
            <th className={th}>Rates</th>
            <th className={th}>Tracking</th>
            <th className={th}>People</th>
            <th className={th}>Open bookings</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const missing = missingFor(l);
            const isOpen = open === l._id;
            return (
              <Fragment key={l._id}>
                <tr className="border-t border-slate-100 dark:border-[#1d3f5c] align-top hover:bg-slate-50/60 dark:hover:bg-[#0b1b2b]">
                  <td className="pl-3 py-3">
                    <button type="button" aria-label={isOpen ? 'Hide details' : 'Show details'} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l._id)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-900 dark:text-white">{l.companyName}</p>
                    <p className="text-[11px] text-slate-500">{l.email}</p>
                  </td>
                  <td className="px-3 py-3">
                    {missing.length > 0
                      ? <><span className={pill(RED)}>● Not live</span><p className="mt-1 text-[11px] text-slate-500">Missing: {missing.join(', ')}</p></>
                      : l.listing === 'invited'
                        ? <><span className={pill(AMBER)}>● Your inviting shipper only</span><p className="mt-1 text-[11px] text-slate-500">Other shippers see it after an admin approves <Link to="/go-public" className="font-bold text-blue-700">going public</Link>.</p></>
                      : l.listing === 'kyc'
                        ? <><span className={pill(AMBER)}>● Waiting for KYC</span><p className="mt-1 text-[11px] text-slate-500">Shown to all shippers once your KYC is verified.</p></>
                        : <span className={pill(GREEN)}>● Live to all shippers</span>}
                    <p className="mt-1 text-[11px] text-slate-400">KYC {String(l.kycStatus || 'not_started').replace('_', ' ')}</p>
                  </td>
                  <td className="px-3 py-3">
                    {l.coverage.pincodes > 0
                      ? <><p className="font-bold text-slate-800 dark:text-white">{l.coverage.pincodes.toLocaleString('en-IN')}</p><p className="text-[11px] text-slate-500">{l.coverage.zones.length} zones</p></>
                      : <span className={pill(RED)}>None</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={pill(l.ratesStatus === 'ok' ? GREEN : l.ratesStatus === 'stale' ? AMBER : RED)}>
                      {l.ratesStatus === 'ok' ? 'Rates OK' : l.ratesStatus === 'stale' ? 'Stale (90+ days)' : 'No rates'}
                    </span>
                    {l.ratesUpdatedAt && l.ratesUpdatedBy && <p className="mt-1 text-[11px] text-slate-500">{day(l.ratesUpdatedAt)} · {l.ratesUpdatedBy.name}</p>}
                    {hasRatesDraft(l._id) && <p className="mt-1"><span className={pill(AMBER)}>Draft not published</span></p>}
                  </td>
                  <td className="px-3 py-3">{l.trackingLink ? <span className={pill(GREEN)}>Set</span> : <span className={pill(GREY)}>Not set</span>}</td>
                  <td className="px-3 py-3 font-bold text-slate-800 dark:text-white">{l.team.length}</td>
                  <td className="px-3 py-3 font-bold text-slate-800 dark:text-white">{openByLine[l._id] ?? 0}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" disabled={busy === l._id} onClick={() => manageRates(l)} className="whitespace-nowrap rounded-lg bg-violet-600 px-3 py-1.5 font-bold text-white hover:bg-violet-700 disabled:opacity-60">Manage rates</button>
                      <button type="button" title={`New password for ${l.email}`} aria-label={`New password for ${l.companyName}`} onClick={() => onReset(l)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><KeyRound size={13} /></button>
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-slate-100 dark:border-[#1d3f5c] bg-slate-50/50 dark:bg-[#0b1b2b]">
                    <td colSpan={9}>
                      <SetupChecklist line={l} busy={busy === l._id} onManageRates={() => manageRates(l)} />
                      <LineCard line={l} onChanged={onChanged} onSecret={onSecret} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
