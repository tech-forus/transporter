// transporter-main/src/hooks/useTransporterProfileGate.ts
//
// A Google-signup transporter account (profileComplete === false, present
// on the decoded JWT) must finish the mandatory-details modal before
// anything else in the app — mirrors freight-compare-frontend's
// useShipperProfileGate.ts exactly, adapted to this app's useAuth shape
// (a decoded-JWT `user` object, not a `{ customer }` wrapper, and no
// `loading`-gated isAuthenticated check needed beyond what this app's own
// AuthProvider already resolves before rendering routes).
import { useAuth } from './useAuth';

export const useNeedsTransporterProfileGate = () => {
  const { isAuthenticated, loading, user } = useAuth();
  const needsGate = !loading && isAuthenticated && !!user && user.profileComplete === false;
  return { needsGate, transporterObj: user };
};
