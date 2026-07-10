export const VARIANT_PREFIX = 'MI';
export const VARIANT_CODE_REGEX = /^MI\d{3}$/;
export const ADMIN_PRODUCT_ORDER_BY_OPTIONS = ['price_asc', 'price_desc'] as const;
export const PUBLIC_PRODUCT_ORDER_BY_OPTIONS = ['price_asc', 'price_desc', 'name_asc', 'name_desc'] as const;

export const DEFAULT_LIMIT_SEARCH_VARIANTS = 20;
export const PAGINATION_LIMITS_SEARCH_VARIANTS = [10, 20, 40] as const;
