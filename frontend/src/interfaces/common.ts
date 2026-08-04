export interface ApiResponse<T> {
  status: number;
  code: string | number;
  message: string;
  data: T;
}