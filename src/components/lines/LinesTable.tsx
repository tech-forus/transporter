// The organisation owner's courier list as one compact table: a row per courier with one status badge and the facts that
// decide whether shippers can book it. Only a missing REQUIRED step gets a filled button; optional steps are quiet links.
// Going public is the organisation's request (an admin's decision applies to every line), so it sits once above the table.
import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { API_BASE_URL } from '../../config/apiConfig';
import { useAuth } from '../../hooks/useAuth';
import { hasRatesDraft } from '../../utils/ratesDraft';
import { usePublicStatus, requestGoPublic, cancelGoPublicRequest } from '../GoPublicCard';
import LineCard, { type Line, type LineFocus } from './LineCard';
import SetupChecklist from './SetupChecklist';

interface Props {
  lines: Line[];
  openByLine: Record<string, number>;
  onChanged: () => void;
  /** A courier just added: open its row so the setup checklist is the first thing the owner sees. */
  autoOpenId?: string | null;
  /** The shipper whose invite brought this organisation in: the only one who sees a private courier. */
  invitedBy?: string | null;
}

/** What still stops shippers from seeing this courier: they need its pincodes and its rates. */
export const missingFor = (l: Line) => [
  ...(l.coverage.pincodes === 0 ? ['pincodes'] : []),
  ...(l.ratesStatus === 'none' ? ['rates'] : []),
];

// A real grid: every cell has a border, so columns read straight down and rows straight across.
const GRID = 'border border-slate-200 dark:border-[#1d3f5c]';
const th = `${GRID} whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500`;
const td = `${GRID} px-3 py-2 align-middle`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
// Colour is spent only on what needs the owner: red = blocks shippers, amber = needs attention soon. A healthy state is plain
// text with a small dot, so the eye lands on problems and on the one filled button.
const dot = (c: string) => <span className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${c}`} />;
const state = (text: string, c: string, tone = 'text-slate-700 dark:text-slate-200', title?: string) =>
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-semibold ${tone}`} title={title}>{dot(c)}{text}</span>;
const OK = 'bg-emerald-500';
const IDLE = 'bg-slate-400';
const WARN = 'bg-amber-500';
const BAD = 'bg-red-500';
const WARN_TXT = 'text-amber-700';
const BAD_TXT = 'text-red-700';
const PRIMARY = 'whitespace-nowrap rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60';
const SECONDARY = 'whitespace-nowrap rounded-lg border border-slate-200 dark:border-[#1d3f5c] px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-white hover:bg-slate-50 disabled:opacity-60';
const QUIET = 'whitespace-nowrap text-[11px] font-semibold text-slate-500 hover:text-blue-700 hover:underline';

