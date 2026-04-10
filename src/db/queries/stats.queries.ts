import { sql } from 'drizzle-orm';
import { coldProductsOrderByMap, rankingProductsOrderByMap } from '../../api/utils';
import { BUSINESS_TIMEZONE } from '../../domain/shared';
import type {
  ColdProducts,
  DateRangeBase,
  EvolutionSalesChart,
  GeneralSalesSummary,
  RankingProducts,
  SalesChannelSummary,
} from '../types/stats-queries.interface';

export const inventoryQuery = () => sql`
        SELECT
            count(*) AS "productsCount",
            SUM(CASE WHEN pv.is_active = true AND pv.deleted_at IS NULL THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN pv.is_active = false AND pv.deleted_at IS NULL THEN 1 ELSE 0 END) AS "nonActive",
            SUM(CASE WHEN pv.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
            SUM(CASE WHEN pv.quantity_in_stock = 0 THEN 1 ELSE 0 END) AS "outOfStock",
            SUM(pv.quantity_in_stock * pv.purchase_price) AS "totalCapital",
            SUM(pv.quantity_in_stock * pv.price) AS "totalRevenue"
        FROM
            product_variant pv;
        `;

export const rankingProductsQuery = (filters: RankingProducts) => {
  return sql`
        WITH
            variant_attribute AS (
                SELECT
                    pv.id AS variant_id,
                    json_agg(json_build_object('attribute', va."name", 'value', vav."value")) AS "variantAttributes"
                FROM
                    product_variant pv
                    INNER JOIN product_variant_to_value pvv ON pv.id = pvv.product_variant_id
                    LEFT JOIN variant_attribute_value vav ON pvv.variant_attribute_value_id = vav.id
                    LEFT JOIN variant_attribute va ON pvv.variant_attribute_id = va.id
                GROUP BY
                    pv.id
            ),
            best_selling_products AS (
                SELECT
                    pv.id AS "variantId",
                    pv.code AS "code",
                    p."name" AS "productName",
                    SUM(op.quantity) AS "totalQuantitySold",
                    SUM(op.quantity * op.price) AS "totalRevenue",
                    SUM(op.quantity * (op.price - op.purchase_price)) AS "totalProfit",
                    SUM(op.quantity * op.purchase_price) AS "totalCost"
                FROM
                    product_variant pv
                    INNER JOIN product p ON pv.product_id = p.id
                    INNER JOIN order_products op ON pv.id = op.product_variant_id
                    INNER JOIN "order" o ON op.order_id = o.id
                    WHERE o.created_at >= ${filters.start}
                      AND o.created_at <= ${filters.end}
                GROUP BY
                    pv.id,
                    pv.code,
                    p."name"
            )
        SELECT
            bsp.code,
            bsp."productName",
            COALESCE(bsp."totalQuantitySold", 0) AS "totalQuantitySold",
            COALESCE(bsp."totalRevenue", 0) AS "totalRevenue",
            COALESCE(bsp."totalProfit", 0) AS "totalProfit",
            COALESCE(bsp."totalCost", 0) AS "totalCost",
            COALESCE(va."variantAttributes", '[]'::json) AS "variantAttributes"
        FROM
            best_selling_products bsp
            LEFT JOIN variant_attribute va ON bsp."variantId" = va.variant_id
        ORDER BY ${rankingProductsOrderByMap[filters.orderBy]}
        LIMIT ${filters.limit}
        OFFSET ${(filters.page - 1) * filters.limit};
        `;
};

export const countRankingProductsQuery = ({ start, end }: DateRangeBase) => {
  return sql`
        SELECT
			COUNT (DISTINCT pv.id) as "totalItems"
        FROM
            product_variant pv
            INNER JOIN order_products op ON pv.id = op.product_variant_id
            INNER JOIN "order" o ON op.order_id = o.id
            WHERE o.created_at >= ${start}
              AND o.created_at <= ${end}
        `;
};

export const coldProductsQuery = ({ orderBy, limit, page }: ColdProducts) => {
  return sql`
        WITH
            variant_attribute AS (
                SELECT
                    pv.id AS variant_id,
                    json_agg(json_build_object('attribute', va."name", 'value', vav."value")) AS "variantAttributes"
                FROM
                    product_variant pv
                    INNER JOIN product_variant_to_value pvv ON pv.id = pvv.product_variant_id
                    LEFT JOIN variant_attribute_value vav ON pvv.variant_attribute_value_id = vav.id
                    LEFT JOIN variant_attribute va ON pvv.variant_attribute_id = va.id
                GROUP BY
                    pv.id
            ),
            not_selling_products AS (
                SELECT
                    pv.id AS "variantId",
                    pv.code AS "code",
                    p."name" AS "productName",
                    pv.quantity_in_stock AS "currentStock"
                FROM
                    product_variant pv
                    INNER JOIN product p ON pv.product_id = p.id
                    LEFT JOIN order_products op ON pv.id = op.product_variant_id
                WHERE
                    op.order_id IS NULL
                    AND pv.is_active = true
                    AND pv.deleted_at IS NULL
                GROUP BY
                    pv.id,
                    pv.code,
                    p."name"
            )
        SELECT
            nsp.code,
            nsp."productName",
            nsp."currentStock",
            COALESCE(va."variantAttributes", '[]'::json) AS "variantAttributes"
        FROM
            not_selling_products nsp
            LEFT JOIN variant_attribute va ON nsp."variantId" = va.variant_id
        ORDER BY ${coldProductsOrderByMap[orderBy]}
        LIMIT ${limit}
        OFFSET ${(page - 1) * limit};
        `;
};

