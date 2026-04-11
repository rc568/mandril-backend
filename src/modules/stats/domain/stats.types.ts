import type { COLD_PRODUCTS_ORDER_BY_OPTIONS, RANKING_PRODUCTS_ORDER_BY_OPTIONS } from './stats.constants';

export type RankingProductsOrderBy = (typeof RANKING_PRODUCTS_ORDER_BY_OPTIONS)[number];
export type ColdProductsOrderBy = (typeof COLD_PRODUCTS_ORDER_BY_OPTIONS)[number];
