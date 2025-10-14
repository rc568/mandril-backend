import type { ADMIN_PRODUCT_ORDER_BY_OPTIONS, PUBLIC_PRODUCT_ORDER_BY_OPTIONS } from './product.constants';

export type AdminProductOrderByOption = (typeof ADMIN_PRODUCT_ORDER_BY_OPTIONS)[number];
export type PublicProductOrderByOption = (typeof PUBLIC_PRODUCT_ORDER_BY_OPTIONS)[number];