export const countColdProductsQuery = () => {
  return sql`
            SELECT
                COUNT(*) as "totalItems"
            FROM
                product_variant pv
                LEFT JOIN order_products op ON pv.id = op.product_variant_id
            WHERE
                op.order_id IS NULL
                AND pv.is_active = true
                AND pv.deleted_at IS NULL; 
        `;
};

export const generalSalesSummary = (filters: GeneralSalesSummary) => {
  const conditions = [
    sql`o.created_at >= ${filters.start}`,
    sql`o.created_at <= ${filters.end}`,
    sql`o.deleted_at IS NULL`,
    filters.status && sql`o.status = ${filters.status}`,
    filters.channelId !== undefined && sql`o.sales_channel_id = ${filters.channelId}`,
  ].filter(Boolean);

  return sql`
        SELECT
	        COUNT(*) as "ordersCount",
	        COALESCE(SUM(o.total_sale), 0) as "totalRevenue",
	        COALESCE(SUM(o.total_cost), 0) as "totalCost",
	        COALESCE(SUM(o.total_sale) - SUM(o.total_cost), 0) as "totalProfit",
	        COALESCE((SUM(o.total_sale) - SUM(o.total_cost)) / NULLIF(SUM(o.total_sale), 0), 0) as "profitMargin"
        FROM "order" o
        ${sql` WHERE `.append(sql.join(conditions, sql` AND `))}
        LIMIT 10;
        `;
};

export const salesChannelSummary = (filters: SalesChannelSummary) => {
  const conditions = [
    sql`o.created_at >= ${filters.start}`,
    sql`o.created_at <= ${filters.end}`,
    sql`o.deleted_at IS NULL`,
    filters.status && sql`o.status = ${filters.status}`,
  ].filter(Boolean);

  return sql`
          SELECT
            sc.channel as "label",
            COUNT(*) AS "ordersCount",
            COALESCE(SUM(o.total_sale), 0) as "totalRevenue",
            COALESCE(SUM(o.total_cost), 0) as "totalCost",
            COALESCE(SUM(o.total_sale) - SUM(o.total_cost), 0) as "totalProfit"
          FROM "order" o
            INNER JOIN sales_channel sc ON o.sales_channel_id = sc.id
          ${sql` WHERE `.append(sql.join(conditions, sql` AND `))}
          GROUP BY sc.channel
          ORDER BY "totalRevenue" DESC
          LIMIT 10;
        `;
};

export const evolutionSalesChart = (filters: EvolutionSalesChart) => {
  const conditions = [
    sql`o.created_at >= ${filters.start}`,
    sql`o.created_at <= ${filters.end}`,
    sql`o.deleted_at IS NULL`,
    filters.status && sql`o.status = ${filters.status}`,
    filters.channelId !== undefined && sql`o.sales_channel_id = ${filters.channelId}`,
  ].filter(Boolean);

  return sql`
        WITH period_series AS (
          SELECT generate_series(
            ${filters.start},
            ${filters.end},
            ${filters.interval}::interval
          ) AT TIME ZONE ${BUSINESS_TIMEZONE} AS period
        )
        SELECT
          ps.period,
	        COUNT(o.id) as "ordersCount",
	        COALESCE(SUM(o.total_sale), 0) as "totalRevenue",
	        COALESCE(SUM(o.total_cost), 0) as "totalCost",
	        COALESCE(SUM(o.total_sale) - SUM(o.total_cost), 0) as "totalProfit",
	        COALESCE((SUM(o.total_sale) - SUM(o.total_cost)) / NULLIF(SUM(o.total_sale), 0), 0) as "profitMargin"
        FROM period_series ps
        LEFT JOIN "order" o 
          ON DATE_TRUNC(${filters.period}, o.created_at AT TIME ZONE ${BUSINESS_TIMEZONE})
          = ps.period
        ${sql` AND `.append(sql.join(conditions, sql` AND `))}
        GROUP BY ps.period
        ORDER BY ps.period ASC
        LIMIT 50;
        `;
};
