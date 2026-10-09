import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, X } from 'lucide-react';
import { API_BASE_URL } from '../config/apiConfig';
import AddressAutosuggest from './AddressAutosuggest';
import {
  readEnd, needsPreview, patchCoverage, patchPincodeTyped, patchPlaceResolved, patchRadius, patchRemoveChip,
  type Side,
} from '../utils/laneEnd';

// One end (From or To) of a lane in the rates editor: a Google address search, a separate pincode field that
// the search fills in, and an optional "include nearby pincodes" reach (1 or 3 km) with the list it produces.
// The pincode (plus any approved nearby list) is what the calculator matches shippers against.

type Lane = Record<string, any>;

interface Props {
  title: 'From' | 'To';
  side: Side;
  lane: Lane;
  locked: boolean;                   // per-shipper custom-rate lanes are read-only
  onPatch: (patch: Lane) => void;
  onBusy: (busy: boolean) => void;   // lets the page hold autosave while a nearby list is being fetched
}

const input = 'rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800';
const RADII = [1, 3];

const LaneEndFields: React.FC<Props> = ({ title, side, lane, locked, onPatch, onBusy }) => {
  const end = readEnd(lane, side);
  const validPincode = /^\d{6}$/.test(end.pincode);

  const [addrText, setAddrText] = useState(end.address);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [distances, setDistances] = useState<Record<string, number>>({});
  const reqId = useRef(0);
  const busyRef = useRef(false);

  const setBusy = useCallback((busy: boolean) => {
    if (busyRef.current === busy) return;
    busyRef.current = busy;
    onBusy(busy);
  }, [onBusy]);

  // The address shown follows the lane (a picked place, or cleared when the pincode is typed by hand).
  useEffect(() => { setAddrText(end.address); }, [end.address]);
  // Never leave the page's autosave held if this row goes away mid-request.
  useEffect(() => () => { if (busyRef.current) onBusy(false); }, [onBusy]);

  const runPreview = useCallback(async (radiusKm: number) => {
    const id = ++reqId.current;
    setChecking(true);
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { radiusKm, pincode: end.pincode };
      if (end.lat != null && end.lng != null) { body.lat = end.lat; body.lng = end.lng; }
      const { data } = await axios.post(`${API_BASE_URL}/api/transporter/price/me/nearby-pincodes`, body);
      if (id !== reqId.current) return; // a newer request took over
      const list: { pincode: string; distanceKm: number }[] = data?.data?.pincodes || [];
      setDistances(Object.fromEntries(list.map((p) => [p.pincode, p.distanceKm])));
      setTruncated(!!data?.data?.truncated);
      onPatch(patchCoverage(side, list.map((p) => p.pincode), end.pincode));
    } catch (e: any) {
      if (id !== reqId.current) return;
      setError(e?.response?.data?.message || "Couldn't check nearby pincodes. Try again.");
      onPatch(patchRadius(side, 0)); // untick: a radius with no list would silently do nothing
    } finally {
      if (id === reqId.current) { setChecking(false); setBusy(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end.pincode, end.lat, end.lng, side, onPatch, setBusy]);

  // A radius is on and the pincode is complete but there is no list yet (just ticked, address picked, or
  // pincode finished typing): fetch it.
  useEffect(() => {
    if (!locked && needsPreview(end) && !checking) runPreview(end.radiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end.radiusKm, end.pincode, end.coverage.length, locked]);

  const toggle = (on: boolean) => {
    reqId.current += 1; // drop any in-flight request for the old setting
    setChecking(false);
    setBusy(false);
    setError(null);
    setTruncated(false);
    onPatch(patchRadius(side, on ? 1 : 0)); // the effect above fetches the list
  };

  const chips = end.coverage.length ? end.coverage : [];
  const sortedChips = [...chips].sort((a, b) => (a === end.pincode ? -1 : b === end.pincode ? 1 : (distances[a] ?? 99) - (distances[b] ?? 99)));

  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-2.5">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{title}</p>

      <AddressAutosuggest
        value={addrText}
        onChange={setAddrText}
        onResolve={(place) => {
          const patch = patchPlaceResolved(side, place);
          if (!patch) { toast.error("Google didn't give a pincode for that address. Type the pincode below."); return; }
          onPatch(patch);
        }}
        placeholder={`Search ${title.toLowerCase()} address`}
        className={`w-full ${input}`}
        disabled={locked}
        showCurrentLocation={false}
      />

      <input
        className={`w-full ${input}`}
        placeholder={`${title} pincode`}
        inputMode="numeric"
        maxLength={6}
        value={end.pincode}
        disabled={locked}
        onChange={(e) => { setAddrText(''); onPatch(patchPincodeTyped(side, e.target.value)); }}
      />

      {locked ? (
        end.coverage.length > 1 && <p className="text-[11px] text-slate-500">Also covers {end.coverage.length - 1} nearby pincodes</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex items-center gap-1.5 text-xs ${validPincode ? 'text-slate-700' : 'text-slate-400'}`}>
              <input
                type="checkbox"
                checked={end.radiusKm > 0}
                disabled={!validPincode || checking}
                onChange={(e) => toggle(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              Include nearby pincodes
            </label>
            {end.radiusKm > 0 && (
              <div role="group" aria-label="Nearby range" className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                {RADII.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={checking}
                    aria-pressed={end.radiusKm === r}
                    onClick={() => { if (end.radiusKm !== r) { reqId.current += 1; onPatch(patchRadius(side, r)); } }}
                    className={`px-2.5 py-1 text-xs font-bold ${end.radiusKm === r ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-60`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            )}
            {checking && <Loader2 size={14} className="animate-spin text-slate-400" aria-label="Checking nearby pincodes" />}
          </div>
          {!validPincode && <p className="text-[11px] text-slate-400">Enter a pincode to include nearby ones.</p>}
          {error && <p className="text-[11px] text-red-600">{error}</p>}

          {end.radiusKm > 0 && sortedChips.length > 0 && (
            <>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {sortedChips.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {p}
                    {p === end.pincode
                      ? <span className="font-normal text-slate-400">· yours</span>
                      : <>
                          {distances[p] != null && <span className="font-normal text-slate-400">· {distances[p]} km</span>}
                          <button type="button" aria-label={`Remove ${p}`} onClick={() => onPatch(patchRemoveChip(lane, side, p))} className="text-slate-400 hover:text-red-600">
                            <X size={11} />
                          </button>
                        </>}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">
                Shippers in these pincodes will see this lane.{truncated ? ' Showing the nearest ones we could check.' : ''}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LaneEndFields;
