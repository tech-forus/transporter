// "Upload updated rate sheet" on the rates editor: read the file with the sign-up's readers, show ONLY what would change (old -> new),
// and apply it to the editor on request. Applying changes the editor's values exactly as typing would (so autosave / "Review & publish"
// then work as usual), and every value stays editable by hand if the preview is not quite right.
import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Upload } from 'lucide-react';
import ReconfirmModal from './ReconfirmModal';
import { readRateSheets, type RateSheetsRead } from '../lib/readRateSheets';
import { planRatesUpdate } from '../utils/ratesUpdate';

type Plan = ReturnType<typeof planRatesUpdate>;
interface Props {
  current: { priceRate: Record<string, any>; zoneRates: Record<string, Record<string, number>> };
  onApply: (next: { priceRate: Record<string, any>; zoneRates: Record<string, Record<string, number>>; service?: { pincode: number; zone: string; isOda: boolean }[] }) => void;
  companyName?: string;
  disabled?: boolean;
}

const skippedNote = (s: Plan['skipped']) => [
  s.newZones.length && `we did not use zones you do not serve yet (${s.newZones.join(', ')})`,
  s.overLimit && `we skipped ${s.overLimit} rate${s.overLimit === 1 ? '' : 's'} above ₹100 per kg`,
].filter(Boolean).join(', and ');

export default function RatesSheetUpdate({ current, onApply, companyName, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string[] | null>(null); // file names while we read them
  const [read, setRead] = useState<RateSheetsRead | null>(null);
  const [origin, setOrigin] = useState<string>('');
  const busy = reading !== null;
  const plan: Plan | null = useMemo(() => (read ? planRatesUpdate(current, read.sheets, { pincodePrices: read.pincodePrices, originZone: origin || undefined }) : null), [read, origin, current]);
  const priceSheets = read?.pincodePrices || [];
  const originChoices = Array.from(new Set(priceSheets.flatMap((p) => p.zones)));
  const close = () => { setRead(null); setOrigin(''); };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setReading(list.map((f) => f.name));
    try {
      const got = await readRateSheets(list, Object.keys(current.zoneRates), companyName || '');
      const next = planRatesUpdate(current, got.sheets, { pincodePrices: got.pincodePrices });
      if (!next.changed) {
        const why = skippedNote(next.skipped);
        toast(`Your sheet has the same rates as now, so there is nothing to change${why ? ` (${why})` : ''}.`, { icon: 'ℹ️' });
      } else { setOrigin(got.pincodePrices[0]?.originGuess || ''); setRead(got); }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'We could not read that file. Please try again.');
    } finally {
      setReading(null);
      if (input.current) input.current.value = '';
    }
  };

  const note = plan ? skippedNote(plan.skipped) : '';
  return (
    <>
      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}>
        <Upload size={14} />
        Upload new rate sheet
        <input ref={input} type="file" multiple className="sr-only" aria-label="Upload new rate sheet" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.docx,.doc,.webp"
          disabled={disabled || busy} onChange={(e) => onFiles(e.target.files)} />
      </label>

      {reading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-busy="true" aria-label="Reading your sheet" className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <Loader2 size={34} className="mx-auto animate-spin text-blue-600" />
            <h3 className="mt-3 text-lg font-extrabold text-slate-900">We are reading your sheet</h3>
            <p className="mt-2 text-sm text-slate-600">
              This can take 1 to 2 minutes. Please keep this page open.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              When we are done, we will show you what changed. You can check it first. Nothing is saved until you say yes.
            </p>
            <p className="mt-3 break-words text-xs font-semibold text-slate-500">{reading.join(', ')}</p>
          </div>
        </div>
      )}

      {plan && read && (
        <ReconfirmModal
          diff={plan.diff} affectedShippers={0} saving={false}
          title="Please check these changes"
          intro={<>We found {plan.diff.length} change{plan.diff.length === 1 ? '' : 's'} in your sheet. Nothing is saved yet. If they look right, press "Use these changes". You can also change any number yourself after that.{note ? ` Note: ${note}.` : ''}</>}
          confirmLabel="Use these changes" cancelLabel="Don't use"
          onCancel={close}
          onConfirm={() => { onApply({ priceRate: plan.priceRate, zoneRates: plan.zoneRates, ...(plan.service.length ? { service: plan.service } : {}) }); close(); toast.success('Done. Please look at the numbers, and change anything you want.'); }}
        >
          {priceSheets.length > 0 && (
            <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <label className="block text-xs font-bold text-slate-600">
                Which zone do you send from?
                <select aria-label="Which zone do you send from?" className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  {originChoices.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-slate-500">The prices in your sheet are for sending from this zone. We chose the cheapest one. Change it if that is not right.</span>
              </label>
              <p>
                Your service area will also be updated: <b>{plan.coverage.pincodes.toLocaleString('en-IN')} pincodes in {plan.coverage.zones} zones</b>. Pincodes that are not in your sheet stay as they are.
              </p>
              {priceSheets.some((p) => p.mixedZones.length > 0) && <p className="text-xs text-amber-700">Some zones had more than one price. We used the most common one.</p>}
              {priceSheets.some((p) => p.skipped > 0) && <p className="text-xs text-amber-700">We left out {priceSheets.reduce((n, p) => n + p.skipped, 0)} rows that had no pincode, zone or price.</p>}
            </div>
          )}
        </ReconfirmModal>
      )}
    </>
  );
}
