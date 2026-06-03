// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth'; // Ensure useAuth.tsx is correct
import { Toaster } from 'react-hot-toast';
import MainLayout from './components/layout/MainLayout'; // Assuming App.tsx is in src/
import LandingPage from './pages/LandingPage';
import SignUpPage from './pages/SignUpPage';
import SignInPage from './pages/SignInPage';
import Dashboard from './pages/Dashboard';
import BiddingDetails from './pages/BiddingDetails';
import ProfilePage from './pages/ProfilePage';
import AddPrice from './pages/AddPrice';



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
  return (
    <AuthProvider> {/* AuthProvider now wraps everything */}
        <Router>
        <Toaster />
        <Routes>
          <Route path='/' element={<MainLayout><LandingPage /></MainLayout>} />
          <Route path="/transporter-signin" element={<PublicRoute><MainLayout><SignInPage /></MainLayout></PublicRoute>} />
          <Route path="/transporter-signup" element={<PublicRoute><MainLayout><SignUpPage /></MainLayout></PublicRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><MainLayout><Dashboard /></MainLayout></PrivateRoute>} />
          <Route path="/bidding/details/:id" element={<PrivateRoute><MainLayout><BiddingDetails /></MainLayout></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><MainLayout><ProfilePage /></MainLayout></PrivateRoute>} />
          <Route path="/addprice" element={<MainLayout><AddPrice /></MainLayout>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;