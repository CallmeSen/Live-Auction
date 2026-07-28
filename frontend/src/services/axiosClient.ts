import axios, {
    type InternalAxiosRequestConfig,
} from 'axios';
import { logoutSession } from '../store/authStore';

const axiosClient = axios.create({
    baseURL:
        import.meta.env.VITE_API_BASE_URL ??
        'http://localhost:8000/api/v1',
    headers: {
        Accept: 'application/json',
    },
});

axiosClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const accessToken =
            localStorage.getItem('accessToken');

        if (accessToken) {
            config.headers.Authorization =
                `Bearer ${accessToken}`;
        }

        return config;
    },
);

axiosClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            const requestUrl = error.config?.url ?? '';
            const isAuthRequest =
                requestUrl.includes('/auth/login') ||
                requestUrl.includes('/auth/register');

            if (!isAuthRequest) {
                logoutSession();

                if (window.location.pathname !== '/login') {
                    window.location.replace('/login');
                }
            }
        }

        return Promise.reject(error);
    },
);

export default axiosClient;
