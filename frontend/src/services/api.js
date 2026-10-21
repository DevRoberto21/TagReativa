import axios from 'axios';
import { markSignedOut } from '../utils/session';

// Same-origin on purpose: the Vite proxy (dev) and the Vercel rewrite (prod)
// forward /api to the backend, so the session cookie stays first-party.
const api = axios.create({ baseURL: '/api' });

// Pending-request count for the global progress bar. Requests sent with
// `silent: true` (the warm-up ping) do not count.
let pending = 0;
const listeners = new Set();
function track(config, delta) {
  if (config?.silent) return;
  pending += delta;
  listeners.forEach((fn) => fn());
}
export function subscribePending(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const getPending = () => pending;

api.interceptors.request.use((config) => {
  track(config, 1);
  return config;
});

api.interceptors.response.use(
  (response) => {
    track(response.config, -1);
    return response;
  },
  (error) => {
    track(error.config, -1);
    const isPublicRoute = /^\/(scan|s)\//i.test(window.location.pathname);
    const isTwoFactorDisable = error.config?.url?.includes('/auth/2fa/disable');
    const isLogin = error.config?.url?.startsWith('/auth/login');
    if (error.response?.status === 401 && !isPublicRoute && !isTwoFactorDisable && !isLogin) {
      markSignedOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
