import { type SQL, sql } from 'drizzle-orm';

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
