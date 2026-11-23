// Has this transporter saved any rates yet, and where do they go to add them?
// Business accounts set up through the same AddPrice wizard as normal signup
// (upload-first, then zone matrix); owner-operators through the same lane step
// as normal signup (SetupLanesPage). A Google signup skips both, so the
// dashboard, Rates page and Go-public card use this to send them there.
//
// `needsSetup` is what drives every nudge/redirect. It is true ONLY for accounts
// that can be missing rates by design — Google sign-ups and shipper-invited
// (referral) accounts. Legacy carriers (DTDC, Safexpress, Gati, …) have no
// `prices` row because their rates live elsewhere (UTSF), so "no rates here"
// must never tell them they can't be booked or route them into a new rate card.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';

export const rateSetupPath = (individual: boolean) => (individual ? '/setup/lanes' : '/addprice');

/** After the Google profile step: rates for a business, lanes for an owner-operator, the courier lines for an aggregator. */
export const pathAfterProfile = (accountType: 'business' | 'individual', orgType?: 'transporter' | 'aggregator') =>
  (accountType === 'business' && orgType === 'aggregator' ? '/lines' : rateSetupPath(accountType === 'individual'));

export function useRateSetup() {
  // null = still loading (or the check failed) — callers show nothing rather than a wrong nudge.
  const [hasRates, setHasRates] = useState<boolean | null>(null);
  const [individual, setIndividual] = useState(false);
  const [selfServe, setSelfServe] = useState(false);
  // An aggregator sells through its courier lines, which have their own rates: it is never asked for rates of its own.
  const [isAggregator, setIsAggregator] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE_URL}/api/transporter/price/me/config`, { withCredentials: true }),
      axios.get(`${API_BASE_URL}/api/transporter/auth/me`, { withCredentials: true }),
    ])
      .then(([config, me]) => {
        const d = config.data?.data || {};
        const isInd = Array.isArray(d.lanes);
        setIndividual(isInd);
        setHasRates(isInd
          ? d.lanes.length > 0
          : Object.values(d.zoneRates || {}).some((row: any) => Object.values(row || {}).some((v) => Number(v) > 0)));
        const t = me.data?.transporter || {};
        setSelfServe(!!t.googleId || t.origin === 'shipper_referral');
        setIsAggregator(t.orgType === 'aggregator' && !t.parentId);
      })
      .catch(() => setHasRates(null))
      .finally(() => setLoaded(true));
  }, []);

  return {
    hasRates,
    needsSetup: selfServe && hasRates === false && !isAggregator,
    isAggregator,
    individual,
    loaded,
    setupPath: rateSetupPath(individual),
  };
}
