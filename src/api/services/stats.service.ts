import { db } from '../../db';
import {
  coldProductsQuery,
  countColdProductsQuery,
  countRankingProductsQuery,
  evolutionSalesChart,
  generalSalesSummary,
  inventoryQuery,
  rankingProductsQuery,
  salesChannelSummary,
} from '../../db/queries';
import { BUSINESS_INIT_DAY, BUSINESS_OFFSET } from '../../domain/shared';
import { DEFAULT_PAGE, PAGINATION_SIZE } from '../../domain/stats';
import { getMilisecondDifference } from '../../utils/date-utils';
import { calculatePagination } from '../utils';
import type { ColdProductsQuery, RankingProductsQuery, SalesSummaryQuery } from '../validators';

export class StatsService {
  private getBussinessRange = (filters: SalesSummaryQuery) => {
    let period = 'year';
    let interval = '1 year';
    let start: Date = new Date(BUSINESS_INIT_DAY);
    let end: Date = new Date();
    let days: number | null = null;

    if (filters.view === 'annual') {
      period = 'month';
      interval = '1 month';
      start = new Date(`${filters.year}-01-01T00:00:00${BUSINESS_OFFSET}`);
      end = new Date(`${filters.year}-12-31T23:59:59.999${BUSINESS_OFFSET}`);
    } else if (filters.view === 'monthly') {
      period = 'day';
      interval = '1 day';
      start = new Date(`${filters.year}-${filters.month.toString().padStart(2, '0')}-01T00:00:00${BUSINESS_OFFSET}`);
      end = new Date(
        `${new Date(Date.UTC(filters.year, filters.month, 0, 23, 59, 59, 999))
          .toISOString()
          .replace('Z', BUSINESS_OFFSET)}`,
      );
    } else if (filters.view === 'range') {
      start = new Date(filters.startDate);
      end = new Date(filters.endDate);
      days = Math.ceil(Math.abs(getMilisecondDifference(filters.startDate, filters.endDate)) / (1000 * 60 * 60 * 24));
      period = days < 50 ? 'day' : days < 140 ? 'week' : 'month';
      interval = `1 ${period}`;
    }

    return {
      startDate: start,
      endDate: end,
      interval,
      period,
      days,
    };
  };

  inventory = async () => {
    const stats = await db.execute(inventoryQuery());
    return { _metadata: { date: new Date() }, inventory: stats.rows[0] };
  };

  rankingProducts = async (filters: RankingProductsQuery) => {
    const updateFilters: Required<RankingProductsQuery> = {
      ...filters,
      limit: filters.limit ?? PAGINATION_SIZE,
      page: filters.page ?? DEFAULT_PAGE,
    };

    const { startDate, endDate } = this.getBussinessRange(updateFilters);

    const count = await db.execute(countRankingProductsQuery({ start: startDate, end: endDate }));
    const { totalItems } = count.rows[0] as { totalItems: string };

    const pagination = calculatePagination(parseInt(totalItems), updateFilters.page, updateFilters.limit);
    if (pagination.totalItems === 0) {
      return {
        pagination,
        data: [],
      };
    }

    const stats = await db.execute(rankingProductsQuery({ ...updateFilters, start: startDate, end: endDate }));
    return {
      _metadata: {
        pagination,
        date: new Date(),
      },
      rankingProducts: stats.rows,
    };
  };

  coldProducts = async (filters: ColdProductsQuery) => {
    const updateFilters: Required<ColdProductsQuery> = {
      ...filters,
      limit: filters.limit ?? PAGINATION_SIZE,
      page: filters.page ?? DEFAULT_PAGE,
    };

    const count = await db.execute(countColdProductsQuery());
    const { totalItems } = count.rows[0] as { totalItems: string };

    const pagination = calculatePagination(parseInt(totalItems), updateFilters.page, updateFilters.limit);
    if (pagination.totalItems === 0) {
      return {
        pagination,
        data: [],
      };
    }

    const stats = await db.execute(coldProductsQuery(updateFilters));

    return {
      _metadata: {
        pagination,
        date: new Date(),
      },
      coldProducts: stats.rows,
    };
  };

  salesSummary = async (filters: SalesSummaryQuery) => {
    const { endDate, startDate, interval, period, days } = this.getBussinessRange(filters);

    const updateFilters = { ...filters, start: startDate, end: endDate };

    const [summary, channels, evolutionChart] = await Promise.all([
      db.execute(generalSalesSummary(updateFilters)),
      db.execute(salesChannelSummary(updateFilters)),
      db.execute(evolutionSalesChart({ ...updateFilters, period, interval })),
    ]);

    return {
      _metadata: {
        view: filters.view,
        range: { start: startDate, end: endDate },
        ...(days ? { daysDifference: days } : {}),
      },
      summary: summary.rows[0],
      distributionChart: { key: 'salesChannel', data: channels.rows },
      evolutionChart: { unit: period, data: evolutionChart.rows },
    };
  };
}
