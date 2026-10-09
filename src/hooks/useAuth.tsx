import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import Cookies from 'js-cookie';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from '../config/apiConfig';
import { getStoredReferral } from '../utils/referral';

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
  kycStatus?: string;
  // Read by useTransporterProfileGate.ts — false only for a Google-signup
  // account that hasn't completed the mandatory-details gate yet. Every
  // other login path's JWT carries `true` (the model's schema default).
  profileComplete?: boolean;
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
  kycStatus?: string;
  profileComplete?: boolean;
  iat?: number;
  exp?: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, pass: string) => Promise<{ success: boolean;  error?: string }>;
  loginWithToken: (token: string) => void;
  // "Continue with Google" — login-only. Backend only ever signs in an
  // EXISTING account matched by verified email; an unrecognized email comes
  // back as a normal error (EMAIL_NOT_FOUND).
  loginWithGoogle: (credential: string) => Promise<{ success: boolean; error?: string }>;
  // "Continue with Google" — SIGNUP variant. Creates a new transporter
  // account when the email isn't registered yet (falls back to a normal
  // sign-in otherwise, same as loginWithGoogle).
  signupWithGoogle: (credential: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  // Merge freshly-saved profile fields into the session snapshot (state +
  // localStorage) so Header/dashboard don't keep showing the login-time JWT
  // values after the transporter edits their profile.
  updateUser: (patch: Partial<AuthUser>) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Root cause of "logged out on refresh": the backend's authToken cookie
    // is deliberately HttpOnly (transporterAuth.js), so it is NEVER visible
    // to document.cookie — js-cookie's Cookies.get('authToken') always
    // returns undefined here, no matter how recently the user logged in.
    // Confirmed with an isolated Playwright repro: a client-side
    // Cookies.set()/document.cookie write to the same cookie name is
    // silently dropped by the browser once a same-name/path HttpOnly cookie
    // already exists (which loginWithToken() below unknowingly attempts on
    // every login). Gating rehydration on that unreadable cookie meant this
    // check failed on every single page refresh, even with a perfectly
    // valid session. localStorage.authUser is the only thing actually
    // written AND readable by JS, and logout() already clears it reliably,
    // so it alone is the correct persistence signal here.
    const storedUser = localStorage.getItem('authUser');

    if (storedUser) {
      try {
        const parsedUser: AuthUser = JSON.parse(storedUser);
        setIsAuthenticated(true);
        setUser(parsedUser);
      } catch (e) {
        console.error("AuthProvider: Failed to parse stored user or token invalid", e);
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

  const loginWithGoogle = async (
    credential: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/transporter/auth/google-login`, { credential });
      if (response.data?.token) {
        loginWithToken(response.data.token);
        return { success: true };
      }
      return { success: false, error: response.data?.message || 'Google sign-in failed.' };
    } catch (error: any) {
      console.error("useAuth loginWithGoogle: API call failed.", error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || error.message || 'Google sign-in failed. Please try again.';
      return { success: false, error: errorMessage };
    }
  };

  const signupWithGoogle = async (
    credential: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/transporter/auth/google-signup`, { credential, referralCode: getStoredReferral() || undefined });
      if (response.data?.token) {
        loginWithToken(response.data.token);
        return { success: true };
      }
      return { success: false, error: response.data?.message || 'Google sign-up failed.' };
    } catch (error: any) {
      console.error("useAuth signupWithGoogle: API call failed.", error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || error.message || 'Google sign-up failed. Please try again.';
      return { success: false, error: errorMessage };
    }
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

  const updateUser = (patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try { localStorage.setItem('authUser', JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const logout = () => {
    Cookies.remove('authToken');
    localStorage.removeItem('authUser');
    setIsAuthenticated(false);
    setUser(null);
  };

  // Session rehydration above is purely local (localStorage), never
  // re-validated against the backend — so if the account is deleted, the
  // token expires, or the session is revoked elsewhere, the UI otherwise
  // stays stuck showing a stale "logged in" shell (header still shows the
  // company name, gated pages still render) while every API call underneath
  // silently 401s. `protectTransporter` (backend) already returns 401 for
  // exactly these cases — no-token, invalid/expired token, and "transporter
  // not found" (deleted account) — so this single global interceptor is the
  // one place that needs to react: any 401 from any axios call means this
  // session is no longer valid, so log out immediately. PrivateRoute then
  // redirects to /transporter-signin on its own next render, reacting to
  // isAuthenticated flipping to false — no manual navigation needed here.
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <AuthContext.Provider value={{ isAuthenticated, user, login, loginWithToken, loginWithGoogle, signupWithGoogle, logout, updateUser, loading }}>
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
