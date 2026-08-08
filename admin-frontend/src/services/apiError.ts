import axios from 'axios';

const CONNECTION_ERROR =
  'Không thể kết nối tới máy chủ. Hãy kiểm tra backend đang chạy trên cổng 8000.';

type ValidationIssue = {
  msg?: unknown;
  loc?: unknown[];
};

function detailMessage(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail;
  if (!Array.isArray(detail)) return undefined;

  const messages = detail
    .map((issue: ValidationIssue) => typeof issue?.msg === 'string' ? issue.msg : undefined)
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join(' ') : undefined;
}

export const getApiErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof Error && error.name === 'ServerlessApiError') {
    return error.message || fallbackMessage;
  }
  if (!axios.isAxiosError(error)) return fallbackMessage;
  if (!error.response) return CONNECTION_ERROR;

  const responseData = error.response.data as {
    message?: unknown;
    detail?: unknown;
  } | undefined;

  if (typeof responseData?.message === 'string') return responseData.message;
  return detailMessage(responseData?.detail) ?? fallbackMessage;
};
