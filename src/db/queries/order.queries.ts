import { sql } from 'drizzle-orm';
import { isOneOf, orderSortByMap } from '../../api/utils';
import { INVOICE_TYPE, ORDER_STATUS } from '../../domain/order';

export const searchOrdersQuery = (filters: {
  maxDate?: string;
  minDate?: string;
  channel?: string;
  invoiceType?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  search?: string;
  id?: string;
}) => {
  const searchTerm = filters.search ? `%${filters.search}%` : null;

  const conditions = [
    filters.minDate && sql`o.created_at >= ${filters.minDate}`,
    filters.maxDate && sql`o.created_at <= ${filters.maxDate}`,
    filters.channel && sql`o.sales_channel_id = ${+filters.channel}`,
    filters.invoiceType && isOneOf(filters.invoiceType, INVOICE_TYPE) && sql`o.invoice_type = ${filters.invoiceType}`,
    filters.status && isOneOf(filters.status, ORDER_STATUS) && sql`o.status = ${filters.status}`,
    filters.search &&
      sql`(
        o.invoice_code ILIKE ${searchTerm}
        OR c.bussiness_name ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
      )`,
    filters.id && sql`o.id = ${filters.id}`,
  ].filter(Boolean);

  return sql`
    WITH
      product_from_orders AS (
        SELECT
          op.order_id,
          json_agg(jsonb_build_object('variantId', pv.id, 'price', op.price::TEXT, 'quantity', op.quantity, 'code', pv.code, 'name', p."name", 'attribute', va."name", 'attributeValue', vav."value")) AS products
        FROM
          order_products op
          INNER JOIN product_variant pv ON op.product_variant_id = pv.id
          INNER JOIN product p ON pv.product_id = p.id
          LEFT JOIN product_variant_to_value pvv ON pv.id = pvv.product_variant_id
          LEFT JOIN variant_attribute va ON pvv.variant_attribute_id = va.id
          LEFT JOIN variant_attribute_value vav ON pvv.variant_attribute_value_id = vav.id
        GROUP BY
          op.order_id
      )
    SELECT
      o.id,
      o.invoice_type as "invoiceType",
      o.invoice_code as "invoiceCode",
      o.status,
      o.observation,
      o.total_sale as "totalSale",
        o.num_products as "numProducts",
      TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
      u.user_name as "createdBy",
      jsonb_build_object('id', c.id, 'email', c.email, 'phoneNumber1', c.phone_number1, 'contactName', c.contact_name, 'documentNumber', c.document_number, 'documentType', c.document_type, 'bussinessName', c.bussiness_name) AS client,
      s.channel,
      po.products
    FROM
      "order" o
      INNER JOIN client c ON o.client_id = c.id
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

export const resumeOrdersQuery = (filters: {
  maxDate?: string;
  minDate?: string;
  channel?: string;
  invoiceType?: string;
  status?: string;
  sortBy?: string;
  search?: string;
}) => {
  const searchTerm = filters.search ? `%${filters.search}%` : null;

  const conditions = [
    filters.minDate && sql`o.created_at >= ${filters.minDate}`,
    filters.maxDate && sql`o.created_at <= ${filters.maxDate}`,
    filters.channel && sql`o.sales_channel_id = ${+filters.channel}`,
    filters.invoiceType && isOneOf(filters.invoiceType, INVOICE_TYPE) && sql`o.invoice_type = ${filters.invoiceType}`,
    filters.status && isOneOf(filters.status, ORDER_STATUS) && sql`o.status = ${filters.status}`,
    filters.search &&
      sql`(
        o.invoice_code ILIKE ${searchTerm}
        OR c.bussiness_name ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
      )`,
  ].filter(Boolean);

  return sql`
    SELECT
      COUNT(o.id) AS "totalOrders"
    FROM
      "order" o
      INNER JOIN client c ON o.client_id = c.id
    WHERE o.deleted_at IS NULL
    ${conditions.length > 0 ? sql` AND `.append(sql.join(conditions, sql` AND `)) : sql.empty()}
    `;
};
