export interface ApiResponse<T> {
  status: number;
  code: number;
  message: string;
  data: T;
}