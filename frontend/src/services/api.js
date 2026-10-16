import axios from 'axios';

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error('VITE_API_URL não definido.');
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isPublicRoute = /^\/(scan|s)\//i.test(window.location.pathname);
    const isTwoFactorDisable = error.config?.url?.includes('/auth/2fa/disable');
    if (error.response?.status === 401 && !isPublicRoute && !isTwoFactorDisable) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;