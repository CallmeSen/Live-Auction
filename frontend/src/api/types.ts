export interface ApiEnvelope<T> {
  status: number;
  code: number | string;
  message: string;
  data: T;
}

export interface ApiErrorEnvelope {
  status?: number;
  code?: number | string;
  message?: string;
}
