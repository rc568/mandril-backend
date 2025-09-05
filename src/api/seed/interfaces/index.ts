export interface Catalog {
  name: string;
  slug: string;
}

export interface Category {
  name: string;
  slug: string;
  parentId: null | number;
}

export interface Product {
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  categoryId: number;
  catalogId: number;
}

export interface ProductImages {
  imageUrl: string;
  productVariantId: number;
}

export interface ProductVariant {
  code: string;
  price: number;
  purchasePrice: number;
  quantityInStock: number;
  isActive: boolean;
  productId: number;
}
