// src/pages/TransporterKycPage.tsx
// Standalone full-page host for the KYC wizard — used by the exempt-account
// nudge banner's "Complete now" link (that case isn't blocking, so a plain
// page is fine). The blocking case renders the same wizard as an overlay
// instead — see KycGate.tsx.
import { useNavigate } from 'react-router-dom';
import KycWizardCard from '../components/KycWizardCard';

export default function TransporterKycPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <KycWizardCard onComplete={() => navigate('/dashboard', { replace: true })} />
    </div>
  );
}
