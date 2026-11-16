// src/pages/MisDisputesPage.tsx
//
// The transporter's side of the monthly bill check, as one compact grid. Send the bill for a shipper; when the shipper shares their
// review (green accepted / red declined, with the reason and what they will pay), answer each declined row in the row (accept their
// amount, or stand by the bill) and, any time, edit the figures of any shipment right here. Editing several rows and pressing Submit
// starts the next revision: no Excel, no re-upload. Owner-only. The shipper's drafts never show here until they share them.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FileSpreadsheet, UploadCloud, Download, MessageSquare } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/apiConfig';

axios.defaults.withCredentials = true;

type Status = 'accepted' | 'declined' | 'needs_check';
type Cells = Record<string, number | null>;
type SentRow = { key: string; lr: string | null; awb: string | null; destPin: string | null; status: Status; reason: string; billed: number | null; booked: number | null; diff: number | null; billedWeight: number | null; bookedWeight: number | null; claim?: number; pay?: number | null; billedCells?: Cells | null; cells?: Cells | null };
type Settlement = { billed: number; booked: number; diff: number; claimed: number; other?: number; agreed: number; disputed: number; net: number };
type Summary = { billed: number; booked: number; diff: number; claimed: number; accepted: number; declined: number; needsCheck: number };
type Reply = { key: string; at: string; answer: 'agree' | 'dispute'; note: string };
type Revision = { n: number; by: 'transporter' | 'shipper'; at: string; sentAt: string | null; latest?: boolean; rows?: SentRow[]; summary?: Summary; settlement?: Settlement; replies?: Reply[]; closed?: boolean; agreedCredit?: number; unsentAnswers?: number; answersSentAt?: string | null };
type Lock = { at: string; via: 'agreement' | 'shipper_pays'; revision: number; amount: number };
type CaseItem = { caseId: string; customerID: string; customerName: string; month: string; revisions: number; latestSent: boolean; closed: boolean; agreedCredit: number; locked?: boolean; agreedAmount?: number };
type Changes = { notes?: Record<string, string>; changes: { key: string; field: string; from: string | number | null; to: string | number | null; by: 'transporter' | 'shipper' }[]; added: string[]; removed: string[] };
type ThreadEvent = { at: string; by: 'shipper' | 'transporter'; revision: number; kind: 'review' | 'answer' | 'edit' | 'comment'; label: string; text: string };
type Filter = 'all' | 'open' | Status | 'changed';
type Draft = { fields: Record<string, string>; note: string };

const base = `${API_BASE_URL}/api/transporter/mis`;
const inr = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const signed = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${inr(n)}`);
/** "2026-10" -> "Oct 2026" */
const monthLabel = (m: string) => { const [y, mo] = m.split('-').map(Number); return Number.isFinite(y) && Number.isFinite(mo) ? new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : m; };
const kg = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`);
const msgOf = (e: unknown) => (axios.isAxiosError(e) ? e.response?.data?.message : null) || 'Something went wrong. Please try again.';
const FIELD: Record<string, string> = { weight: 'Weight', basisRate: 'Rate/kg', finalBaseRate: 'Base freight', docket: 'Docket', rov: 'ROV', odaAmount: 'ODA', fuelCharge: 'Fuel', extra: 'Handling', appointment: 'Appointment', totalBaseRate: 'Total before GST', grossTotal: 'Total with GST', boxes: 'Boxes', destPin: 'Pincode', shipmentValue: 'Shipment value', status: 'Decision', reason: 'Reason' };
/** What the transporter may correct on a row. Totals follow automatically; identity columns are never editable. */
const EDIT_FIELDS: [string, string][] = [['weight', 'Weight (kg)'], ['basisRate', 'Rate per kg (₹)'], ['finalBaseRate', 'Base freight (₹)'], ['docket', 'Docket (₹)'], ['rov', 'ROV (₹)'], ['odaAmount', 'ODA (₹)'], ['fuelCharge', 'Fuel (₹)'], ['extra', 'Handling (₹)'], ['appointment', 'Appointment (₹)']];
const COLS = 12;

