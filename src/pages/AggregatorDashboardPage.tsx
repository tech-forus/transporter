// An aggregator organisation's dashboard: bookings only. Every courier's bookings (Delhivery, Blue Dart, ...) in one place, by stage,
// with the same Confirm / Decline / AWB / documents actions a transporter has. Setting the couriers up (logins, rates, pincodes,
// people) is on the Courier lines page (header menu).
import BookingsPage from './BookingsPage';

export default function AggregatorDashboardPage() {
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <h1 className="text-xl font-extrabold text-slate-900 dark:text-white leading-8">Dashboard</h1>
      <BookingsPage linesMode />
    </div>
  );
}
