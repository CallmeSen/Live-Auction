import axiosClient from './axiosClient';
import type { ApiResponse } from './types';

export type CategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface CategoryListRequest {
    page?: number;
    size?: number;
    status?: CategoryStatus;
    keyword?: string;
}

export interface CategoryResponse {
    id: string;
    name: string;
    slug: string;
    status: CategoryStatus;
    createdAt: string;
}

export interface CategoryListResponse {
    items: CategoryResponse[];
    page: number;
    size: number;
    total: number;
}

export interface CreateCategoryRequest {
    name: string;
    slug?: string | null;
}

export interface UpdateCategoryRequest {
    name?: string;
    slug?: string;
    status?: CategoryStatus;
}

export const categoryService = {
    async getCategories(
        params: CategoryListRequest = {},
    ): Promise<CategoryListResponse> {
        const response = await axiosClient.get<
            ApiResponse<CategoryListResponse>
        >('/categories', { params });

        return response.data.data;
    },

    async getCategoryById(
        categoryId: string,
    ): Promise<CategoryResponse> {
        const response = await axiosClient.get<
            ApiResponse<CategoryResponse>
        >(`/categories/${categoryId}`);

        return response.data.data;
    },

    async createCategory(
        payload: CreateCategoryRequest,
    ): Promise<CategoryResponse> {
        const response = await axiosClient.post<
            ApiResponse<CategoryResponse>
        >('/categories', payload);

        return response.data.data;
    },

    async updateCategory(
        categoryId: string,
        payload: UpdateCategoryRequest,
    ): Promise<CategoryResponse> {
        const response = await axiosClient.patch<
            ApiResponse<CategoryResponse>
        >(`/categories/${categoryId}`, payload);

        return response.data.data;
    },

    async deleteCategory(
        categoryId: string,
    ): Promise<void> {
        await axiosClient.delete<ApiResponse<null>>(
            `/categories/${categoryId}`,
        );
    },
};