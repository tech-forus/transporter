// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth'; // Ensure useAuth.tsx is correct
import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import MainLayout from './components/layout/MainLayout'; // Assuming App.tsx is in src/
import LandingPage from './pages/LandingPage';
import SignUpPage from './pages/SignUpPage';
import SignInPage from './pages/SignInPage';
import Dashboard from './pages/Dashboard';
import BiddingDetails from './pages/BiddingDetails';
import ProfilePage from './pages/ProfilePage';
import AddPrice from './pages/AddPrice';
import VerifyOtpPage from './pages/VerifyOtpPage';
import { useEmbeddedTheme } from './hooks/useEmbeddedTheme';



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
function App() {
  useEmbeddedTheme();
  return (
    <AuthProvider> {/* AuthProvider now wraps everything */}
        <Router>
        {/* react-hot-toast has no built-in swipe-to-dismiss — a validation
            error toast (e.g. AddPrice.tsx's "Please fill in: ...") otherwise
            only goes away on its own timer. Reported live 2026-09-22: "this
            warning i cant remove by swiping". Wrapping each toast in a
            draggable div adds that without touching the toast's own look —
            ToastBar renders the exact same content/styling as plain
            <Toaster/> did. touchAction: 'pan-y' keeps page scroll working;
            only horizontal drag is captured for the swipe gesture itself. */}
        <Toaster>
          {(t) => (
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.85}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) {
                  toast.dismiss(t.id);
                }
              }}
              style={{ touchAction: 'pan-y' }}
            >
              <ToastBar toast={t} />
            </motion.div>
          )}
        </Toaster>
        <Routes>
          <Route path='/' element={<MainLayout><LandingPage /></MainLayout>} />
          <Route path="/transporter-signin" element={<PublicRoute><MainLayout><SignInPage /></MainLayout></PublicRoute>} />
          <Route path="/transporter-signup" element={<PublicRoute><MainLayout><SignUpPage /></MainLayout></PublicRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><MainLayout><Dashboard /></MainLayout></PrivateRoute>} />
          <Route path="/bidding/details/:id" element={<PrivateRoute><MainLayout><BiddingDetails /></MainLayout></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><MainLayout><ProfilePage /></MainLayout></PrivateRoute>} />
          <Route path="/addprice" element={<MainLayout><AddPrice /></MainLayout>} />
          <Route path="/transporter-verify-otp" element={<MainLayout><VerifyOtpPage /></MainLayout>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;