// What a courier still needs before shippers can find and book it, in the order to do it. Shown at the top of an open courier row.
// Pincodes and rates are required; the tracking link and people are optional but make bookings smoother.
import { CheckCircle2, Circle } from 'lucide-react';
import type { Line } from './LineCard';

interface Props { line: Line; onManageRates: () => void; busy?: boolean }

export default function SetupChecklist({ line, onManageRates, busy }: Props) {
  const steps = [
    { key: 'pincodes', done: line.coverage.pincodes > 0, required: true, title: 'Pincodes it serves', hint: line.coverage.pincodes > 0 ? `${line.coverage.pincodes.toLocaleString('en-IN')} pincodes` : 'Upload the serviceability sheet below (Pincode, Zone, ODA).' },
    { key: 'rates', done: line.ratesStatus !== 'none', required: true, title: 'Rates', hint: line.ratesStatus !== 'none' ? 'Saved' : 'Open Manage rates, upload the rate sheet, fill docket, fuel and GST, then Review & publish.',
      action: line.ratesStatus === 'none' ? <button type="button" disabled={busy} onClick={onManageRates} className="rounded-lg bg-violet-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60">Manage rates</button> : null },
    { key: 'tracking', done: !!line.trackingLink, required: false, title: 'Tracking link (optional)', hint: line.trackingLink ? 'Set' : 'Add the courier\'s tracking page below, with {awb} where the number goes.' },
    { key: 'people', done: line.team.length > 0, required: false, title: 'People who handle its bookings (optional)', hint: line.team.length > 0 ? `${line.team.length} added` : 'Add a person below so bookings also reach their WhatsApp.' },
  ];
  const required = steps.filter((s) => s.required);
  const doneRequired = required.filter((s) => s.done).length;
  const complete = steps.every((s) => s.done);
  if (complete) return null;
  return (
    <div role="group" aria-label={`Setup for ${line.companyName}`} className="m-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-violet-900">Set up {line.companyName}</p>
        <p className="text-[11px] font-bold text-violet-700">{doneRequired} of {required.length} required steps done</p>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-violet-100"><div className="h-1.5 rounded-full bg-violet-600 transition-all" style={{ width: `${(doneRequired / required.length) * 100}%` }} /></div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-2.5 text-xs">
            {s.done ? <CheckCircle2 size={16} className="mt-0.5 flex-none text-emerald-600" /> : <Circle size={16} className="mt-0.5 flex-none text-slate-300" />}
            <div className="min-w-0 flex-1">
              <p className={`font-bold ${s.done ? 'text-slate-500' : 'text-slate-900'}`}>{i + 1}. {s.title}</p>
              <p className="text-[11px] text-slate-500">{s.hint}</p>
            </div>
            {s.action}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-slate-600">
        {doneRequired === required.length
          ? 'Required steps are done. Shippers who have no vendors of their own see this courier in their results; shippers who do see it when it is cheaper than their cheapest own vendor.'
          : 'Shippers will not see this courier until the required steps are done.'}
      </p>
    </div>
  );
}
