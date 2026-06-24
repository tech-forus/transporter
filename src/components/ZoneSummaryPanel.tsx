import { useEffect, useMemo, useState } from "react";
import { MapPin, X, AlertCircle, Loader2 } from "lucide-react";

export interface ZonePincodeEntry {
  pincode: number;
  isOda: boolean;
  zone: string;
}

interface MasterPincodeEntry {
  pincode: string;
  state: string;
  city: string;
  zone: string;
}

interface ZoneRow {
  name: string;
  pincodeCount: number;
  odaCount: number;
  states: string[];
  coveragePct: number | null; // null when we couldn't resolve a dominant canonical zone
  dominantCanonicalZone: string | null;
  entries: { pincode: number; state: string; city: string; isOda: boolean }[];
}

const coverageColor = (pct: number | null) => {
  if (pct === null) return { dot: "bg-slate-300", border: "border-slate-200", text: "text-slate-500", badge: "bg-slate-100 text-slate-500" };
  if (pct >= 50) return { dot: "bg-emerald-500", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" };
  if (pct >= 15) return { dot: "bg-amber-500", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700" };
  return { dot: "bg-red-500", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" };
};

export default function ZoneSummaryPanel({ pincodeData }: { pincodeData: ZonePincodeEntry[] }) {
  const [master, setMaster] = useState<MasterPincodeEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeZone, setActiveZone] = useState<ZoneRow | null>(null);

  useEffect(() => {
    if (pincodeData.length === 0) return;
    fetch(`${import.meta.env.BASE_URL || "/"}pincodes.json`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => setMaster(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true));
  }, [pincodeData.length]);

  const { masterByPincode, canonicalZoneCounts } = useMemo(() => {
    const byPincode = new Map<string, MasterPincodeEntry>();
    const zoneCounts = new Map<string, number>();
    (master || []).forEach(entry => {
      byPincode.set(String(entry.pincode), entry);
      zoneCounts.set(entry.zone, (zoneCounts.get(entry.zone) || 0) + 1);
    });
    return { masterByPincode: byPincode, canonicalZoneCounts: zoneCounts };
  }, [master]);

  const zoneRows = useMemo<ZoneRow[]>(() => {
    const grouped = new Map<string, ZonePincodeEntry[]>();
    pincodeData.forEach(e => {
      if (!grouped.has(e.zone)) grouped.set(e.zone, []);
      grouped.get(e.zone)!.push(e);
    });

    return Array.from(grouped.entries()).map(([name, list]) => {
      const canonicalTally = new Map<string, number>();
      const entries = list.map(e => {
        const masterEntry = masterByPincode.get(String(e.pincode));
        if (masterEntry) {
          canonicalTally.set(masterEntry.zone, (canonicalTally.get(masterEntry.zone) || 0) + 1);
        }
        return {
          pincode: e.pincode,
          isOda: e.isOda,
          state: masterEntry?.state || "—",
          city: masterEntry?.city || "—",
        };
      });

      let dominantCanonicalZone: string | null = null;
      let dominantCount = 0;
      canonicalTally.forEach((count, zone) => {
        if (count > dominantCount) {
          dominantCount = count;
          dominantCanonicalZone = zone;
        }
      });

      const masterTotalForZone = dominantCanonicalZone ? canonicalZoneCounts.get(dominantCanonicalZone) || 0 : 0;
      const coveragePct = dominantCanonicalZone && masterTotalForZone > 0
        ? Math.round((dominantCount / masterTotalForZone) * 100)
        : master === null ? null : null;

      const states = Array.from(new Set(entries.map(e => e.state).filter(s => s !== "—")));

      return {
        name,
        pincodeCount: list.length,
        odaCount: list.filter(e => e.isOda).length,
        states,
        coveragePct: master ? coveragePct : null,
        dominantCanonicalZone,
        entries,
      };
    }).sort((a, b) => b.pincodeCount - a.pincodeCount);
  }, [pincodeData, masterByPincode, canonicalZoneCounts, master]);

  if (pincodeData.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <MapPin size={15} className="text-blue-600" />
          Zones Added ({zoneRows.length})
        </h3>
        {!master && !loadError && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> Comparing coverage…
          </span>
        )}
        {loadError && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle size={12} /> Coverage comparison unavailable
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {zoneRows.map(zone => {
          const colors = coverageColor(zone.coveragePct);
          return (
            <button
              key={zone.name}
              type="button"
              onClick={() => setActiveZone(zone)}
              className={`text-left p-3 rounded-xl border-2 ${colors.border} bg-white hover:shadow-md transition-all`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 truncate">{zone.name}</span>
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${colors.dot}`} />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {zone.pincodeCount} pincode{zone.pincodeCount === 1 ? '' : 's'}
                {zone.odaCount > 0 && <span className="text-orange-500"> · {zone.odaCount} ODA</span>}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 truncate">
                  {zone.states.slice(0, 2).join(', ')}{zone.states.length > 2 && ` +${zone.states.length - 2}`}
                </span>
                {zone.coveragePct !== null && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                    {zone.coveragePct}% coverage
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Zone pincode/state detail modal */}
      {activeZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setActiveZone(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h4 className="font-bold text-slate-800">{activeZone.name}</h4>
                <p className="text-xs text-slate-500">
                  {activeZone.pincodeCount} pincodes
                  {activeZone.coveragePct !== null && ` · ${activeZone.coveragePct}% coverage of ${activeZone.dominantCanonicalZone}`}
                </p>
              </div>
              <button onClick={() => setActiveZone(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Pincode</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">State</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">City</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">ODA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeZone.entries.map(e => (
                    <tr key={e.pincode} className="hover:bg-slate-50">
                      <td className="px-4 py-1.5 font-mono text-slate-800">{e.pincode}</td>
                      <td className="px-4 py-1.5 text-slate-600">{e.state}</td>
                      <td className="px-4 py-1.5 text-slate-600">{e.city}</td>
                      <td className="px-4 py-1.5">
                        {e.isOda ? (
                          <span className="text-orange-600 font-medium">Yes</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
