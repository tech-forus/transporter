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

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export default http;
