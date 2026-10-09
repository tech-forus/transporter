// src/pages/BidsPage.tsx
//
// Own page for the bidding-marketplace list — same "Back to Profile" +
// page-header shell as RatesPage.tsx, so it reads as a sibling of Lane
// Rates rather than buried inline inside the profile itself.

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../config/apiConfig';
import { useReportIframeHeight } from '../hooks/useReportIframeHeight';
import AvailableBidsSection from '../components/AvailableBidsSection';

axios.defaults.withCredentials = true;

const BidsPage: React.FC = () => {
  const { user } = useAuth();
  // accountType isn't in the JWT (see Dashboard.tsx's original comment on
  // this exact fetch) — resolved once here, same as it was there.
  const [isIndividual, setIsIndividual] = useState(false);
  useEffect(() => {
    if (!user?._id) return;
    axios
      .get<{ success: boolean; data: { accountType?: 'business' | 'individual' } }>(
        `${API_BASE_URL}/api/transporter/profile/${user._id}`
      )
      .then((res) => setIsIndividual(res.data.data.accountType === 'individual'))
      .catch(() => {/* defaults to business copy */});
  }, [user?._id]);
  useReportIframeHeight([isIndividual]);

  return (
    <div className="bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-blue-600 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to Profile
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Available Bids</h1>
        <p className="text-sm text-slate-500 mb-5">
          Bids matching your service zones.
        </p>

        <AvailableBidsSection isIndividualAccount={isIndividual} />
      </div>
    </div>
  );
};

export default BidsPage;
