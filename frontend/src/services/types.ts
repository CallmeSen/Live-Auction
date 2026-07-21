export interface ApiResponse<T> {
    status: number;
    code: number | string;
    message: string;
    data: T;
}

export interface ApiErrorResponse {
    status: number;
    code: number | string;
    message: string;
    data?: unknown;
}