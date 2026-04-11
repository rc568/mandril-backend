import { z } from '@/shared/libs';
import { paginationQuerySchema } from '@/shared/validators';
import { ORDER_STATUS } from '../order/domain';
import { COLD_PRODUCTS_ORDER_BY_OPTIONS, RANKING_PRODUCTS_ORDER_BY_OPTIONS } from './domain';

const rankingProductsOrderBySchema = z.enum(RANKING_PRODUCTS_ORDER_BY_OPTIONS).default('revenue_desc');
const coldProductOrderBySchema = z.enum(COLD_PRODUCTS_ORDER_BY_OPTIONS).default('name_asc');

export const rankingProductsQuerySchema = z
  .discriminatedUnion('view', [
    z.object({
      view: z.literal('historical'),
    }),
    z.object({
      view: z.literal('annual'),
      year: z.coerce.number().min(2020).max(2100),
    }),
    z.object({
      view: z.literal('monthly'),
      year: z.coerce.number().min(2020).max(2100),
      month: z.coerce.number().min(1).max(12),
    }),
  ])
  .and(paginationQuerySchema)
  .and(
    z.object({
      orderBy: rankingProductsOrderBySchema,
    }),
  );

export const coldProductsQuerySchema = z
  .object({
    orderBy: coldProductOrderBySchema,
  })
  .and(paginationQuerySchema);

export const salesSummaryQuerySchema = z
  .discriminatedUnion('view', [
    z.object({ view: z.literal('historical') }),
    z.object({
      view: z.literal('annual'),
      year: z.coerce.number().min(2020).max(2100),
    }),
    z.object({
      view: z.literal('monthly'),
      year: z.coerce.number().min(2020).max(2100),
      month: z.coerce.number().min(1).max(12),
    }),
    z.object({
      view: z.literal('range'),
      startDate: z.iso.datetime(),
      endDate: z.iso.datetime(),
    }),
  ])
  .and(
    z.object({
      channelId: z.coerce.number().int().min(1).optional(),
      status: z.enum(ORDER_STATUS).optional(),
    }),
  );

export type RankingProductsQuery = z.infer<typeof rankingProductsQuerySchema>;
export type ColdProductsQuery = z.infer<typeof coldProductsQuerySchema>;
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
