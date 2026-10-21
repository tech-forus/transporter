/**
 * ZoneSelectionWizard — Rebuilt as Zone → City → Pincode hierarchical selector
 *
 * Flow:
 *   Zone (North / South / East / West / Central / Northeast)
 *     └── City  (e.g. DELHI, MUMBAI)
 *           └── Pincodes  (e.g. 110001, 110002 …)
 *
 * On confirm → groups selected pincodes by their zone code from pincodes.json
 *            → builds ZoneConfig[] identical to the legacy wizard output
 *            → calls onComplete({ zones, priceMatrix }) — SAME SIGNATURE, no changes upstream
 *
 * ⚠️  DO NOT change the onComplete payload shape — it feeds handleZoneSelectionComplete
 *     in AddVendor.tsx which writes wizardData and switches to the price-matrix step.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  MapPin,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle,
  Search,
  X,
  Hash,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
// Copied from freight-compare-frontend (src/components/ZoneSelectionWizard.tsx, the shipper Add Vendor
// zone picker) so a transporter can pick service zones by hand, same as Add Vendor's "Manual Setup".
// The two apps share no package; keep fixes in step with that copy.
type RegionGroup = 'North' | 'South' | 'East' | 'West' | 'Northeast' | 'Central' | 'Special';
export interface ZoneConfig {
  zoneCode: string;
  zoneName: string;
  region: RegionGroup;
  selectedStates: string[];
  selectedCities: string[]; // "city||state"
  isComplete: boolean;
}

// ============================================================================
// TYPES
// ============================================================================

interface RawPincodeEntry {
  pincode: string;
  zone: string;
  state: string;
  city: string;
}

interface CityData {
  city: string;    // uppercase, as-is from pincodes.json  e.g. "CENTRAL"
  state: string;   // uppercase, as-is from pincodes.json  e.g. "DELHI"
  cityKey: string; // "CITY||STATE"  – used as stable key
  pincodes: string[];
  zone?: string; // Dominant zone for this city
}

interface ZoneDisplayData {
  zoneCode: string; // "N1"
  description?: string; // "Metro cities..."
  region: string; // "North"
  cities: CityData[];
  totalPincodes: number;
}

// Props are kept IDENTICAL to the old ZoneSelectionWizard so AddVendor.tsx
// needs zero changes.
interface ZoneSelectionWizardProps {
  onComplete: (config: {
    zones: ZoneConfig[];
    priceMatrix: Record<string, Record<string, string | number>>;
    serviceability: Array<{ pincode: string; zone: string; state: string; city: string; isODA: boolean; active: boolean }>;
  }) => void;
  /** Ignored in the new UI — kept for API compatibility */
  zones?: ZoneConfig[];
  initialSelectedZones?: string[];
  /** Exact pincodes to restore as selected (e.g. resuming a draft / going back
   *  from the Rate Matrix step). Takes priority over initialSelectedZones,
   *  which selects every pincode in a zone rather than the specific subset
   *  the user originally picked. */
  initialSelectedPincodes?: string[];
  blankCellValue?: string | number;
}

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================



// Define zone order for sorting
const ZONE_ORDER: Record<string, number> = {
  // North
  N1: 1, N2: 2, N3: 3, N4: 4,
  // Central
  C1: 5, C2: 6,
  // East
  E1: 7, E2: 8,
  // West
  W1: 9, W2: 10,
  // South
  S1: 11, S2: 12, S3: 13, S4: 14,
  // Northeast
  NE1: 15, NE2: 16,
  // Special
  X1: 17, X2: 18, X3: 19
};

/** Derive display-region from a zone code (e.g. "N1" → "North") */
function zoneToRegion(code: string): string {
  if (!code) return 'Special';
  const c = code.toUpperCase();
  if (c.startsWith('NE')) return 'Northeast';
  if (c.startsWith('N')) return 'North';
  if (c.startsWith('S')) return 'South';
  if (c.startsWith('E')) return 'East';
  if (c.startsWith('W')) return 'West';
  if (c.startsWith('C')) return 'Central';
  return 'Special';
}