export default function LinesTable({ lines, openByLine, onChanged, autoOpenId, invitedBy }: Props) {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  // Opens by itself: a courier just added, else the first one that still blocks shippers, else the only courier.
  const firstToOpen = () => autoOpenId ?? lines.find((l) => missingFor(l).length > 0)?._id ?? (lines.length === 1 ? lines[0]._id : null);
  const [open, setOpen] = useState<string | null>(firstToOpen);
  const [focus, setFocus] = useState<LineFocus>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (autoOpenId) setOpen(autoOpenId); }, [autoOpenId]);
  // Lines arrive after the first render; pick the row to open once they do, unless the owner already opened or closed one.
  useEffect(() => { if (!touched && open === null) setOpen(firstToOpen()); }, [lines.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState<string | null>(null);
  const { status: pub, refresh: refreshPub } = usePublicStatus();
  const [pubBusy, setPubBusy] = useState(false);
  const [confirmPublic, setConfirmPublic] = useState(false);

  const manageRates = async (l: Line) => {
    setBusy(l._id);
    try {
      const r = await axios.post(`${API_BASE_URL}/api/transporter/lines/${l._id}/manage-token`);
      loginWithToken(r.data.token);
      navigate('/profile/rates');
    } catch (e: any) { toast.error(e?.response?.data?.message || "Could not open this courier's rates."); setBusy(null); }
  };
  const goPublic = async (withdraw = false) => {
    setPubBusy(true);
    try {
      if (withdraw) { await cancelGoPublicRequest(); toast.success('Request withdrawn'); }
      else { await requestGoPublic(); toast.success('Sent for admin approval'); }
      await refreshPub();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not send the request.'); await refreshPub(); }
    finally { setPubBusy(false); }
  };
  const toggle = (id: string, f: LineFocus = null) => { setTouched(true); setOpen(open === id && !f ? null : id); setFocus(f); };
  /** Buttons and links inside a row do their own thing; a click anywhere else on the row opens it. */
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (lines.length === 0) return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No couriers added yet. Add the first one above.</p>;

  const anyPrivate = lines.some((l) => l.listing === 'invited' && missingFor(l).length === 0);
  const v = pub?.visibility;
  const who = invitedBy || 'the shipper who invited you';

  return (
    <div className="space-y-2">
      {anyPrivate && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 dark:border-[#1d3f5c] bg-white dark:bg-[#0d2438] px-4 py-2.5 text-xs text-slate-700 dark:text-slate-200">
          <Lock size={14} className="flex-none" />
          {v === 'pending_public'
            ? <><span className="flex-1"><b>Public listing pending admin approval.</b> Until then only {who} sees your couriers.</span>
                <button type="button" disabled={pubBusy} onClick={() => goPublic(true)} className={QUIET}>Withdraw request</button></>
            : <><span className="flex-1">
                  <b>Only {who} sees your couriers.</b> After going public, other shippers see a courier when it is cheaper than their own vendors (or always, if they have none).
                  {v === 'rejected' && pub?.rejectionReason && <span className="block text-red-700">Last request not approved: {pub.rejectionReason}</span>}
                </span>
                <button type="button" disabled={pubBusy || confirmPublic} onClick={() => setConfirmPublic(true)} className={PRIMARY}>{v === 'rejected' ? 'Request again' : 'Request public listing'}</button></>}
          {/* Every shipper will see the current rates, so offer a last look at them before the request goes out. */}
          {confirmPublic && v !== 'pending_public' && (
            <div role="alertdialog" aria-label="Review rates before going public" className="basis-full rounded-lg border border-slate-200 dark:border-[#1d3f5c] bg-slate-50 dark:bg-[#0b1b2b] p-3">
              <p className="font-bold text-slate-900 dark:text-white">Every shipper will see these rates. Review them first?</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {lines.filter((l) => missingFor(l).length === 0).map((l) => (
                  <li key={l._id}>
                    <button type="button" disabled={busy === l._id} onClick={() => manageRates(l)} className="font-bold text-blue-700 hover:underline disabled:opacity-60">Review {l.courier || l.companyName} rates</button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={pubBusy} onClick={async () => { await goPublic(); setConfirmPublic(false); }} className={PRIMARY}>Rates are correct, send request</button>
                <button type="button" disabled={pubBusy} onClick={() => setConfirmPublic(false)} className="text-xs font-bold text-slate-600">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto bg-white dark:bg-[#0d2438]">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
          {/* Fixed widths for the short columns; the spare width goes to Courier, not to gaps after "Private" or "+ Add". */}
          <colgroup>
            <col className="w-10" /><col /><col className="w-[170px]" /><col className="w-[150px]" /><col className="w-[130px]" />
            <col className="w-[100px]" /><col className="w-[80px]" /><col className="w-[120px]" /><col className="w-[150px]" />
          </colgroup>
          <thead className="bg-slate-100 dark:bg-[#0b1b2b]">
            <tr>
              <th className={th} />
              <th className={th}>Courier</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Pincodes</th>
              <th className={th}>Rates</th>
              <th className={th}>Tracking</th>
              <th className={`${th} text-right`}>People</th>
              <th className={`${th} text-right`}>Open bookings</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const missing = missingFor(l);
              const isOpen = open === l._id;
              const openCount = openByLine[l._id] ?? 0;
              const ratesNeedWork = l.ratesStatus !== 'ok';
              return (
                <Fragment key={l._id}>
                  <tr onClick={() => toggle(l._id)} title={isOpen ? undefined : 'Click for pincodes, tracking link, people and login'}
                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-[#0b1b2b] ${isOpen ? 'bg-violet-50/40 dark:bg-[#0b1b2b]' : ''}`}>
                    <td className={`${td} text-center`}>
                      <button type="button" aria-label={isOpen ? 'Hide details' : 'Show details'} aria-expanded={isOpen} onClick={(e) => { stop(e); toggle(l._id); }} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className={td}>
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white" title={`Shippers see it as "${l.companyName}"`}>{l.courier || l.companyName}</p>
                    </td>
                    <td className={td}>
                      {missing.length > 0 ? state('Not live', BAD, BAD_TXT, `Missing: ${missing.join(', ')}`)
                        : l.kycStatus === 'rejected' ? state('KYC rejected', BAD, BAD_TXT)
                        : l.listing === 'invited' ? state(v === 'pending_public' ? 'Private · approval pending' : 'Private', IDLE, undefined, `Only ${who} sees it`)
                        : l.listing === 'kyc' ? state('Waiting for KYC', WARN, WARN_TXT, 'Shown to all shippers once your KYC is verified')
                        : state('Live', OK)}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                      {l.coverage.pincodes > 0
                        ? <span className="font-semibold text-slate-800 dark:text-white">{l.coverage.pincodes.toLocaleString('en-IN')}</span>
                        : <span className={`font-semibold ${BAD_TXT}`}>None</span>}
                    </td>
                    <td className={td} title={l.ratesUpdatedAt && l.ratesUpdatedBy ? `Updated ${day(l.ratesUpdatedAt)} by ${l.ratesUpdatedBy.name}` : undefined}>
                      {l.ratesStatus === 'ok' ? state('OK', OK) : l.ratesStatus === 'stale' ? state('Stale 90+ days', WARN, WARN_TXT) : state('None', BAD, BAD_TXT)}
                      {hasRatesDraft(l._id) && <span className={`ml-2 text-[11px] font-semibold ${WARN_TXT}`}>Draft unpublished</span>}
                    </td>
                    <td className={td}>
                      {l.trackingLink ? state('Set', OK) : <button type="button" onClick={(e) => { stop(e); toggle(l._id, 'tracking'); }} className={QUIET}>+ Add</button>}
                    </td>
                    <td className={`${td} text-right`}>
                      {l.team.length > 0 ? <span className="font-semibold text-slate-800 dark:text-white">{l.team.length}</span> : <button type="button" onClick={(e) => { stop(e); toggle(l._id, 'people'); }} className={QUIET}>+ Add</button>}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {openCount > 0 ? <Link to={`/bookings?courier=${l._id}`} onClick={stop} className="font-bold text-blue-700 hover:underline" title="Open these bookings">{openCount}</Link> : <span className="text-slate-400">0</span>}
                    </td>
                    <td className={`${td} text-right`} onClick={stop}>
                      {/* One filled button only when a required step is missing; otherwise a plain outline. */}
                      {l.coverage.pincodes === 0
                        ? <button type="button" onClick={() => toggle(l._id, 'pincodes')} className={PRIMARY}>Upload pincodes</button>
                        : <button type="button" disabled={busy === l._id} onClick={() => manageRates(l)} className={ratesNeedWork ? PRIMARY : SECONDARY}>{l.ratesStatus === 'none' ? 'Add rates' : l.ratesStatus === 'stale' ? 'Update rates' : 'Manage rates'}</button>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50 dark:bg-[#0b1b2b]">
                      <td colSpan={9} className={`${GRID} p-3 pl-12`}>
                        <SetupChecklist line={l} busy={busy === l._id} onManageRates={() => manageRates(l)} />
                        <LineCard line={l} onChanged={onChanged} focus={focus} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
