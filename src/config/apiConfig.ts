// src/config/apiConfig.ts

const isLocalhost = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1'
);

export const API_BASE_URL = isLocalhost 
  ? 'http://localhost:8000' 
  : 'https://freight-compare-backend-production.up.railway.app';
