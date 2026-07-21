import axios from 'axios';
import type { ApiErrorResponse } from '../interfaces/error';

const CONNECTION_ERROR =
    'Không thể kết nối tới máy chủ. Hãy kiểm tra backend đang chạy trên cổng 8000.';

export const getApiErrorMessage = (
    error: unknown,
    fallbackMessage: string,
): string => {
    if (!axios.isAxiosError(error)) {
        return fallbackMessage;
    }

    if (!error.response) {
        return CONNECTION_ERROR;
    }

    const responseData = error.response.data as
        | ApiErrorResponse
        | undefined;

    return responseData?.message ?? fallbackMessage;
};