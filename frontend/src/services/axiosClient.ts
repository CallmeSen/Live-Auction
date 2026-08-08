import axios from 'axios';
import { runtimeConfig } from '../config/runtime';

const axiosClient = axios.create({
  baseURL: `${runtimeConfig.restApiUrl}/api/v1`,
  headers: {
    Accept: 'application/json',
  },
});

const getCognitoToken = (): string | null => {
  const lastAuthUserKey = Object.keys(localStorage).find((key) =>
    key.endsWith('.LastAuthUser'),
  );

  if (!lastAuthUserKey) return null;

  const username = localStorage.getItem(lastAuthUserKey);
  if (!username) return null;

  const prefix = lastAuthUserKey.replace('.LastAuthUser', '');
  return (
    localStorage.getItem(`${prefix}.${username}.idToken`) ??
    localStorage.getItem(`${prefix}.${username}.accessToken`)
  );
};

axiosClient.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('accessToken') ??
    getCognitoToken();

  const apiKey = runtimeConfig.restApiKey;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (apiKey) {
    config.headers['x-api-key'] = apiKey;
  }

  return config;
});

export default axiosClient;