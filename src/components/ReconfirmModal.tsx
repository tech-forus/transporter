import React from 'react';

export interface DiffItem { path: string; from: unknown; to: unknown }

// "priceRate.fuel" -> "Charge: fuel"; "zoneRates.N1.S1" -> "Zone rate: N1 → S1";
// "lanes.110020-400001-tata ace.price" -> "Lane 110020 → 400001 (tata ace): price"
export function prettyDiffPath(p: string): string {
  if (p.startsWith('priceRate.')) return `Charge: ${p.slice('priceRate.'.length).replace(/\./g, ' · ')}`;
  if (p.startsWith('zoneRates.')) return `Zone rate: ${p.slice('zoneRates.'.length).replace(/\./g, ' → ')}`;
  if (p.startsWith('lanes.')) {
    const rest = p.slice('lanes.'.length);
    const m = rest.match(/^(\d{6})-(\d{6})-(.*)\.(price|maxCapacityKg|originReach|destinationReach)$/);
    if (m) {
      const what = { price: 'price', maxCapacityKg: 'capacity', originReach: 'pickup nearby pincodes', destinationReach: 'drop nearby pincodes' }[m[4] as 'price'];
      return `Lane ${m[1]} → ${m[2]} (${m[3]}): ${what}`;
    }
    return `Lane ${rest}`;
  }
  return p;
}
const show = (v: unknown) => (v === null || v === undefined ? '—' : String(v));

const ReconfirmModal: React.FC<{
  diff: DiffItem[]; affectedShippers: number; saving: boolean; onConfirm: () => void; onCancel: () => void;
}> = ({ diff, affectedShippers, saving, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
      <h3 className="text-base font-black text-slate-900">Review your changes</h3>
      <p className="mt-1 text-xs text-slate-500">
        Your rates are public. These changes go live to every shipper{affectedShippers ? ` (including ${affectedShippers} linked to you)` : ''} as soon as you confirm.
      </p>
      <ul className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 text-sm">
        {diff.map((d) => (
          <li key={d.path} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-slate-600">{prettyDiffPath(d.path)}</span>
            <span className="whitespace-nowrap font-mono text-xs"><s className="text-red-500">{show(d.from)}</s> <b className="text-emerald-600">{show(d.to)}</b></span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">Keep editing</button>
        <button onClick={onConfirm} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Publishing…' : 'Confirm & publish'}</button>
      </div>
    </div>
  </div>
);

export default ReconfirmModal;
