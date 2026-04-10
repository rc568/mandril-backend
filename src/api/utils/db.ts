import { type SQL, sql } from 'drizzle-orm';

export const createColumnReferences = <T extends Record<string, true>>(
  booleanColumns: T,
  tableColumns: Record<keyof T, any>,
): { [K in keyof T]: any } => {
  const result = {} as { [K in keyof T]: any };
  for (const key in booleanColumns) {
    result[key] = tableColumns[key];
  }

  return result;
};

export const productOrderByMap: Record<string, SQL> = {
  default: sql`prod.name ASC`,
  name_asc: sql`prod.name ASC`,
  name_desc: sql`prod.name DESC`,
};

export const orderSortByMap: Record<string, SQL> = {
  default: sql`o.created_at DESC`,
  date_asc: sql`o.created_at ASC`,
  date_desc: sql`o.created_at DESC`,
  total_sale_asc: sql`o.total_sale ASC`,
  total_sale_desc: sql`o.total_sale DESC`,
};

export const coldProductsOrderByMap: Record<string, SQL> = {
  name_asc: sql`nsp."productName" ASC`,
  name_desc: sql`nsp."productName" DESC`,
};

export const rankingProductsOrderByMap: Record<string, SQL> = {
  quantity_asc: sql`bsp."totalQuantitySold" ASC`,
  quantity_desc: sql`bsp."totalQuantitySold" DESC`,
  profit_asc: sql`bsp."totalProfit" ASC`,
  profit_desc: sql`bsp."totalProfit" DESC`,
  revenue_asc: sql`bsp."totalRevenue" ASC`,
  revenue_desc: sql`bsp."totalRevenue" DESC`,
};
