import type { OrderStatus } from '@/modules/order/domain';
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
  status?: OrderStatus;
}

export interface SalesChannelSummary extends DateRangeBase {
  status?: OrderStatus;
}

export interface EvolutionSalesChart extends DateRangeBase {
  interval: string;
  period: string;
  channelId?: number;
  status?: OrderStatus;
}
