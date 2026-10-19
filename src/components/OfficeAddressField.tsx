import React, { useEffect, useState } from 'react';
import { CheckCircle2, MapPin, Pencil, X } from 'lucide-react';
import AddressLocationPicker, { type AddressLocationValue } from './AddressLocationPicker';

// Business signup, step 1: shows the office address (the GST-registered one until the
// transporter confirms it on the map) and lets them refine it with Google suggestions and a
// map pin. Purely additive — it only reads `gstAddress` and hands back the structured location
// fields the "Confirm Your Office Location" gate already collects, so the GST lookup, its
// autofill and formData.address/state/pincode are never touched.

// Same bar the final signup gate uses, so confirming here skips that gate.
export const isLocationConfirmed = (v: AddressLocationValue): boolean =>
  v.lat != null && v.lng != null && !!v.flatNumber.trim();

const summarize = (v: AddressLocationValue): string =>
  [v.flatNumber, v.buildingName, v.formattedAddress].map((s) => s?.trim()).filter(Boolean).join(', ');

interface Props {
  gstAddress: string;
  value: AddressLocationValue;
  onSave: (v: AddressLocationValue) => void;
}

const OfficeAddressField: React.FC<Props> = ({ gstAddress, value, onSave }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AddressLocationValue>(value);
  const confirmed = isLocationConfirmed(value);

  const openPicker = () => { setDraft(value); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); };
  }, [open]);

  const shown = confirmed ? summarize(value) : gstAddress.trim();

  return (
    <>
      <div className="w-full">
        <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
          Office Address
        </label>
        <button
          type="button"
          onClick={openPicker}
          className="group flex w-full items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        >
          <MapPin size={16} className="flex-none text-stone-400" />
          <span className={`min-w-0 flex-1 text-[13px] leading-snug ${shown ? 'text-slate-900' : 'text-stone-400'}`}>
            {shown || 'Add your office address'}
          </span>
          {confirmed ? (
            <span className="flex flex-none items-center gap-1 text-[11px] font-semibold text-green-600">
              <CheckCircle2 size={14} /> Confirmed
            </span>
          ) : (
            <span className="flex flex-none items-center gap-1 text-[11px] font-semibold text-amber-600 group-hover:text-amber-700">
              <Pencil size={13} /> {shown ? 'Edit on map' : 'Add'}
            </span>
          )}
        </button>
        {!confirmed && shown && (
          <p className="mt-1 text-[10.5px] text-stone-400">From your GST. Tap to check it on the map or change it.</p>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="office-address-title" className="relative my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
            <h3 id="office-address-title" className="text-lg font-bold text-slate-800">Confirm Your Office Location</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Search, drag the pin, or use your location. Then add your flat or unit number.</p>

            <AddressLocationPicker
              value={draft}
              onChange={setDraft}
              initialSearchAddress={gstAddress}
              autoRequestLocation={false}
            />

            <div className="mt-6 flex items-center gap-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200">
                Cancel
              </button>
              <button
                type="button"
                disabled={!isLocationConfirmed(draft)}
                onClick={() => { onSave(draft); setOpen(false); }}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                Save address
              </button>
            </div>
            {!isLocationConfirmed(draft) && (
              <p className="mt-2 text-center text-[11px] text-slate-400">Pin your location and add a flat or unit number to save.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default OfficeAddressField;