const MisDisputesPage: React.FC = () => {
  const { user } = useAuth();
  const [shippers, setShippers] = useState<{ customerID: string; name: string }[]>([]);
  const [customerID, setCustomerID] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [open, setOpen] = useState<{ caseId: string; customerName: string; month: string; lock: Lock | null; threads: Record<string, ThreadEvent[]>; revisions: Revision[] } | null>(null);
  const [n, setN] = useState(0);
  const [changes, setChanges] = useState<Changes | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [standBy, setStandBy] = useState<{ key: string; text: string } | null>(null); // the reason being written for standing by a row
  const [thread, setThread] = useState<string | null>(null); // the shipment whose conversation is open
  const [commentText, setCommentText] = useState('');
  const [edits, setEdits] = useState<Record<string, Draft>>({}); // figures being edited, per shipment, until Submit
  const [editing, setEditing] = useState<string | null>(null); // the shipment whose editor is open

  // Start on the bill the bell pointed at, else the one with a review waiting, else the first.
  const wanted = new URLSearchParams(window.location.search).get('case');
  const arrived = useRef(false);
  useEffect(() => {
    if (!customerID && cases.length) setCustomerID((cases.find((c) => c.caseId === wanted) || cases.find((c) => c.latestSent && !c.closed && !c.locked) || cases[0]).customerID);
  }, [cases, customerID, wanted]);

  const loadCases = useCallback(() => axios.get(`${base}/cases`).then((r) => setCases(r.data.cases || [])).catch(() => {}), []);
  // keep = reload the same revision after an answer: the filter and any figures still being edited stay as they were.
  const openCase = useCallback(async (caseId: string, pick?: number, keep = false) => {
    try {
      const r = await axios.get(`${base}/cases/${caseId}`);
      const revisions: Revision[] = r.data.revisions;
      setOpen({ caseId, customerName: r.data.case.customerName, month: r.data.case.month, lock: r.data.lock || null, threads: r.data.threads || {}, revisions });
      const shown = pick ?? [...revisions].reverse().find((v) => v.sentAt)?.n ?? revisions[revisions.length - 1].n;
      setN(shown);
      if (!keep) { setChanges(null); setFilter(shown > 1 ? 'open' : 'all'); setEdits({}); setEditing(null); setError(''); } // revision 2 onwards opens on what is still open
    } catch (e) { setError(msgOf(e)); }
  }, []);

  useEffect(() => {
    if (arrived.current || !customerID || !cases.length) return;
    arrived.current = true;
    const c = cases.find((x) => x.caseId === wanted) || cases.find((x) => x.customerID === customerID && x.latestSent && !x.locked) || cases.find((x) => x.customerID === customerID);
    if (c) openCase(c.caseId);
  }, [cases, customerID, wanted, openCase]);

  useEffect(() => {
    if (user?.role === 'employee') return;
    axios.get(`${base}/shippers`).then((r) => { const s = r.data.shippers || []; setShippers(s); if (s.length === 1) setCustomerID(s[0].customerID); }).catch(() => {});
    loadCases();
  }, [user?.role, loadCases]);

  if (user?.role === 'employee') return <div className="max-w-3xl mx-auto p-6 text-sm text-slate-600">Only the account owner can see bills.</div>;

  const upload = async () => {
    if (!file || !customerID) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = new FormData(); body.append('customerID', customerID); body.append('file', file);
      const r = await axios.post(`${base}/upload`, body);
      setNotice(`Sent to the shipper as revision ${r.data.n}.`); setFile(null);
      await loadCases(); await openCase(r.data.caseId, r.data.n);
    } catch (e) { setError(msgOf(e)); }
    setBusy(false);
  };

  const reply = async (key: string, answer: 'agree' | 'dispute', note = '') => {
    if (!open) return;
    try {
      await axios.post(`${base}/cases/${open.caseId}/revisions/${n}/replies`, { key, answer, note });
      setStandBy(null);
      await openCase(open.caseId, n, true); loadCases();
    } catch (e) { setError(msgOf(e)); }
  };

  const sendAnswers = async () => {
    if (!open) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await axios.post(`${base}/cases/${open.caseId}/revisions/${n}/send-answers`);
      setNotice(r.data.lock ? 'Sent. Every row is resolved, so this month is settled.' : 'Sent to the shipper. They are notified and answer next.');
      await openCase(open.caseId, n, true); loadCases();
    } catch (e) { setError(msgOf(e)); }
    setBusy(false);
  };

  const sendComment = async (key: string) => {
    if (!open || !commentText.trim()) return;
    try {
      await axios.post(`${base}/cases/${open.caseId}/comments`, { key, text: commentText });
      setCommentText('');
      await openCase(open.caseId, n, true);
    } catch (e) { setError(msgOf(e)); }
  };

  // Only the figures that actually differ from the bill go to the server.
  const changedEdits = () => Object.entries(edits).map(([key, d]) => {
    const row = rev?.rows?.find((r) => r.key === key);
    const fields: Record<string, number> = {};
    for (const [f, text] of Object.entries(d.fields)) {
      const v = Number(text);
      if (text.trim() !== '' && Number.isFinite(v) && v !== (row?.billedCells?.[f] ?? null)) fields[f] = v;
    }
    return { key, fields, note: d.note };
  }).filter((e) => Object.keys(e.fields).length > 0);

  const submitEdits = async () => {
    if (!open) return;
    const payload = changedEdits();
    if (!payload.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await axios.post(`${base}/cases/${open.caseId}/edit`, { edits: payload });
      setNotice(`Submitted as revision ${r.data.n}. The shipper reviews it next.`);
      await loadCases(); await openCase(open.caseId, r.data.n);
    } catch (e) { setError(msgOf(e)); }
    setBusy(false);
  };

  const download = async () => {
    if (!open) return;
    try {
      const r = await axios.get(`${base}/cases/${open.caseId}/revisions/${n}/export`, { responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = `MIS-${open.customerName.replace(/[^A-Za-z0-9]+/g, '-')}-${open.month}-R${n}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
    } catch { setError('Could not download the file.'); }
  };

  const pick = async (f: Filter) => {
    setFilter(f);
    if (f === 'changed' && open && !changes) {
      try { setChanges((await axios.get(`${base}/cases/${open.caseId}/changes`, { params: { n } })).data); }
      catch (e) { setError(msgOf(e)); setFilter('all'); }
    }
  };

  const setField = (key: string, f: string, text: string) => setEdits((d) => ({ ...d, [key]: { note: d[key]?.note ?? '', fields: { ...(d[key]?.fields ?? {}), [f]: text } } }));
  const setNote = (key: string, text: string) => setEdits((d) => ({ ...d, [key]: { fields: d[key]?.fields ?? {}, note: text } }));

  const rev = open?.revisions.find((r) => r.n === n);
  const canAct = !!open && !open.lock && !!rev?.latest && !!rev.rows; // the latest shared revision of an unsettled month
  const pending = changedEdits().length;
  const changed = new Set([...(changes?.changes.map((c) => c.key) || []), ...(changes?.added || [])]);
  const rows = rev?.rows ? rev.rows.filter((r) => (filter === 'all' ? true : filter === 'open' ? r.status !== 'accepted' : filter === 'changed' ? changed.has(r.key) : r.status === filter)) : [];
  const rowChange = (key: string) => (changes?.changes.filter((c) => c.key === key) || []).map((c) => `${FIELD[c.field] || c.field} ${c.from ?? '—'}→${c.to ?? '—'}`).join(', ');
  const cols = COLS + (canAct ? 1 : 0) + (filter === 'changed' ? 1 : 0);

  return (
    <div className="max-w-[1700px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={20} className="text-blue-600" />
        <h1 className="text-lg font-extrabold text-slate-900">Bills</h1>
        <span className="text-xs text-slate-500">Send your monthly bill to a shipper. They review it; you answer their changes or correct the figures here.</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex flex-col sm:flex-row gap-2 sm:items-center">
        <select value={customerID} onChange={(e) => { const v = e.target.value; setCustomerID(v); const latest = cases.find((c) => c.customerID === v); if (latest) openCase(latest.caseId); }} className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">{shippers.length ? 'Choose shipper' : 'No shippers with accepted bookings yet'}</option>
          {shippers.map((s) => <option key={s.customerID} value={s.customerID}>{s.name}</option>)}
        </select>
        <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm bg-white" />
        <button onClick={upload} disabled={!file || !customerID || busy} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-bold disabled:opacity-40"><UploadCloud size={14} />{busy ? 'Sending…' : 'Send bill'}</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">{notice}</div>}

      {cases.some((c) => c.customerID === customerID) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Month</span>
          {cases.filter((c) => c.customerID === customerID).map((c) => (
            <button key={c.caseId} onClick={() => openCase(c.caseId)} className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${open?.caseId === c.caseId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}>
              {monthLabel(c.month)}{c.locked ? ` ✓ settled · ${inr(c.agreedAmount)}` : c.latestSent ? ' · review received' : ' · waiting for shipper'}
            </button>
          ))}
        </div>
      )}

      {open && rev && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-2">
            {rev.summary && (
              <div className="flex items-baseline gap-3 text-xs text-slate-500">
                <span>You billed <b className="text-slate-900 text-sm">{inr(rev.summary.billed)}</b></span>
                <span>Shipper booked <b className="text-slate-900 text-sm">{inr(rev.summary.booked)}</b></span>
                <span title="Billed minus the shipper's booked price, on every shipment that matched a booking">Net difference <b className={`text-base ${rev.summary.diff > 0 ? 'text-red-600' : 'text-green-700'}`}>{signed(rev.summary.diff)}</b></span>
                {rev.settlement && Math.abs((rev.settlement.other ?? 0)) > 0.004 && <span className="text-slate-500" title="Declined shipments are worth their whole extra charge; the rest is the difference on shipments already accepted">= {inr(rev.settlement.claimed)} declined {(rev.settlement.other ?? 0) < 0 ? '−' : '+'} {inr(Math.abs((rev.settlement.other ?? 0)))} on accepted</span>}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {open.revisions.map((r) => (
                <button key={r.n} onClick={() => { setN(r.n); setChanges(null); setFilter(r.n > 1 ? 'open' : 'all'); setEditing(null); }} title={r.summary ? `Difference when shared: ${signed(r.summary.diff)}` : 'Not reviewed yet'} className={`px-2 py-0.5 rounded text-xs font-bold border ${r.n === n ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>
                  Revision {r.n}{(r.n === n ? rev.summary : r.summary) ? ` · ${signed((r.n === n ? rev.summary : r.summary)!.diff)}` : ''}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {rev.rows && <button title="Download as Excel" onClick={download} className="p-1.5 rounded-md border border-slate-300 text-slate-600"><Download size={14} /></button>}
            </div>
          </div>

          {open.lock && (
            <div className="px-3 py-2.5 border-b border-green-200 bg-green-50 text-sm text-green-900">
              <b>Settled.</b> Agreed amount to pay <b className="text-base">{inr(open.lock.amount)}</b>
              <span className="text-green-800"> · {open.lock.via === 'agreement' ? 'every row resolved' : 'the shipper agreed to pay as billed'} · {new Date(open.lock.at).toLocaleDateString('en-IN')} · this month can no longer be changed</span>
            </div>
          )}

          {!rev.rows || !rev.summary ? (
            <div className="px-4 py-6 text-sm text-slate-600">{open.customerName} has not shared their review of {rev.n === open.revisions[open.revisions.length - 1].n ? 'this revision' : `revision ${rev.n}`} yet. You will see each shipment as accepted or declined here once they do.</div>
          ) : (
            <>
              {!open.lock && rev.settlement && (
                <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 text-xs">
                  <span title="Amounts you have accepted from the shipper">Agreed so far: <b className="text-green-700 text-sm">{inr(rev.settlement.agreed)}</b></span>
                  <span>Still open: <b className={`text-sm ${rev.settlement.disputed > 0 ? 'text-red-600' : 'text-slate-700'}`}>{inr(rev.settlement.disputed)}</b></span>
                  <span title="The bill, less only the amounts you accepted">Payable as it stands: <b className="text-slate-900 text-sm">{inr(rev.settlement.net)}</b></span>
                </div>
              )}
              {canAct && pending === 0 && (rev.unsentAnswers ?? 0) > 0 && (
                <div className="px-3 py-2 border-b border-blue-200 bg-blue-50 flex flex-wrap items-center gap-3 text-sm text-blue-900">
                  <b>{rev.unsentAnswers} answer{rev.unsentAnswers! > 1 ? 's' : ''} ready.</b>
                  <span className="text-blue-800">{open.customerName} cannot see {rev.unsentAnswers! > 1 ? 'them' : 'it'} until you send.</span>
                  <button onClick={sendAnswers} disabled={busy} className="ml-auto px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-bold disabled:opacity-40">Send to shipper</button>
                </div>
              )}
              {pending > 0 && (
                <div className="px-3 py-2 border-b border-blue-200 bg-blue-50 flex flex-wrap items-center gap-3 text-sm text-blue-900">
                  <b>{pending} shipment{pending > 1 ? 's' : ''} edited.</b>
                  <span className="text-blue-800">Submitting starts revision {n + 1} and sends your answers with it; the totals are recalculated and the shipper reviews the changes.</span>
                  <span className="ml-auto flex gap-2">
                    <button onClick={() => { setEdits({}); setEditing(null); }} className="px-3 py-1 rounded-md border border-blue-300 bg-white text-xs font-semibold">Discard</button>
                    <button onClick={submitEdits} disabled={busy} className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-bold disabled:opacity-40">Submit as revision {n + 1}</button>
                  </span>
                </div>
              )}
              <div className="px-3 py-1.5 border-b border-slate-200 flex flex-wrap items-center gap-1.5 bg-slate-50">
                {([...(n > 1 ? [['open', 'Open', rev.summary.declined + rev.summary.needsCheck] as const] : []), ['all', 'All', rev.rows.length] as const, ['declined', 'Declined', rev.summary.declined] as const, ['accepted', 'Accepted', rev.summary.accepted] as const, ['needs_check', 'Shipper checking', rev.summary.needsCheck] as const]).map(([k, label, count]) => (
                  <button key={k} onClick={() => pick(k)} className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${filter === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`}>{label} {count}</button>
                ))}
                {n > 1 && <button onClick={() => pick('changed')} className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${filter === 'changed' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300'}`}>Changed since revision {n - 1}</button>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-300 [&_td]:border-slate-300 [&_td]:align-top [&_td]:break-words">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left">LR</th><th className="px-2 py-1.5 text-left">To</th>
                      <th className="px-2 py-1.5 text-right">Billed weight (kg)</th><th className="px-2 py-1.5 text-right">Shipper weight (kg)</th>
                      <th className="px-2 py-1.5 text-right">Billed (₹)</th><th className="px-2 py-1.5 text-right">Shipper booked (₹)</th><th className="px-2 py-1.5 text-right">Difference (₹)</th>
                      <th className="px-2 py-1.5 text-center">Decision</th><th className="px-2 py-1.5 text-left w-[28%] min-w-[16rem]">Reason</th>
                      <th className="px-2 py-1.5 text-right" title="What the shipper pays for this row">Shipper pays (₹)</th><th className="px-2 py-1.5 text-left">Your answer</th>
                      {canAct && <th className="px-2 py-1.5 text-center">Edit</th>}
                      {filter === 'changed' && <th className="px-2 py-1.5 text-left min-w-[18rem]">What changed</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && <tr><td colSpan={cols} className="px-3 py-6 text-center text-slate-500">{filter === 'changed' ? 'Nothing changed on these shipments.' : filter === 'open' ? 'Nothing is left open on this revision.' : 'No shipments here.'}</td></tr>}
                    {rows.map((r) => {
                      const tone = r.status === 'declined' ? 'bg-red-50' : r.status === 'accepted' ? 'bg-green-50' : 'bg-amber-50';
                      const answered = rev.replies?.find((x) => x.key === r.key);
                      const wtDiff = r.billedWeight != null && r.bookedWeight != null && Math.abs(r.billedWeight - r.bookedWeight) >= 0.01;
                      const draft = edits[r.key];
                      const edited = changedEdits().some((e) => e.key === r.key);
                      return (
                        <React.Fragment key={r.key}>
                          <tr className={`${tone} border-t border-white`}>
                            <td className="px-2 py-1 font-semibold text-slate-800 min-w-[10rem] break-words">
                              {r.lr || r.awb || 'No LR'}
                              <button onClick={() => { setThread(thread === r.key ? null : r.key); setCommentText(''); }} title="Comments on this shipment" aria-label="Comments on this shipment" className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${thread === r.key ? 'text-blue-700' : 'text-slate-500 hover:text-blue-700'}`}>
                                <MessageSquare size={15} />
                                {(open.threads[r.key] || []).length > 0 ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold inline-flex items-center justify-center">{(open.threads[r.key] || []).length}</span> : <span>Comment</span>}
                              </button>
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap text-slate-600">{r.destPin}</td>
                            <td className={`px-2 py-1 text-right ${wtDiff ? 'bg-yellow-200 font-bold' : ''}`}>{kg(r.billedWeight)}</td>
                            <td className={`px-2 py-1 text-right ${wtDiff ? 'bg-yellow-200 font-bold' : ''}`}>{kg(r.bookedWeight)}</td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">{inr(r.billed)}</td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">{inr(r.booked)}</td>
                            <td className={`px-2 py-1 text-right font-bold whitespace-nowrap ${(r.diff ?? 0) > 0 ? 'text-red-600' : 'text-slate-500'}`}>{signed(r.diff)}</td>
                            <td className={`px-2 py-1 text-center font-bold whitespace-nowrap ${r.status === 'declined' ? 'text-red-700' : r.status === 'accepted' ? 'text-green-700' : 'text-amber-700'}`}>{r.status === 'declined' ? 'Declined' : r.status === 'accepted' ? 'Accepted' : 'Checking'}</td>
                            <td className="px-2 py-1 text-slate-800">{r.reason}</td>
                            <td className={`px-2 py-1 text-right whitespace-nowrap ${r.status === 'declined' ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{r.pay == null ? '—' : inr(r.pay)}</td>
                            <td className="px-2 py-0.5">
                              {r.status !== 'declined' ? <span className="text-slate-400">—</span> : canAct ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  <button onClick={() => reply(r.key, 'agree')} className={`px-2 py-0.5 rounded border font-bold whitespace-nowrap ${answered?.answer === 'agree' ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-700 bg-white'}`}>Accept {inr(r.pay)}</button>
                                  <button onClick={() => setStandBy({ key: r.key, text: answered?.answer === 'dispute' ? answered.note : '' })} className={`px-2 py-0.5 rounded border font-bold whitespace-nowrap ${answered?.answer === 'dispute' || standBy?.key === r.key ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-300 text-slate-700 bg-white'}`}>Stand by</button>
                                  {answered && (
                                    <div className={`basis-full text-[11px] leading-snug ${answered.answer === 'agree' ? 'text-green-700' : 'text-slate-700'}`}>
                                      <b>{answered.answer === 'agree' ? 'You accepted the amount' : 'You stand by the bill'}</b>{answered.note ? <> — “{answered.note}”</> : null}
                                      {(!rev.answersSentAt || new Date(answered.at) > new Date(rev.answersSentAt)) && <span className="ml-1 font-semibold text-amber-700">· not sent yet</span>}
                                    </div>
                                  )}
                                </div>
                              ) : answered ? (
                                <div className={`font-bold ${answered.answer === 'agree' ? 'text-green-700' : 'text-slate-700'}`}>{answered.answer === 'agree' ? 'Accepted the amount' : 'Stood by the bill'}{answered.note ? <span className="font-normal text-slate-700"> — {answered.note}</span> : null}</div>
                              ) : <span className="text-slate-500">Not answered</span>}
                            </td>
                            {canAct && (
                              <td className="px-2 py-1 text-center whitespace-nowrap">
                                <button onClick={() => setEditing(editing === r.key ? null : r.key)} className={`px-2 py-0.5 rounded border font-bold ${edited ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-300 text-blue-700 bg-white'}`}>{edited ? 'Edited ●' : editing === r.key ? 'Close' : 'Edit'}</button>
                              </td>
                            )}
                            {filter === 'changed' && <td className="px-2 py-1 text-blue-800">{changes?.added.includes(r.key) ? 'New on this bill' : rowChange(r.key)}{changes?.notes?.[r.key] ? <div className="mt-0.5 text-slate-600">You wrote: “{changes.notes[r.key]}”</div> : null}</td>}
                          </tr>
                          {standBy?.key === r.key && (
                            <tr className="bg-amber-50 border-t border-amber-300">
                              <td colSpan={cols} className="px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <b className="text-slate-800">Stand by {r.lr || r.awb || 'this shipment'}:</b>
                                  <input autoFocus value={standBy.text} onChange={(e) => setStandBy({ key: r.key, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && standBy.text.trim()) reply(r.key, 'dispute', standBy.text.trim()); if (e.key === 'Escape') setStandBy(null); }} maxLength={300} placeholder="Why the bill stands (required)" className="flex-1 min-w-[18rem] border border-amber-400 bg-white rounded px-2 py-1.5 text-sm" />
                                  <button disabled={!standBy.text.trim()} onClick={() => reply(r.key, 'dispute', standBy.text.trim())} className="px-3 py-1.5 rounded-md text-xs font-bold text-white bg-slate-700 disabled:opacity-40">Save</button>
                                  <button onClick={() => setStandBy(null)} className="px-3 py-1.5 rounded-md text-xs font-semibold border border-slate-300 bg-white">Cancel</button>
                                </div>
                              </td>
                            </tr>
                          )}
                          {thread === r.key && (
                            <tr className="bg-white border-t border-slate-200">
                              <td colSpan={cols} className="px-4 py-3">
                                <div className="max-w-3xl space-y-2">
                                  {(open.threads[r.key] || []).length === 0 && <p className="text-xs text-slate-500">No comments yet.</p>}
                                  {(open.threads[r.key] || []).map((e, i) => (
                                    <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${e.by === 'transporter' ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                                      <div className="text-[11px] text-slate-500"><b className="text-slate-800">{e.by === 'transporter' ? 'You' : open.customerName}</b> · Revision {e.revision} · {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                      {e.label && <div className="font-semibold text-slate-800">{e.label}</div>}
                                      {e.text && <div className="text-slate-700">{e.text}</div>}
                                    </div>
                                  ))}
                                  {!open.lock && (
                                    <div className="flex gap-2">
                                      <input value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendComment(r.key); }} maxLength={500} placeholder={`Comment for ${open.customerName}…`} className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                                      <button onClick={() => sendComment(r.key)} className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-bold">Comment</button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {canAct && editing === r.key && (
                            <tr className="bg-blue-50/60">
                              <td colSpan={cols} className="px-3 py-3">
                                <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                                  {EDIT_FIELDS.filter(([f]) => r.billedCells?.[f] != null).map(([f, label]) => (
                                    <label key={f} className="text-[11px] font-semibold text-slate-600">
                                      {label}
                                      <input type="number" min={0} step="0.01" inputMode="decimal" value={draft?.fields[f] ?? String(r.billedCells?.[f] ?? '')} onChange={(e) => setField(r.key, f, e.target.value)} className="mt-0.5 block w-28 text-right border border-slate-300 bg-white rounded px-1.5 py-1 text-xs font-normal" />
                                      {r.cells?.[f] != null && <span className="block text-[10px] font-normal text-slate-500">shipper booked {f === 'weight' ? kg(r.cells[f]) : f === 'basisRate' ? `₹${r.cells[f]}` : inr(r.cells[f])}</span>}
                                    </label>
                                  ))}
                                  <label className="flex-1 min-w-[14rem] text-[11px] font-semibold text-slate-600">Note for the shipper
                                    <input value={draft?.note ?? ''} onChange={(e) => setNote(r.key, e.target.value)} maxLength={300} placeholder="Why the figure changed" className="mt-0.5 block w-full border border-slate-300 bg-white rounded px-1.5 py-1 text-xs font-normal" />
                                  </label>
                                  <button onClick={() => setEditing(null)} className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-bold">Done</button>
                                </div>
                                <p className="mt-1.5 text-[11px] text-slate-500">Totals and GST follow your changes. A charge that was not on the first bill can't be added now.</p>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MisDisputesPage;
