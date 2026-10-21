// First-time lane setup for an owner-operator who signed up with Google — the
// same IndividualLaneRatesStep (manual / bulk / area) normal signup uses, saved
// through the existing authenticated PUT /price/me instead of the signup-only
// account creation. Not behind KycGate, so rates come before KYC exactly as in
// normal signup.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import IndividualLaneRatesStep, { type LaneRate } from '../components/IndividualLaneRatesStep';
import { API_BASE_URL } from '../config/apiConfig';
import { useRateSetup } from '../hooks/useRateSetup';
import SetupProgressPanel, { type SetupStep } from '../components/SetupProgressPanel';

export default function SetupLanesPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const { hasRates, individual, loaded } = useRateSetup();

  const save = async (lanes: LaneRate[]) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      // confirmed: a first-time setup has no earlier rates for shippers to re-confirm.
      await axios.put(`${API_BASE_URL}/api/transporter/price/me`, { lanes, confirmed: true }, { withCredentials: true });
      toast.success('Your lanes are saved.');
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      const errs: string[] | undefined = e?.response?.data?.errors;
      toast.error(errs?.[0] || e?.response?.data?.message || 'Could not save your lanes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // PUT /price/me replaces the whole lane list, so this page is for first-time setup only.
  if (!loaded) return <div className="text-center mt-20 text-gray-600">Loading...</div>;
  if (hasRates === null) return <div className="text-center mt-20 text-red-600">Could not load your rates. Please refresh and try again.</div>;
  if (hasRates || !individual) return <Navigate to={hasRates ? '/profile/rates/edit' : '/addprice'} replace />;

  const steps: SetupStep[] = [
    { key: 'company', label: 'Company details', status: 'done' },
    { key: 'lanes', label: 'Lanes & prices', status: 'current', hint: 'Manual, bulk sheet or by area' },
    { key: 'kyc', label: 'KYC documents', status: 'todo', hint: 'Next, after you save' },
  ];

  return (
    <div className="max-w-7xl mx-auto py-2 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start lg:gap-4">
      <div className="min-w-0">
        <IndividualLaneRatesStep onBack={() => navigate('/dashboard')} onContinue={save} submitting={submitting} />
      </div>
      <SetupProgressPanel steps={steps} className="hidden lg:block" />
    </div>
  );
}
