// src/config/apiConfig.ts

const isLocalhost = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
);

// Where the backend lives. VITE_API_BASE_URL (set at build time, e.g. in Netlify's environment for a staging
// deploy) wins when present; with it unset nothing changes: localhost talks to the local backend and every
// other host talks to production. Before this override, a deployed portal could ONLY ever call production.
const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export const API_BASE_URL = fromEnv
  ? fromEnv
  : isLocalhost
    ? 'http://localhost:8000'
    : 'https://api.freightcompare.ai';
