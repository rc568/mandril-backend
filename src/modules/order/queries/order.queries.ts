import { sql } from 'drizzle-orm';
import { BILLING_STATUS } from '@/shared/domain';
import { isOneOf } from '@/shared/utils';
import { ORDER_STATUS, RECEIPT_TYPE_FILTER } from '../domain';
import type { OrderQuerySchema } from '../schemas/order.schema';
import { orderSortByMap } from '../utils';

type OrderFilters = Omit<OrderQuerySchema, 'page' | 'limit'>;
type SearchOrdersQuery = OrderFilters & {
  id?: string;
  offset?: number;
  limit?: number;
};
type ResumeOrdersQuery = OrderFilters;

const buildBillingConditions = (filters: OrderFilters) => {
  const searchTerm = filters.search ? `%${filters.search}%` : null;

  const strictBillingConditions = [
    filters.receiptType &&
      filters.receiptType !== 'SIN COMPROBANTE' &&
      isOneOf(filters.receiptType, RECEIPT_TYPE_FILTER) &&
      sql`bo.billing_receipt_type = ${filters.receiptType}`,
    filters.billingStatus &&
      isOneOf(filters.billingStatus, BILLING_STATUS) &&
      sql`bo.status = ${filters.billingStatus}`,
  ].filter(Boolean);

  return [
    filters.search &&
      sql`(
          EXISTS (
            SELECT 1
            FROM billing_orders bo
            WHERE bo.order_id = o.id
              AND (bo.code ILIKE ${searchTerm} 
              OR bo.billing_name ILIKE ${searchTerm}
              OR bo.billing_document_number ILIKE ${searchTerm})
          )
          OR c.contact_name ILIKE ${searchTerm}
        )`,
    strictBillingConditions.length > 0 &&
      sql`EXISTS (
            SELECT 1
            FROM billing_orders bo
            WHERE bo.order_id = o.id AND ${sql.join(strictBillingConditions, sql` AND `)})`,
    filters.receiptType === 'SIN COMPROBANTE' &&
      sql`NOT EXISTS (SELECT 1 FROM billing_orders bo WHERE bo.order_id = o.id)`,
  ].filter(Boolean);
};

export const searchOrdersQuery = (filters: SearchOrdersQuery) => {
  const billingConditions = buildBillingConditions(filters);

  const conditions = [
    filters.minDate && sql`o.created_at >= ${filters.minDate}`,
    filters.maxDate && sql`o.created_at <= ${filters.maxDate}`,
    filters.channel && sql`o.sales_channel_id = ${+filters.channel}`,
    filters.status && isOneOf(filters.status, ORDER_STATUS) && sql`o.status = ${filters.status}`,
    filters.id && sql`o.id = ${filters.id}`,
    ...billingConditions,
  ].filter(Boolean);

  return sql`
    WITH 
      variant_attributes AS (
        SELECT
          pvtv.product_variant_id AS "variantId",
          json_agg(json_build_object('value', vav.value, 'valueId', vav.id, 'attribute', va.name, 'attributeId', vav.variant_attribute_id)) AS "variantAttributes"
        FROM
          product_variant_to_value pvtv
          JOIN variant_attribute_value vav ON pvtv.variant_attribute_value_id = vav.id
          JOIN variant_attribute va ON vav.variant_attribute_id = va.id
        GROUP BY
          pvtv.product_variant_id
      ),
      product_from_orders AS (
        SELECT
          op.order_id,
          json_agg(jsonb_build_object('variantId', pv.id, 'type', op.type, 'price', op.price::TEXT, 'quantity', op.quantity, 'code', pv.code, 'name', p."name", 'variantAttributes', COALESCE(va."variantAttributes", '[]'::json))) AS products
        FROM
          order_products op
          INNER JOIN product_variant pv ON op.product_variant_id = pv.id
          INNER JOIN product p ON pv.product_id = p.id
          LEFT JOIN variant_attributes va ON pv.id = va."variantId"
        GROUP BY
          op.order_id
      ),
      billing_orders_agg AS (
	   	  SELECT
			    bo.order_id,
			    json_agg(jsonb_build_object('id', bo.id, 'code', bo.code, 'status', bo.status, 'billingReceiptType', bo.billing_receipt_type, 'billingDocumentNumber', bo.billing_document_number, 'billingDocumentNumberType', bo.billing_document_number_type, 'billingName', bo.billing_name, 'amount', bo.amount::text, 'createdAt', TO_CHAR(bo.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'createdBy', u.user_name)) AS "billing_orders" 
		    FROM billing_orders bo
        INNER JOIN "user" u ON bo.created_by = u.id
		    GROUP BY bo.order_id
       )
    SELECT
      o.id,
      o.status,
      o.type,
      o.related_order_id as "relatedOrderId",
      o.observation,
      o.total_sale as "totalSale",
      o.total_cost as "totalCost",
      o.num_products as "numProducts",
      TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
      u.user_name as "createdBy",
      jsonb_build_object('id', c.id, 'email', c.email, 'phoneNumber1', c.phone_number1, 'contactName', c.contact_name, 'documentNumber', c.document_number, 'documentNumberType', c.document_number_type) AS client,
      COALESCE(bog.billing_orders, '[]'::json) AS billing,
      s.channel,
      po.products
    FROM
      "order" o
      INNER JOIN client c ON o.client_id = c.id
      LEFT JOIN billing_orders_agg bog ON o.id = bog.order_id
      INNER JOIN sales_channel s ON o.sales_channel_id = s.id
      INNER JOIN product_from_orders po ON o.id = po.order_id
      INNER JOIN "user" u ON o.created_by = u.id
    WHERE o.deleted_at IS NULL
    ${conditions.length > 0 ? sql` AND `.append(sql.join(conditions, sql` AND `)) : sql.empty()}
    ${
      filters.sortBy && orderSortByMap[filters.sortBy]
        ? sql`ORDER BY ${orderSortByMap[filters.sortBy]}`
        : sql`ORDER BY ${orderSortByMap.default}`
    }
    ${filters.limit ? sql`LIMIT ${filters.limit}` : sql.empty()}
    ${filters.offset ? sql`OFFSET ${filters.offset}` : sql.empty()}
    `;
};

export const resumeOrdersQuery = (filters: ResumeOrdersQuery) => {
  const billingConditions = buildBillingConditions(filters);

  const conditions = [
    filters.minDate && sql`o.created_at >= ${filters.minDate}`,
    filters.maxDate && sql`o.created_at <= ${filters.maxDate}`,
    filters.channel && sql`o.sales_channel_id = ${+filters.channel}`,
    filters.status && isOneOf(filters.status, ORDER_STATUS) && sql`o.status = ${filters.status}`,
    ...billingConditions,
  ].filter(Boolean);

  return sql`
    SELECT
      COUNT(*) AS "totalOrders"
    FROM
      "order" o
      INNER JOIN client c ON o.client_id = c.id
    WHERE o.deleted_at IS NULL
    ${conditions.length > 0 ? sql` AND `.append(sql.join(conditions, sql` AND `)) : sql.empty()}
    `;
};
