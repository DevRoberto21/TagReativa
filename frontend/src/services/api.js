import axios from 'axios';
import { markSignedOut } from '../utils/session';

// Same-origin on purpose: the Vite proxy (dev) and the Vercel rewrite (prod)
// forward /api to the backend, so the session cookie stays first-party.
const api = axios.create({ baseURL: '/api' });

api.interceptors.response.use(
  (response) => response,
  (error) => {
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
