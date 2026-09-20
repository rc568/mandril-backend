export const VARIANT_PREFIX = 'MI';
export const VARIANT_CODE_REGEX = /^MI\d{3}$/;
export const ADMIN_PRODUCT_ORDER_BY_OPTIONS = ['price_asc', 'price_desc'] as const;
export const PUBLIC_PRODUCT_ORDER_BY_OPTIONS = ['price_asc', 'price_desc', 'name_asc', 'name_desc'] as const;

export const DEFAULT_LIMIT_SEARCH_VARIANTS = 20;
export const PAGINATION_LIMITS_SEARCH_VARIANTS = [10, 20, 40] as const;

export const PRODUCT_IMAGE_LIMITS = {
  maxFileSize: 5 * 1024 * 1024,
  maxImages: 10,
  maxPixels: 20_000_000,
  maxDimension: 1600,
  quality: 82,
  maxConcurrentUploads: 2,
} as const;
