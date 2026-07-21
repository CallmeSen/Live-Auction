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
