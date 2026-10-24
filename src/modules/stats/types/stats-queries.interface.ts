import type { OrderStatus } from '@/modules/order';
import type { PaginationQueryBase } from '@/shared/domain';
import type { ColdProductsOrderBy, RankingProductsOrderBy } from '../domain';

export interface DateRangeBase {
  start: Date;
  end: Date;
}

export interface RankingProducts extends DateRangeBase, PaginationQueryBase {
  orderBy: RankingProductsOrderBy;
}

export interface ColdProducts extends PaginationQueryBase {
  orderBy: ColdProductsOrderBy;
}

export interface GeneralSalesSummary extends DateRangeBase {
  channelId?: number;
}

export interface SalesChannelSummary extends DateRangeBase {}

export interface EvolutionSalesChart extends DateRangeBase {
  interval: string;
  period: string;
  channelId?: number;
}
