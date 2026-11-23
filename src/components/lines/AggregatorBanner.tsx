// Shown on an aggregator's dashboard instead of "Add your rates": an aggregator sells through its courier lines, so that is where
// the rates, staff, pincodes and tracking links are set up.
import { Link } from 'react-router-dom';
import { ArrowRight, Truck } from 'lucide-react';

export default function AggregatorBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-900/10">
      <div className="flex items-start gap-3">
        <Truck size={20} className="mt-0.5 text-blue-700" />
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Add your couriers</p>
          <p className="text-xs text-slate-600 dark:text-[#8fb0cf]">Each courier you sell (Delhivery, Blue Dart, ...) is a courier line with its own rates, pincodes, team and login. Shippers see them once a line has rates and pincodes.</p>
        </div>
      </div>
      <Link to="/lines" className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Courier lines <ArrowRight size={14} /></Link>
    </div>
  );
}
