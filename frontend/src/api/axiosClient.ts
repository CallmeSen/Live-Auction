import axios, { type InternalAxiosRequestConfig } from 'axios';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

axiosClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token && !token.startsWith('demo-')) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default axiosClient;
