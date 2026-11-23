// "We are a: Transporter | Aggregator" and the networks / couriers, asked on the Google profile step the same way the e-mail sign-up asks
// them (SignUpPage). An aggregator sells several couriers (it adds each one as a courier line afterwards); a transporter may belong
// to a logistics network. Only the saved list is sent: "Independent" and "Other" are not couriers.
import { NETWORK_OPTIONS } from '../utils/transporterLogo';

export type OrgType = 'transporter' | 'aggregator';
interface Props { orgType: OrgType; networks: string[]; onOrgType: (t: OrgType) => void; onNetworks: (next: string[]) => void }

const CHOICES = NETWORK_OPTIONS.filter((o) => o.value !== 'independent' && o.value !== 'other');
const seg = (on: boolean) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${on ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`;

export default function OrgTypeAndNetworks({ orgType, networks, onOrgType, onNetworks }: Props) {
  const toggle = (v: string) => onNetworks(networks.includes(v) ? networks.filter((n) => n !== v) : [...networks, v]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">We are a</span>
        <div role="radiogroup" aria-label="Account type" className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          {(['transporter', 'aggregator'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={orgType === t} aria-label={t === 'transporter' ? 'Transporter' : 'Aggregator'} onClick={() => onOrgType(t)} className={seg(orgType === t)}>
              {t === 'transporter' ? 'Transporter' : 'Aggregator'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          {orgType === 'aggregator' ? 'Couriers you sell' : 'Logistics network (optional)'}
        </p>
        {orgType === 'aggregator' && <p className="text-[11px] text-slate-500 mb-1.5">Each one becomes its own courier line with its own rates and team after you finish.</p>}
        <div className="flex flex-wrap gap-1.5">
          {CHOICES.map((o) => {
            const on = networks.includes(o.value);
            return (
              <label key={o.value} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(o.value)} aria-label={o.value} />
                {o.value}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
