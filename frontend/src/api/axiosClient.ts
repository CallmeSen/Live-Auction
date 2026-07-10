import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token && !token.startsWith('demo-')) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = false;
axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status !== 401 || !request || request._retry || refreshing) return Promise.reject(error);
    request._retry = true; refreshing = true;
    try {
      const response = await axios.post(`${axiosClient.defaults.baseURL}/auth/refresh-token`, {}, { withCredentials: true });
      const token = (response.data as { data?: { accessToken?: string } }).data?.accessToken;
      if (!token) throw error;
      localStorage.setItem('accessToken', token);
      request.headers.Authorization = `Bearer ${token}`;
      return axiosClient(request);
    } finally {
      refreshing = false;
    }
  },
);

export default axiosClient;
