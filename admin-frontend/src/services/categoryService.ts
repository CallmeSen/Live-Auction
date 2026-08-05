import { createDefaultCategoryList } from '../defaults/categoryDefaults';
import type {
    CategoryListRequest,
    CategoryListResponse,
    CategoryResponse,
    CreateCategoryRequest,
    UpdateCategoryRequest,
} from '../interfaces/category';
import type { ApiResponse } from '../interfaces/common';
import axiosClient from './axiosClient';

export const categoryService = {
    async getCategories(
        params: CategoryListRequest = {},
    ): Promise<CategoryListResponse> {
        try {
            const response = await axiosClient.get<
                ApiResponse<CategoryListResponse>
            >('/categories', { params });

            return response.data.data;
        } catch {
            return createDefaultCategoryList(params);
        }
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