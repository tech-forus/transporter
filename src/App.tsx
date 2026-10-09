// src/App.tsx
import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './hooks/useAuth'; // Ensure useAuth.tsx is correct
import { Toaster } from 'react-hot-toast';
import MainLayout from './components/layout/MainLayout'; // Assuming App.tsx is in src/
import LandingPage from './pages/LandingPage';
import SignUpPage from './pages/SignUpPage';
import SignInPage from './pages/SignInPage';
import BiddingDetails from './pages/BiddingDetails';
import ProfilePage from './pages/ProfilePage';
import RatesPage from './pages/RatesPage';
import BidsPage from './pages/BidsPage';
import BookingsPage from './pages/BookingsPage';
import AddPrice from './pages/AddPrice';
import VerifyOtpPage from './pages/VerifyOtpPage';
import TransporterKycPage from './pages/TransporterKycPage';
import FleetPage from './pages/FleetPage';
import KycGate from './components/KycGate';
import ReferralBanner from './components/ReferralBanner';
import ReferralAttachGate from './components/ReferralAttachGate';
import GoPublicPage from './pages/GoPublicPage';
import RatesEditorPage from './pages/RatesEditorPage';
import { captureReferralFromUrl } from './utils/referral';

// Remember a shipper invite code the moment the app loads — an already-signed-in transporter
// following an invite link is redirected off /transporter-signup before any banner could read it.
captureReferralFromUrl();
import CompleteTransporterProfileModal from './components/CompleteTransporterProfileModal';
import { useNeedsTransporterProfileGate } from './hooks/useTransporterProfileGate';



export const PrivateRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="text-center mt-20 text-gray-600">Loading...</div>; // Replace with spinner if needed
  }

  return (isAuthenticated) ? <>{children}</> : <Navigate to="/transporter-signin" replace />;
};


export const PublicRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="text-center mt-20 text-gray-600">Loading...</div>;
  }

  return (isAuthenticated)? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

// Lets the host page (freight-compare-frontend's TransporterProfileDropdown,
// when this app is embedded in its iframe) drive this app's own router — e.g.
// its "Profile" menu item, since it has no route of its own to link to, just
// tells this iframe to go to /profile. Needs to live inside <Router> for
// useNavigate() to work, unlike the logout listener in useAuth.tsx which
// only needs to flip auth state.
// A Google-signup transporter with an incomplete profile shouldn't get
// access to any app feature until the gate is cleared — mirrors
// freight-compare-frontend's ShipperProfileGate exactly.
const TransporterProfileGate: React.FC = () => {
  const { user } = useAuth();
  const { needsGate } = useNeedsTransporterProfileGate();

  if (!needsGate || !user) return null;
  return (
    <CompleteTransporterProfileModal
      email={(user as any).email || ''}
      firstNameHint=""
      onComplete={() => { /* loginWithToken (inside the modal) already refreshed the decoded user's profileComplete, unmounting this */ }}
    />
  );
};

const HostNavigationListener: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'request_transporter_navigate' && typeof event.data.path === 'string') {
        navigate(event.data.path);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate]);
  return null;
};

// Empty string is a safe fallback: GoogleOAuthProvider only breaks the app
// if a consumer actually renders <GoogleLogin> without a real client ID —
// same pattern freight-compare-frontend's App.tsx already uses.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <AuthProvider> {/* AuthProvider now wraps everything */}
        <Router>
        <Toaster />
        <HostNavigationListener />
        <TransporterProfileGate />
        <ReferralAttachGate />
        <Routes>
          <Route path='/' element={<MainLayout><LandingPage /></MainLayout>} />
          <Route path="/transporter-signin" element={<PublicRoute><MainLayout><SignInPage /></MainLayout></PublicRoute>} />
          <Route path="/transporter-signup" element={<PublicRoute><MainLayout compact><ReferralBanner /><SignUpPage /></MainLayout></PublicRoute>} />
          {/* /dashboard is where an authenticated transporter always lands
              (see PublicRoute above) — shows the real direct-booking feed.
              The old bidding-marketplace "Available Bids" list moved to its
              own page at /profile/bids, linked from ProfilePage.tsx. */}
          {/* KycGate now sits INSIDE MainLayout (not wrapping it) — Header/
              Footer stay visible and usable while a blocked transporter sees
              only the page body blurred behind the KYC wizard overlay. */}
          <Route path="/dashboard" element={<PrivateRoute><MainLayout><KycGate><BookingsPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/go-public" element={<PrivateRoute><MainLayout fillScreen><KycGate><GoPublicPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/profile/rates/edit" element={<PrivateRoute><MainLayout><KycGate><RatesEditorPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/bidding/details/:id" element={<PrivateRoute><MainLayout><KycGate><BiddingDetails /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><MainLayout><KycGate><ProfilePage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/profile/rates" element={<PrivateRoute><MainLayout><KycGate><RatesPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/profile/fleet" element={<PrivateRoute><MainLayout><KycGate><FleetPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/profile/bids" element={<PrivateRoute><MainLayout><KycGate><BidsPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/bookings" element={<PrivateRoute><MainLayout><KycGate><BookingsPage /></KycGate></MainLayout></PrivateRoute>} />
          <Route path="/transporter-kyc" element={<PrivateRoute><MainLayout><TransporterKycPage /></MainLayout></PrivateRoute>} />
          <Route path="/addprice" element={<MainLayout><AddPrice /></MainLayout>} />
          <Route path="/transporter-verify-otp" element={<MainLayout><VerifyOtpPage /></MainLayout>} />
        </Routes>
      </Router>
    </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;