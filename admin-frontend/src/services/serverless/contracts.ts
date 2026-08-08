export type ApiEnvelope<T> = {
  status: number;
  code: string;
  message: string;
  data: T;
};

export class ServerlessApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerlessApiError';
  }
}
