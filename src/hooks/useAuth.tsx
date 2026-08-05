import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from '../config/apiConfig';

interface JwtPayload {
  _id: string;
  email: string;
  name: string;
  companyName?: string;
  // Display-only network badge(s) + own uploaded logo (from JWT payload).
  networks?: string[];
  networkOther?: string;
  logoUrl?: string;
  contactNumber?: string;
  gstNumber?: string;
  address?: string;
  state?: string;
  pincode?: number;
  pickUpAddress?: string[];
  iat?: number;
  exp?: number;
}

interface AuthUser {
  deliveryMode: any;
  officeEnd: any;
  officeStart: any;
  phone: any;
  websiteLink: any;
  annualTurnover: any;
  maxLoading: any;
  noOfTrucks: any;
  experience: any;
  gstNo: any;
  _id: string;
  email: string;
  name: string;
  companyName?: string;
  // Display-only network badge(s) + own uploaded logo (from JWT payload).
  networks?: string[];
  networkOther?: string;
  logoUrl?: string;
  contactNumber?: string;
  gstNumber?: string;
  address?: string;
  state?: string;
  pincode?: number;
  pickUpAddress?: string[];
  iat?: number;
  exp?: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, pass: string) => Promise<{ success: boolean;  error?: string }>;
  loginWithToken: (token: string) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = Cookies.get('authToken');
    const storedUser = localStorage.getItem('authUser');

    if (token && storedUser) {
      try {
        const parsedUser: AuthUser = JSON.parse(storedUser);
        setIsAuthenticated(true);
        setUser(parsedUser);
      } catch (e) {
        console.error("AuthProvider: Failed to parse stored user or token invalid", e);
        Cookies.remove('authToken');
        localStorage.removeItem('authUser');
      }
    }
    setLoading(false); // Auth state is now determined
  }, []);

  // Decodes a JWT already issued by the backend (signin, or OTP verify) and
  // commits it as the active session — cookie + localStorage + context state.
  const loginWithToken = (token: string) => {
    const decodedToken = jwtDecode<JwtPayload>(token) as unknown as AuthUser;
    setIsAuthenticated(true);
    setUser(decodedToken);
    Cookies.set('authToken', token, { expires: 7 });
    localStorage.setItem('authUser', JSON.stringify(decodedToken));
  };

  const login = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    const lowerEmail = email.toLowerCase();

    // ACTUAL API LOGIN
    try {
      const response = await axios.post(`${API_BASE_URL}/api/transporter/auth/signin`, {
        email: lowerEmail,
        password: pass,
      });

      if (response.data && response.data.token) {
        loginWithToken(response.data.token);
        return { success: true };
      } else {
        return {
          success: false,
          error: response.data.message || 'Login failed: No token in response.',
        };
      }
    } catch (error: any) {
      console.error("useAuth login: API call failed.", error.response?.data || error.message);
      let errorMessage = 'Login failed. Please check your credentials or network.';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return { success: false, error: errorMessage };
    }
  };

  const logout = () => {
    Cookies.remove('authToken');
    localStorage.removeItem('authUser');
    setIsAuthenticated(false);
    setUser(null);
  };

  // When this app is embedded in the freight-compare-frontend host (see
  // TransporterSignupPage.tsx / TransporterFrameContext.tsx there), keep the
  // parent in sync with this transporter's session — who's logged in (so its
  // Header can show a profile/logout dropdown instead of shipper LOGIN/SIGN
  // UP over this same transporter's own dashboard), and let the parent
  // trigger a logout from that dropdown. Lives here in AuthProvider (not a
  // single page) so it fires no matter which route is currently mounted, and
  // is a harmless no-op when opened standalone (window.parent === window).
  useEffect(() => {
    window.parent.postMessage({
      type: isAuthenticated ? 'transporter_authenticated' : 'transporter_logged_out',
      companyName: user?.companyName || '',
      logoUrl: user?.logoUrl || '',
    }, '*');
  }, [isAuthenticated, user?.companyName, user?.logoUrl]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'request_transporter_logout') logout();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, loginWithToken, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
