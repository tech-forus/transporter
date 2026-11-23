// A "delivery pincode + price" sheet (what a transporter usually sends): one row per destination pincode with its zone, whether it is ODA,
// and ONE price per kg for that zone, measured from the transporter's own origin zone. Read here without any AI: it gives
//   * the service area (pincode -> zone, ODA), and
//   * one price per destination zone, which becomes one ROW of the zone-rate table (from the origin zone to each zone).
// Returns null when the sheet is not of this kind, so the other readers get their turn.
export interface PincodePriceSheet {
  service: { pincode: number; zone: string; isOda: boolean }[];
  destinationPrices: Record<string, number>;
  /** Zones in the order they first appear. */
  zones: string[];
  /** The cheapest zone is, in practice, the local one the prices are measured from. The user can change it. */
  originGuess: string;
  /** Zones whose rows did not all carry the same price (the most common one was used). */
  mixedZones: string[];
  /** Rows left out: bad pincode, no zone, or no price. */
  skipped: number;
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
const isPincodeHeader = (h: string) => h === 'pincode' || h === 'pin' || h === 'pincodes' || h === 'deliverypincode' || h === 'destinationpincode';
const isZoneHeader = (h: string) => h === 'zone' || h === 'zones' || h === 'destinationzone';
const isOdaHeader = (h: string) => h === 'oda' || h === 'isoda' || h === 'odaflag';
const isPriceHeader = (h: string) => /(price|rate|perkg)/.test(h) && !h.includes('oda') && !/(pin|zone)/.test(h);

export function parsePincodePriceRows(rows: unknown[][]): PincodePriceSheet | null {
  let headerRow = -1;
  let col = { pin: -1, zone: -1, oda: -1, price: -1 };
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const h = (rows[i] || []).map(norm);
    const pin = h.findIndex(isPincodeHeader), zone = h.findIndex(isZoneHeader), price = h.findIndex(isPriceHeader);
    if (pin >= 0 && zone >= 0 && price >= 0) { headerRow = i; col = { pin, zone, price, oda: h.findIndex(isOdaHeader) }; break; }
  }
  if (headerRow < 0) return null;

  const service: PincodePriceSheet['service'] = [];
  const seen = new Set<number>();
  const prices = new Map<string, Map<number, number>>();
  const zones: string[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerRow + 1)) {
    if (!r || r.every((c) => c === '' || c == null)) continue;
    const pin = String(r[col.pin] ?? '').trim();
    const zone = String(r[col.zone] ?? '').trim();
    const price = Number(r[col.price]);
    if (!/^[1-9]\d{5}$/.test(pin) || !zone || !(price > 0) || !Number.isFinite(price)) { skipped += 1; continue; }
    if (seen.has(Number(pin))) continue; // the same pincode twice: the first row counts
    seen.add(Number(pin));
    service.push({ pincode: Number(pin), zone, isOda: col.oda >= 0 && /^(yes|y|true|1)$/i.test(String(r[col.oda] ?? '').trim()) });
    if (!prices.has(zone)) { prices.set(zone, new Map()); zones.push(zone); }
    const m = prices.get(zone)!;
    m.set(price, (m.get(price) || 0) + 1);
  }
  if (!service.length) return null;

  const destinationPrices: Record<string, number> = {};
  const mixedZones: string[] = [];
  for (const [zone, m] of prices) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    destinationPrices[zone] = ranked[0][0];
    if (m.size > 1) mixedZones.push(zone);
  }
  const originGuess = zones.reduce((best, z) => (destinationPrices[z] < destinationPrices[best] ? z : best), zones[0]);
  return { service, destinationPrices, zones, originGuess, mixedZones, skipped };
}
