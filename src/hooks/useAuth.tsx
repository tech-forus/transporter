import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';
import http from '../lib/http';

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

// Origins of the FreightCompare app that may hand this app a session:
// the Android app's WebView (https://localhost), iOS, local dev, and the website.
const FC_HOST_ORIGINS = [
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:3000',
  'https://freightcompare.ai',
  'https://www.freightcompare.ai',
  'https://freight-compare-frontend.vercel.app',
];

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
      const response = await http.post('/api/transporter/auth/signin', {
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
      // The FreightCompare app's own transporter login form signed this
      // transporter in and is handing over the session token (see its
      // TransporterFrameContext.tsx). Only from the embedding parent, and
      // only from a known FreightCompare origin, so no other page that
      // embeds this app can push a session into it.
      if (
        event.data?.type === 'fc_transporter_session' &&
        typeof event.data.token === 'string' &&
        event.source === window.parent &&
        FC_HOST_ORIGINS.includes(event.origin)
      ) {
        try {
          loginWithToken(event.data.token);
        } catch (e) {
          console.error('AuthProvider: rejected handed-off session token', e);
        }
      }
    };
    window.addEventListener('message', handler);
    // Tells the host this app can now take a handed-off session.
    if (window.parent !== window) window.parent.postMessage({ type: 'transporter_session_ready' }, '*');
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
