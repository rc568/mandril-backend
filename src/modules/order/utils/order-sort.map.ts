import { type SQL, sql } from 'drizzle-orm';

export const orderSortByMap: Record<string, SQL> = {
  default: sql`o.created_at DESC`,
  date_asc: sql`o.created_at ASC`,
  date_desc: sql`o.created_at DESC`,
  total_sale_asc: sql`o.total_sale ASC`,
  total_sale_desc: sql`o.total_sale DESC`,
};
