export interface ApiErrorResponse {
  status: number;
  code: number | string;
  message: string;
  data?: unknown;
}
