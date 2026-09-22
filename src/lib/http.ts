// src/lib/http.ts
//
// Shared axios instance with a default timeout. Added 2026-09-18: every
// network call in this app used a bare `axios.post/get` with NO timeout,
// meaning a slow/dead connection just hung forever with no error and no
// feedback -- the exact same bug class that already caused a real
// production incident on the main FreightCompare app's signup/OTP flow
// (see that repo's authController.js/SignupForm.tsx fix). This fixes it
// here at the source instead of adding a timeout to every call site.
import axios from 'axios';
import { API_BASE_URL } from '../config/apiConfig';

// withCredentials: true is required on EVERY call, including login itself —
// without it here, a cross-origin POST (this app always runs on a different
// origin than the API, embedded in the FreightCompare host) sends no
// credentials, so the browser won't accept the backend's Set-Cookie
// response at all. useAuth.tsx's login() never set this, so the sign-in
// call itself never actually established a session cookie — the returned
// token still worked for in-memory Dashboard state (decoded straight from
// the response body), but any later call needing that cookie (like
// ProfilePage.tsx's own GET /me) 401'd with no session to check. Confirmed
// live 2026-09-22: a manual fetch with credentials:'include' at login time
// DID get a working cookie; the same call through this client, without it,
// didn't. Set once here as the instance default so no future call site can
// make the same mistake — same pattern the main FreightCompare app's own
// axiosSetup.ts already uses (axios.defaults.withCredentials = true).
const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export default http;