/** Title-case a state string from ALL_CAPS (e.g. "WEST BENGAL" → "West Bengal") */
function titleCase(s: string): string {
  if (!s) return s;
  return s
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Max pincode chips shown per city before a "show more" link appears.
const PINCODE_SHOW_LIMIT = 120;

// ============================================================================
// INDETERMINATE CHECKBOX
// ============================================================================

interface ICBProps {
  state: 'none' | 'some' | 'all';
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md';
}

const IndeterminateCheckbox: React.FC<ICBProps> = ({
  state,
  onClick,
  size = 'md',
}) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'some';
    }
  }, [state]);

  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <span className="flex-shrink-0 cursor-pointer" onClick={onClick}>
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'all'}
        readOnly
        // Handle clicks via the parent span
        onChange={() => { }}
        className={`${dim} rounded border-slate-300 text-blue-600 cursor-pointer pointer-events-none
                    focus:ring-1 focus:ring-blue-400 focus:ring-offset-0`}
      />
    </span>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ZoneSelectionWizard: React.FC<ZoneSelectionWizardProps> = ({
  onComplete,
  blankCellValue = '',
  initialSelectedZones = [],
  initialSelectedPincodes = [],
}) => {
  // ── Data ────────────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allZones, setAllZones] = useState<ZoneDisplayData[]>([]);
  // Fast pincode → raw entry lookup
  const [pincodeIndex, setPincodeIndex] = useState<Map<string, RawPincodeEntry>>(new Map());

  // ── Selection ────────────────────────────────────────────────────────────
  const [selectedPincodes, setSelectedPincodes] = useState<Set<string>>(new Set());

  // ── UI state ─────────────────────────────────────────────────────────────
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());
  const [cityShowAll, setCityShowAll] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [activeRegionFilter, setActiveRegionFilter] = useState<string>('North');

  // ── Column Queries & Active Selections ───────────────────────────────────
  const [activeZoneCode, setActiveZoneCode] = useState<string | null>(null);
  const [activeCityKey, setActiveCityKey] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [pincodeQuery, setPincodeQuery] = useState('');

  // ── Pre-compute flat pincode list per ZONE (for fast select-all) ────────
  const zonePincodeList = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const z of allZones) {
      m.set(z.zoneCode, z.cities.flatMap(c => c.pincodes));
    }
    return m;
  }, [allZones]);

  // ── Load pincodes.json ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const base = import.meta.env.BASE_URL || '/';
        const res = await fetch(`${base}pincodes.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: RawPincodeEntry[] = await res.json();
        if (cancelled) return;

        // Build index + region→city→pincodes hierarchy
        const index = new Map<string, RawPincodeEntry>();
        const zoneBuckets = new Map<string, CityData[]>();

        for (const entry of data) {
          const pc = String(entry.pincode);
          index.set(pc, entry);
          const zone = entry.zone || 'Uncategorized';

          if (!zoneBuckets.has(zone)) zoneBuckets.set(zone, []);

          // We need to aggregate pincodes per city per zone
          // But here we are iterating pincodes.
          // Let's do a two-pass or simpler: just collect raw entries first?
          // Actually the previous logic was fine, just adapted.
        }

        // Re-implementing the bucketing logic for flat zones
        const tempCityMap = new Map<string, { city: string, state: string, zone: string, pincodes: string[] }>();

        for (const entry of data) {
          const pc = String(entry.pincode);
          const zone = entry.zone || 'Uncategorized';
          const cityKey = `${(entry.city ?? '').toUpperCase()}||${(entry.state ?? '').toUpperCase()}||${zone}`;

          if (!tempCityMap.has(cityKey)) {
            tempCityMap.set(cityKey, {
              city: (entry.city ?? '').toUpperCase(),
              state: (entry.state ?? '').toUpperCase(),
              zone,
              pincodes: []
            });
          }
          tempCityMap.get(cityKey)!.pincodes.push(pc);
        }

        // Group cities by zone
        const zoneGroups = new Map<string, CityData[]>();
        for (const [key, val] of tempCityMap.entries()) {
          if (!zoneGroups.has(val.zone)) zoneGroups.set(val.zone, []);
          zoneGroups.get(val.zone)!.push({
            city: val.city,
            state: val.state,
            cityKey: key, // unique key including zone to avoid conflicts
            pincodes: val.pincodes.sort(),
            zone: val.zone
          });
        }

        // Fetch blueprint
        let blueprintZones: Record<string, any> = {};
        try {
          const bpRes = await fetch(`${base}zones_blueprint.json`);
          if (bpRes.ok) {
            const bpJson = await bpRes.json();
            blueprintZones = bpJson.zones || {};
          }
        } catch (e) { console.warn(e); }

        // Build flat list sorted by ZONE_ORDER
        const flatZones: ZoneDisplayData[] = [];
        const sortedCodes = Array.from(zoneGroups.keys()).sort((a, b) => {
          const zA = ZONE_ORDER[a] ?? 999;
          const zB = ZONE_ORDER[b] ?? 999;
          return zA - zB;
        });

        for (const code of sortedCodes) {
          const cities = zoneGroups.get(code)!;
          cities.sort((a, b) => a.city.localeCompare(b.city));
          flatZones.push({
            zoneCode: code,
            region: zoneToRegion(code),
            description: blueprintZones[code]?.description || '',
            cities,
            totalPincodes: cities.reduce((sum, c) => sum + c.pincodes.length, 0)
          });
        }

        setAllZones(flatZones);
        setPincodeIndex(index);

        // Restore the exact pincodes the user had selected before (e.g.
        // resuming a draft, or navigating back from the Rate Matrix step).
        // Takes priority over initialSelectedZones since it's the precise
        // subset the user picked, not every pincode in those zones.
        if (initialSelectedPincodes.length > 0) {
          const preSelected = new Set<string>(
            initialSelectedPincodes.filter(p => index.has(String(p)))
          );
          if (preSelected.size > 0) {
            setSelectedPincodes(preSelected);
            const zonesTouched = new Set<string>();
            for (const pc of preSelected) {
              const zone = index.get(pc)?.zone;
              if (zone) zonesTouched.add(zone);
            }
            setExpandedZones(zonesTouched);
            const firstZone = index.get(Array.from(preSelected)[0])?.zone;
            if (firstZone) setActiveRegionFilter(zoneToRegion(firstZone));
          }
        } else if (initialSelectedZones.length > 0) {
          // Fallback: pre-select all pincodes for zones passed via initialSelectedZones
          const preSelected = new Set<string>();
          for (const [key, val] of tempCityMap.entries()) {
            if (initialSelectedZones.includes(val.zone)) {
              val.pincodes.forEach(p => preSelected.add(p));
            }
          }
          if (preSelected.size > 0) setSelectedPincodes(preSelected);
          // Auto-expand pre-selected zones so the user sees them immediately
          setExpandedZones(new Set(initialSelectedZones));
          // Set active region to the region of the first pre-selected zone
          const firstZone = initialSelectedZones[0];
          const regionMap: Record<string, string> = {
            N: 'North', C: 'Central', E: 'East', W: 'West', S: 'South', X: 'Special',
          };
          const firstChar = firstZone?.[0] || 'N';
          const region = firstZone?.startsWith('NE') ? 'Northeast' : (regionMap[firstChar] || 'North');
          setActiveRegionFilter(region);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setLoadError('Failed to load data.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // initialSelectedZones intentionally excluded — it's only read once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived selection states ──────────────────────────────────────────────

  // ── Derived selection states ──────────────────────────────────────────────

  const getZoneState = useCallback(
    (zCode: string): 'none' | 'some' | 'all' => {
      const list = zonePincodeList.get(zCode) ?? [];
      if (!list.length) return 'none';
      const n = list.filter(p => selectedPincodes.has(p)).length;
      if (n === 0) return 'none';
      return n === list.length ? 'all' : 'some';
    },
    [zonePincodeList, selectedPincodes],
  );

  const getCityState = useCallback(
    (city: CityData): 'none' | 'some' | 'all' => {
      if (!city.pincodes.length) return 'none';
      const n = city.pincodes.filter(p => selectedPincodes.has(p)).length;
      if (n === 0) return 'none';
      return n === city.pincodes.length ? 'all' : 'some';
    },
    [selectedPincodes],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleZone = useCallback(
    (zCode: string, selectAll: boolean) => {
      const list = zonePincodeList.get(zCode) ?? [];
      setSelectedPincodes(prev => {
        const next = new Set(prev);
        list.forEach(p => (selectAll ? next.add(p) : next.delete(p)));
        return next;
      });
    },
    [zonePincodeList],
  );

  const toggleCity = useCallback(
    (city: CityData, selectAll: boolean) => {
      setSelectedPincodes(prev => {
        const next = new Set(prev);
        city.pincodes.forEach(p => (selectAll ? next.add(p) : next.delete(p)));
        return next;
      });
    },
    [],
  );

  const togglePincode = useCallback((pc: string) => {
    setSelectedPincodes(prev => {
      const next = new Set(prev);
      next.has(pc) ? next.delete(pc) : next.add(pc);
      return next;
    });
  }, []);



  const toggleExpandZone = useCallback((zCode: string) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      next.has(zCode) ? next.delete(zCode) : next.add(zCode);
      return next;
    });
  }, []);

  const toggleExpandCity = useCallback((ck: string) => {
    setExpandedCities(prev => {
      const next = new Set(prev);
      next.has(ck) ? next.delete(ck) : next.add(ck);
      return next;
    });
  }, []);

  // ── Build output & call onComplete ───────────────────────────────────────

  const handleConfirm = useCallback(() => {
    if (selectedPincodes.size === 0) {
      toast.error('Please select at least one pincode');
      return;
    }

    // Group selected pincodes by zone code (from pincodes.json)
    const zoneGroups = new Map<
      string,
      { cities: Set<string>; states: Set<string> }
    >();

    for (const pc of selectedPincodes) {
      const entry = pincodeIndex.get(pc);
      if (!entry) continue;
      const zone = entry.zone;
      if (!zoneGroups.has(zone))
        zoneGroups.set(zone, { cities: new Set(), states: new Set() });
      const g = zoneGroups.get(zone)!;
      // Match the legacy "city||state" format produced by ZoneAssignmentService.buildZoneConfig
      g.cities.add(`${entry.city}||${titleCase(entry.state)}`);
      g.states.add(titleCase(entry.state));
    }

    // Build ZoneConfig[] — same shape as before
    const zones: ZoneConfig[] = [];
    for (const [zoneCode, g] of zoneGroups.entries()) {
      zones.push({
        zoneCode,
        zoneName: zoneCode,
        region: zoneToRegion(zoneCode) as RegionGroup,
        selectedStates: Array.from(g.states),
        selectedCities: Array.from(g.cities),
        isComplete: true,
      });
    }
    zones.sort((a, b) => {
      const zA = ZONE_ORDER[a.zoneCode] ?? 999;
      const zB = ZONE_ORDER[b.zoneCode] ?? 999;
      return zA - zB;
    });

    // Empty price matrix (to be filled in the price-matrix step)
    const zoneCodes = zones.map(z => z.zoneCode);
    const priceMatrix: Record<string, Record<string, string | number>> = {};
    for (const from of zoneCodes) {
      priceMatrix[from] = {};
      for (const to of zoneCodes) priceMatrix[from][to] = blankCellValue;
    }

    // Build serviceability array from selected pincodes (for calculator compatibility)
    const serviceability = Array.from(selectedPincodes).map(pc => {
      const entry = pincodeIndex.get(pc);
      return {
        pincode: pc,
        zone: entry?.zone || '',
        state: entry?.state || '',
        city: entry?.city || '',
        isODA: false,
        active: true,
      };
    }).filter(e => e.zone); // drop any entries without a valid zone

    onComplete({ zones, priceMatrix, serviceability });
    toast.success(
      `${selectedPincodes.size.toLocaleString()} pincodes → ${zones.length} zones configured!`,
      { duration: 4000 },
    );
  }, [selectedPincodes, pincodeIndex, blankCellValue, onComplete]);

  // ── Search & Filter ─────────────────────────────────────────────────────────

  const filteredZones = useMemo(() => {
    const q = search.trim().toUpperCase();

    // If search is active, search GLOBALLY (ignore region filter)
    // Otherwise, apply the active region filter
    let base = allZones;
    if (!q && activeRegionFilter !== 'All') {
      base = base.filter(z => z.region === activeRegionFilter);
    }

    if (!q) return base;

    // Filter by search term
    return base
      .map(z => ({
        ...z,
        cities: z.cities.filter(
          c =>
            c.city.includes(q) ||
            c.state.includes(q) ||
            c.pincodes.some(p => p.startsWith(q)),
        ),
      }))
      .filter(z => z.cities.length > 0);
  }, [allZones, search, activeRegionFilter]);

  // Keep activeZoneCode valid within filteredZones
  useEffect(() => {
    if (filteredZones.length === 0) {
      setActiveZoneCode(null);
      return;
    }
    const exists = filteredZones.some(z => z.zoneCode === activeZoneCode);
    if (!exists) {
      setActiveZoneCode(filteredZones[0].zoneCode);
    }
  }, [filteredZones, activeZoneCode]);

  // Keep activeCityKey valid within active zone
  const activeFilteredZoneData = useMemo(() => {
    return filteredZones.find(z => z.zoneCode === activeZoneCode) || null;
  }, [filteredZones, activeZoneCode]);

  useEffect(() => {
    if (!activeFilteredZoneData || activeFilteredZoneData.cities.length === 0) {
      setActiveCityKey(null);
      return;
    }
    const exists = activeFilteredZoneData.cities.some(c => c.cityKey === activeCityKey);
    if (!exists) {
      setActiveCityKey(activeFilteredZoneData.cities[0].cityKey);
    }
  }, [activeFilteredZoneData, activeCityKey]);

  const activeCityData = useMemo(() => {
    if (!activeFilteredZoneData) return null;
    return activeFilteredZoneData.cities.find(c => c.cityKey === activeCityKey) || null;
  }, [activeFilteredZoneData, activeCityKey]);

  // Filter cities under active zone
  const filteredCities = useMemo(() => {
    if (!activeFilteredZoneData) return [];
    let list = activeFilteredZoneData.cities;
    if (cityQuery.trim()) {
      const q = cityQuery.trim().toUpperCase();
      list = list.filter(c => c.city.includes(q) || c.state.includes(q));
    }
    return list;
  }, [activeFilteredZoneData, cityQuery]);

  // Filter pincodes under active city
  const filteredPincodes = useMemo(() => {
    if (!activeCityData) return [];
    let list = activeCityData.pincodes;
    
    // Apply local column-3 query
    if (pincodeQuery.trim()) {
      const q = pincodeQuery.trim().toUpperCase();
      list = list.filter(p => p.startsWith(q));
    }
    
    // Apply global query
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      if (/^\d+$/.test(q)) {
        list = list.filter(p => p.startsWith(q));
      }
    }
    
    return list;
  }, [activeCityData, pincodeQuery, search]);

  // ── Search suggestions (autocomplete) ───────────────────────────────────────
  // Suggests 6-digit pincodes, cities, or states from pincodes.json as the user
  // types. Clicking a suggestion directly selects it (pincode → itself,
  // city/state → every pincode under it) rather than just filling the box.
  interface SearchSuggestion {
    key: string;
    label: string;
    sublabel: string;
    pincodes: string[];
  }

  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    const q = search.trim().toUpperCase();
    if (!q || pincodeIndex.size === 0) return [];

    const results: SearchSuggestion[] = [];

    if (/^\d+$/.test(q)) {
      // Numeric query → suggest matching pincodes
      for (const [pc, entry] of pincodeIndex) {
        if (pc.startsWith(q)) {
          results.push({
            key: pc,
            label: pc,
            sublabel: `${entry.city}, ${titleCase(entry.state)}`,
            pincodes: [pc],
          });
          if (results.length >= 8) break;
        }
      }
    } else {
      // Text query → suggest matching cities/states, grouped
      const cityMap = new Map<string, { city: string; state: string; pincodes: string[] }>();
      for (const [pc, entry] of pincodeIndex) {
        if (entry.city.includes(q) || entry.state.includes(q)) {
          const key = `${entry.city}||${entry.state}`;
          if (!cityMap.has(key)) {
            cityMap.set(key, { city: entry.city, state: entry.state, pincodes: [] });
          }
          cityMap.get(key)!.pincodes.push(pc);
        }
        if (cityMap.size >= 8) break;
      }
      for (const { city, state, pincodes } of cityMap.values()) {
        results.push({
          key: `${city}||${state}`,
          label: `${city}, ${titleCase(state)}`,
          sublabel: `${pincodes.length.toLocaleString()} pincode${pincodes.length === 1 ? '' : 's'}`,
          pincodes,
        });
      }
    }

    return results;
  }, [search, pincodeIndex]);

  const applySuggestion = useCallback((s: SearchSuggestion) => {
    setSelectedPincodes(prev => {
      const next = new Set(prev);
      s.pincodes.forEach(p => next.add(p));
      return next;
    });
    setSearch('');
    setShowSuggestions(false);
    toast.success(`${s.pincodes.length.toLocaleString()} pincode${s.pincodes.length === 1 ? '' : 's'} selected from "${s.label}"`);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return;
    const handleClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSuggestions]);

  // Reset filters when selections change
  useEffect(() => {
    setCityQuery('');
  }, [activeZoneCode]);

  useEffect(() => {
    setPincodeQuery('');
  }, [activeCityKey]);

  // ── Column-level Select All Toggles ───────────────────────────────────────
  
  // 1. Region level (Column 1 header)
  const allZonesInRegionSelected = useMemo(() => {
    if (filteredZones.length === 0) return false;
    return filteredZones.every(z => getZoneState(z.zoneCode) === 'all');
  }, [filteredZones, getZoneState]);

  const someZonesInRegionSelected = useMemo(() => {
    if (allZonesInRegionSelected) return false;
    return filteredZones.some(z => getZoneState(z.zoneCode) !== 'none');
  }, [filteredZones, getZoneState, allZonesInRegionSelected]);

  const regionSelectionState = allZonesInRegionSelected ? 'all' : (someZonesInRegionSelected ? 'some' : 'none');

  const toggleAllZonesInRegion = useCallback((select: boolean) => {
    setSelectedPincodes(prev => {
      const next = new Set(prev);
      filteredZones.forEach(z => {
        const list = zonePincodeList.get(z.zoneCode) ?? [];
        list.forEach(p => (select ? next.add(p) : next.delete(p)));
      });
      return next;
    });
  }, [filteredZones, zonePincodeList]);

  // 2. Zone level (Column 2 header)
  const allCitiesInZoneSelected = useMemo(() => {
    if (!activeFilteredZoneData || activeFilteredZoneData.cities.length === 0) return false;
    return activeFilteredZoneData.cities.every(c => getCityState(c) === 'all');
  }, [activeFilteredZoneData, getCityState]);

  const someCitiesInZoneSelected = useMemo(() => {
    if (allCitiesInZoneSelected || !activeFilteredZoneData) return false;
    return activeFilteredZoneData.cities.some(c => getCityState(c) !== 'none');
  }, [activeFilteredZoneData, getCityState, allCitiesInZoneSelected]);

  const zoneSelectionState = allCitiesInZoneSelected ? 'all' : (someCitiesInZoneSelected ? 'some' : 'none');

  const toggleAllCitiesInZone = useCallback((select: boolean) => {
    if (!activeFilteredZoneData) return;
    setSelectedPincodes(prev => {
      const next = new Set(prev);
      activeFilteredZoneData.cities.forEach(c => {
        c.pincodes.forEach(p => (select ? next.add(p) : next.delete(p)));
      });
      return next;
    });
  }, [activeFilteredZoneData]);

  // 3. City level (Column 3 header / pill)
  const allPincodesInCitySelected = useMemo(() => {
    if (!activeCityData || activeCityData.pincodes.length === 0) return false;
    return activeCityData.pincodes.every(p => selectedPincodes.has(p));
  }, [activeCityData, selectedPincodes]);

  const somePincodesInCitySelected = useMemo(() => {
    if (allPincodesInCitySelected || !activeCityData) return false;
    return activeCityData.pincodes.some(p => selectedPincodes.has(p));
  }, [activeCityData, selectedPincodes, allPincodesInCitySelected]);

  const citySelectionState = allPincodesInCitySelected ? 'all' : (somePincodesInCitySelected ? 'some' : 'none');

  const toggleAllPincodesInCity = useCallback((select: boolean) => {
    if (!activeCityData) return;
    setSelectedPincodes(prev => {
      const next = new Set(prev);
      activeCityData.pincodes.forEach(p => (select ? next.add(p) : next.delete(p)));
      return next;
    });
  }, [activeCityData]);

  // ── Early returns ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-sm">Loading pincode data…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
        <XCircle className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm">{loadError}</span>
      </div>
    );
  }

  const selectedCount = selectedPincodes.size;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-3">
      {/* ══ STICKY TOP BAR ════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search — expands to fill available left-side space */}
          <div className="relative flex-1 min-w-40" ref={searchBoxRef}>
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4
                               text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={e => {
                const raw = e.target.value;
                // Dynamic mode-switch: first character decides the field's mode.
                // Digit-first → pincode mode (digits only, max 6). Letter-first →
                // city/state mode (letters only, max 25). No mixing, no symbols.
                const sanitized = raw.length === 0
                  ? ''
                  : /\d/.test(raw[0])
                    ? raw.replace(/\D/g, '').slice(0, 6)
                    : raw.replace(/[^a-zA-Z]/g, '').slice(0, 25);
                setSearch(sanitized);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              maxLength={25}
              placeholder="Search city, state or pincode…"
              className="w-full pl-9 pr-7 py-1.5 text-sm border border-slate-200 rounded-lg
                         focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none
                         bg-slate-50 focus:bg-white transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setShowSuggestions(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}

            {/* Autocomplete suggestions */}
            {showSuggestions && search.trim() && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200
                              rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
                {searchSuggestions.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left
                               hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    <span className="text-sm font-medium text-slate-700 truncate">{s.label}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{s.sublabel}</span>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && search.trim() && searchSuggestions.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200
                              rounded-lg shadow-lg z-30 px-3 py-2 text-sm text-slate-400">
                No matching pincode, city or state found.
              </div>
            )}
          </div>

          {/* Selection counter — sits directly to the left of Apply Selection */}
          <div className="flex items-center gap-2 min-w-fit ml-auto">
            <Hash className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-xl font-bold text-blue-600 tabular-nums">
              {selectedCount.toLocaleString()}
            </span>
            <span className="text-sm text-slate-500">pincodes selected</span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPincodes(new Set())}
                className="ml-1 text-xs text-slate-400 hover:text-red-500 transition-colors
                           flex items-center gap-0.5"
              >
                <X className="w-3 h-3" />
                clear all
              </button>
            )}
          </div>

          {/* Confirm CTA */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold
                       rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors
                       disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
                       flex items-center gap-2 whitespace-nowrap shadow-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Apply Selection
          </button>
        </div>
      </div>

      {/* ══ NAVIGATION CHIPS ══════════════════════════════════════════════ */}
      <div className="flex items-center gap-2 pb-2 overflow-x-auto no-scrollbar mask-linear-fade">
        <button
          type="button"
          onClick={() => setActiveRegionFilter('All')}
          className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all whitespace-nowrap
                ${activeRegionFilter === 'All'
              ? 'bg-slate-800 text-white border-slate-800 shadow-md'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
            }`}
        >
          All Zones
        </button>
        {['North', 'South', 'East', 'West', 'Central', 'Northeast', 'Special'].map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRegionFilter(r)}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all whitespace-nowrap
                    ${activeRegionFilter === r
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* ══ THREE-COLUMN WORKSPACE PANE ══════════════════════════════════ */}
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 lg:h-[600px] w-full">
        {/* COLUMN 1: ZONES */}
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm h-[380px] lg:h-full">
          {/* Column Header */}
          <div className="px-3.5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <IndeterminateCheckbox
                state={regionSelectionState}
                onClick={() => toggleAllZonesInRegion(regionSelectionState !== 'all')}
              />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Zones ({filteredZones.length})
              </span>
            </div>
            <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full shrink-0">
              {activeRegionFilter}
            </span>
          </div>

          {/* Zones List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredZones.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No zones found</p>
              </div>
            ) : (
              filteredZones.map(zoneData => {
                const isActive = activeZoneCode === zoneData.zoneCode;
                const zState = getZoneState(zoneData.zoneCode);
                const selInZone = zonePincodeList.get(zoneData.zoneCode)?.filter(p => selectedPincodes.has(p)).length || 0;
                const totalInZone = zonePincodeList.get(zoneData.zoneCode)?.length || 0;

                return (
                  <div
                    key={zoneData.zoneCode}
                    onClick={() => setActiveZoneCode(zoneData.zoneCode)}
                    className={`flex items-center justify-between px-3.5 py-3 cursor-pointer transition-all
                      ${zState !== 'none'
                        ? `bg-blue-100/70 hover:bg-blue-100 ${isActive ? 'border-r-2 border-blue-600' : ''}`
                        : isActive
                        ? 'bg-blue-50/40 border-r-2 border-blue-600'
                        : 'hover:bg-slate-50/80'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IndeterminateCheckbox
                        state={zState}
                        onClick={e => {
                          e.stopPropagation();
                          toggleZone(zoneData.zoneCode, zState !== 'all');
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-extrabold text-slate-800 shrink-0">
                            {zoneData.zoneCode}
                          </span>
                          {zoneData.description && (
                            <span className="text-xs text-slate-400 font-medium truncate max-w-[120px]">
                              {zoneData.description}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {zoneData.cities.length} Cities • {totalInZone} Pincodes
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {selInZone > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          selInZone === totalInZone ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {selInZone}
                        </span>
                      )}
                      <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'text-blue-500 translate-x-0.5' : 'text-slate-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: CITIES */}
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm h-[380px] lg:h-full">
          {/* Column Header */}
          <div className="px-3.5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IndeterminateCheckbox
                  state={zoneSelectionState}
                  onClick={() => toggleAllCitiesInZone(zoneSelectionState !== 'all')}
                />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Cities ({activeFilteredZoneData?.cities.length || 0})
                </span>
              </div>
              {activeZoneCode && (
                <span className="text-[10px] bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded-md shrink-0">
                  Zone {activeZoneCode}
                </span>
              )}
            </div>
            {/* Inner city filter search box */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search cities in this zone..."
                value={cityQuery}
                onChange={e => setCityQuery(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 25))}
                maxLength={25}
                className="w-full pl-8 pr-6 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              {cityQuery && (
                <button type="button" onClick={() => setCityQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>

          {/* Cities List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {!activeFilteredZoneData ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Select a zone to view cities
              </div>
            ) : filteredCities.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No matching cities found
              </div>
            ) : (
              filteredCities.map(cityData => {
                const isActive = activeCityKey === cityData.cityKey;
                const cState = getCityState(cityData);
                const selInCity = cityData.pincodes.filter(p => selectedPincodes.has(p)).length;
                const totalInCity = cityData.pincodes.length;

                return (
                  <div
                    key={cityData.cityKey}
                    onClick={() => setActiveCityKey(cityData.cityKey)}
                    className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-all
                      ${cState !== 'none'
                        ? `bg-blue-100/70 hover:bg-blue-100 ${isActive ? 'border-r-2 border-blue-600' : ''}`
                        : isActive
                        ? 'bg-blue-50/40 border-r-2 border-blue-600'
                        : 'hover:bg-slate-50/80'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IndeterminateCheckbox
                        state={cState}
                        size="sm"
                        onClick={e => {
                          e.stopPropagation();
                          toggleCity(cityData, cState !== 'all');
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-slate-700 truncate">
                          {cityData.city}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {cityData.state} • {totalInCity} Pincodes
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {selInCity > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          selInCity === totalInCity ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {selInCity}
                        </span>
                      )}
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? 'text-blue-500 translate-x-0.5' : 'text-slate-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 3: PINCODES */}
        <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm h-[380px] lg:h-full">
          {/* Column Header */}
          <div className="px-3.5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IndeterminateCheckbox
                  state={citySelectionState}
                  onClick={() => toggleAllPincodesInCity(citySelectionState !== 'all')}
                />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Pincodes ({activeCityData?.pincodes.length || 0})
                </span>
              </div>
              {activeCityData && (
                <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md truncate max-w-[120px] shrink-0">
                  {activeCityData.city}
                </span>
              )}
            </div>
            {/* Inner pincode search filter */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter pincodes..."
                value={pincodeQuery}
                onChange={e => setPincodeQuery(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                className="w-full pl-8 pr-6 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              {pincodeQuery && (
                <button type="button" onClick={() => setPincodeQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>

          {/* Pincodes Grid */}
          <div className="flex-1 overflow-y-auto p-3.5">
            {!activeCityData ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Select a city to view pincodes
              </div>
            ) : filteredPincodes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No pincodes match the filter
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Modern, Effortless "Select All" Capsule Pill */}
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleAllPincodesInCity(citySelectionState !== 'all')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 shadow-sm select-none
                      ${citySelectionState === 'all'
                        ? 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200'
                        : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-50'
                      }`}
                  >
                    {citySelectionState === 'all' ? (
                      <>
                        <X className="w-3.5 h-3.5 text-blue-600" />
                        Deselect All Pincodes
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-blue-600 fill-blue-50" />
                        Select All Pincodes
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {filteredPincodes.map(pc => {
                    const isSel = selectedPincodes.has(pc);
                    return (
                      <button
                        key={pc}
                        type="button"
                        onClick={() => togglePincode(pc)}
                        className={`text-xs font-semibold py-2 rounded-lg border transition-all text-center flex items-center justify-between px-3.5 shadow-sm select-none
                          ${isSel
                            ? 'bg-blue-600 border-blue-600 text-white font-extrabold ring-1 ring-blue-600'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/20'
                          }`}
                      >
                        <span>{pc}</span>
                        {isSel && <CheckCircle className="w-3 h-3 text-white fill-white/10 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div >
  );
};

export default ZoneSelectionWizard;
