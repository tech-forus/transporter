// An aggregator organisation's dashboard: bookings only. Every courier's bookings (Delhivery, Blue Dart, ...) in one place, by stage,
// with the same Confirm / Decline / AWB / documents actions a transporter has. Setting the couriers up (logins, rates, pincodes,
// people) is on the Courier lines page.
import { Link } from 'react-router-dom';
import OrgDashboard from '../components/lines/OrgDashboard';
import BookingsPage from './BookingsPage';

export default function AggregatorDashboardPage() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white leading-8">Dashboard</h1>
        <OrgDashboard />
        <Link to="/lines" className="ml-auto text-xs font-bold text-blue-700 hover:underline leading-8">Manage couriers, rates and people</Link>
      </div>
      <BookingsPage linesMode />
    </div>
  );
}
