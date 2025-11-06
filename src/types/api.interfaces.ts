export interface ProductsOptions {
  page?: number;
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  orderBy?: string;
  categoryId?: number;
  catalogId?: number;
  isActive?: boolean;
}
